const test = require('node:test');
const assert = require('node:assert/strict');
const { validateStagingConfig } = require('./check-config');
const manifest = require('../../deploy/staging/manifest.json');
const { resolveSimulatorConfig } = require('./simulator-config');
const { assertTarget, collections, indexSpecs, seeds, indexDefinition, verify } = require('./provision-nosql');
const { validatePassword, createStagingAdmin } = require('./bootstrap-admin-cli');
const { resolveBrokerSmokeConfig } = require('./broker-smoke');

const valid = {
  phase: 'deploy', environmentId: manifest.environmentId,
  environmentName: 'omo-platform-staging', brokerUrl: 'mqtts://staging.example.test:8883',
  webOrigin: 'https://staging.example.test',
  tcbEnv: manifest.environmentId, cloudbaseEnvId: manifest.environmentId,
};

test('manifest matches the repository and requires no cloud values for preparation', () => {
  assert.deepEqual(validateStagingConfig(manifest), []);
});

test('deployment rejects missing, production and mismatched environments', () => {
  assert.match(validateStagingConfig(manifest, { phase: 'deploy' }).join(' '), /缺少 staging 环境 ID/);
  assert.match(validateStagingConfig(manifest, { ...valid, environmentName: '' }).join(' '), /显示名称/);
  assert.match(validateStagingConfig(manifest, { ...valid, environmentId: manifest.forbiddenEnvironmentId }).join(' '), /生产环境/);
  assert.match(validateStagingConfig(manifest, { ...valid, environmentId: 'other-staging-env' }).join(' '), /已购买的 staging/);
  assert.match(validateStagingConfig(manifest, { ...valid, tcbEnv: 'another-env' }).join(' '), /TCB_ENV/);
});

test('deployment requires TLS broker and HTTPS Web origin', () => {
  assert.match(validateStagingConfig(manifest, { ...valid, brokerUrl: 'mqtt://example.test:1883' }).join(' '), /TLS/);
  assert.match(validateStagingConfig(manifest, { ...valid, webOrigin: 'http://example.test' }).join(' '), /HTTPS/);
  assert.deepEqual(validateStagingConfig(manifest, valid), []);
});

test('trial must resolve to the same staging environment', () => {
  assert.match(validateStagingConfig(manifest, { ...valid, phase: 'trial', trialEnvironmentId: '' }).join(' '), /trial/);
  assert.deepEqual(validateStagingConfig(manifest, { ...valid, phase: 'trial', trialEnvironmentId: valid.environmentId }), []);
});

test('simulator only connects to the isolated TLS Broker and staging vehicle', () => {
  const config = {
    MQTT_SIMULATOR_URL: 'mqtts://staging.example.test:8883',
    MQTT_SIMULATOR_USERNAME: 'test-user', MQTT_SIMULATOR_PASSWORD: 'test-password',
    MQTT_SIMULATOR_DEVICE_ID: 'OMO_STAGING_0001',
  };
  assert.match(resolveSimulatorConfig(config).clientId, /^omo-simulator-staging-/);
  assert.throws(() => resolveSimulatorConfig({ ...config, MQTT_SIMULATOR_URL: 'mqtt://staging.example.test:1883' }), /TLS/);
  assert.throws(() => resolveSimulatorConfig({ ...config, MQTT_SIMULATOR_DEVICE_ID: 'OMO_0008' }), /staging 测试车辆/);
});

test('NoSQL provisioning is pinned to the new document database environment', () => {
  const config = {
    OMO_STAGING_ENV_ID: manifest.environmentId,
    OMO_STAGING_ENV_NAME: manifest.environmentName,
    TCB_ENV: manifest.environmentId,
    CLOUDBASE_ENV_ID: manifest.environmentId,
  };
  assert.doesNotThrow(() => assertTarget(config));
  assert.throws(() => assertTarget({ ...config, TCB_ENV: 'omo-platform-staging-d3acae2142c' }), /环境配置/);
  assert.equal(collections.length, 16);
  assert.equal(indexSpecs.length, 22);
  assert.equal(seeds.length, 3);
  assert.deepEqual(indexDefinition({ collection: 'vehicles', fields: [{ field: 'ugvID', order: 'asc' }] }),
    { key: { ugvID: 1 }, name: 'ugvID_1' });
});

