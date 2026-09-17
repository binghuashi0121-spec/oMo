const test = require('node:test');
const assert = require('node:assert/strict');
const { validateStagingConfig } = require('./check-config');
const manifest = require('../../deploy/staging/manifest.json');
const { resolveSimulatorConfig } = require('./simulator-config');
const { assertTarget, collections, indexSpecs, seeds, indexDefinition } = require('./provision-nosql');

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