test('NoSQL verification is read-only and rejects a missing unique index', () => {
  const calls = [];
  const run = (_table, command, type) => {
    calls.push(type);
    if (command.listCollections) return collections.map((name) => ({ name }));
    if (command.listIndexes) {
      return indexSpecs.filter((spec) => spec.collection === command.listIndexes)
        .map((spec) => ({ ...indexDefinition(spec), unique: Boolean(spec.unique) }));
    }
    if (command.find) return [{ _id: command.filter._id, ugvID: command.filter._id, scenicAreaId: 'tianmashan' }];
    throw new Error('unexpected write');
  };
  assert.doesNotThrow(() => verify(run));
  assert.ok(calls.every((type) => type === 'COMMAND' || type === 'QUERY' || type === undefined));
  const badRun = (table, command, type) => {
    const result = run(table, command, type);
    if (command.listIndexes && table === 'admin_users') return result.map((item) => ({ ...item, unique: false }));
    return result;
  };
  assert.throws(() => verify(badRun), /唯一索引失效/);
});

test('one-time staging admin stores a hash and forces the first password change', async () => {
  const records = [];
  const commands = [];
  const run = (_table, command, type) => {
    commands.push(type);
    if (type === 'INSERT') { records.push(command.documents[0]); return []; }
    return records.filter((row) => !command.filter._id || row._id === command.filter._id);
  };
  const result = await createStagingAdmin(run, async () => 'Local-Only-Initial-A1', async () => '$argon2id$test-hash',
    { id: 'test-admin-id', now: '2026-09-17T00:00:00.000Z' });
  assert.equal(result.username, 'staging_admin');
  assert.equal(records.length, 1);
  assert.equal(records[0].passwordHash, '$argon2id$test-hash');
  assert.equal(records[0].mustChangePassword, true);
  assert.equal(records[0].role, 'super_admin');
  assert.deepEqual(commands, ['QUERY', 'INSERT', 'QUERY']);
  await assert.rejects(createStagingAdmin(run, async () => 'Local-Only-Initial-A1', async () => 'hash'), /已有管理员/);
  assert.equal(records.length, 1);
});

test('staging admin rejects weak or mismatched passwords before any write', async () => {
  assert.throws(() => validatePassword('short'), /12–128/);
  const calls = [];
  const run = (_table, _command, type) => { calls.push(type); return []; };
  let readCount = 0;
  await assert.rejects(createStagingAdmin(run, async () => (++readCount === 1 ? 'Local-Only-Initial-A1' : 'Local-Only-Initial-B2'),
    async () => 'hash'), /不一致/);
  assert.deepEqual(calls, ['QUERY']);
});

test('Broker smoke configuration requires separate credentials and the same TLS endpoint', () => {
  const config = {
    MQTT_URL: 'mqtts://staging.example.test:8883', MQTT_USERNAME: 'bridge-staging', MQTT_PASSWORD: 'bridge-test-password',
    MQTT_SIMULATOR_URL: 'mqtts://staging.example.test:8883',
    MQTT_SIMULATOR_USERNAME: 'simulator-staging', MQTT_SIMULATOR_PASSWORD: 'simulator-test-password',
  };
  assert.equal(resolveBrokerSmokeConfig(config).host, 'staging.example.test');
  assert.throws(() => resolveBrokerSmokeConfig({ ...config, MQTT_URL: 'mqtt://staging.example.test:1883' }), /mqtts/);
  assert.throws(() => resolveBrokerSmokeConfig({ ...config, MQTT_URL: 'mqtts://user:pass@staging.example.test:8883' }), /mqtts/);
  assert.throws(() => resolveBrokerSmokeConfig({ ...config, MQTT_SIMULATOR_USERNAME: 'bridge-staging' }), /不同账号/);
  assert.throws(() => resolveBrokerSmokeConfig({ ...config, MQTT_URL: 'mqtts://prod.example.test:8883',
    MQTT_SIMULATOR_URL: 'mqtts://prod.example.test:8883' }), /生产/);
});
