const test = require('node:test');
const assert = require('node:assert/strict');
const { getTrustedCloudBaseIdentity } = require('../cloudbaseIdentity');
const { validateProtocolCommand, getTripVehicleIdentity } = require('../commandPolicy');
const { assertStagingMqttConfig } = require('../stagingMqttPolicy');
const { resolveMqttRuntimeConfig, isCommandRuntimeEnabled, getCommandRuntimeBlockedReasons } = require('../mqttRuntimePolicy');
const { speedToKph } = require('../telemetryPolicy');
const fs = require('node:fs');
const path = require('node:path');

test('identity ignores client fallback headers', () => {
  const previous = process.env.TCB_ENV; process.env.TCB_ENV = 'omo-dev';
  assert.equal(getTrustedCloudBaseIdentity({ headers: { 'x-openid': 'forged', openid: 'forged' } }), null);
  assert.equal(getTrustedCloudBaseIdentity({ headers: { 'x-wx-openid': 'trusted_user_123', 'x-wx-env': 'wrong-env', 'x-wx-source': 'wx_client' } }), null);
  assert.equal(getTrustedCloudBaseIdentity({ headers: { 'x-wx-openid': 'trusted_user_123', 'x-wx-env': 'omo-dev', 'x-wx-source': 'public' } }), null);
  assert.equal(getTrustedCloudBaseIdentity({ headers: { 'x-wx-openid': 'trusted_user_123', 'x-wx-env': 'omo-dev', 'x-wx-source': 'wx_devtools' } }).source, 'wx_devtools');
  assert.deepEqual(getTrustedCloudBaseIdentity({ headers: { 'x-wx-openid': 'trusted_user_123', 'x-wx-env': 'omo-dev', 'x-wx-source': 'wx_client' } }), { openid: 'trusted_user_123', env: 'omo-dev', source: 'wx_client', appid: '' });
  if (previous === undefined) delete process.env.TCB_ENV; else process.env.TCB_ENV = previous;
});

test('production identity rejects developer-tools source', () => {
  const previousEnv = process.env.TCB_ENV;
  const previousDevtools = process.env.ALLOW_WX_DEVTOOLS;
  process.env.TCB_ENV = 'omo-prod';
  process.env.ALLOW_WX_DEVTOOLS = 'false';
  try {
    const headers = { 'x-wx-openid': 'trusted_user_123', 'x-wx-env': 'omo-prod' };
    assert.equal(getTrustedCloudBaseIdentity({ headers: { ...headers, 'x-wx-source': 'wx_devtools' } }), null);
    assert.equal(getTrustedCloudBaseIdentity({ headers: { ...headers, 'x-wx-source': 'wx_client' } }).source, 'wx_client');
  } finally {
    if (previousEnv === undefined) delete process.env.TCB_ENV; else process.env.TCB_ENV = previousEnv;
    if (previousDevtools === undefined) delete process.env.ALLOW_WX_DEVTOOLS; else process.env.ALLOW_WX_DEVTOOLS = previousDevtools;
  }
});

test('command policy rejects arbitrary message types and fields', () => {
  assert.match(validateProtocolCommand('OMO_1', 'rawTopic', { ugvID: 'OMO_1' }), /not allowed/);
  assert.match(validateProtocolCommand('OMO_1', 'ugvSetMode', { ugvID: 'OTHER', mode: 1, speedMode: 2 }), /must match/);
  assert.match(validateProtocolCommand('OMO_1', 'ugvSetMode', { ugvID: 'OMO_1', mode: 1, speedMode: 2, topic: 'x' }), /unknown fields/);
  assert.equal(validateProtocolCommand('OMO_1', 'ugvSetMode', { ugvID: 'OMO_1', mode: 1, speedMode: 2 }), '');
});

test('auto driving policy bounds coordinates and HTTPS uploads', () => {
  assert.match(validateProtocolCommand('OMO_1', 'autoDriving', { ugvID: 'OMO_1', opt_mode: 1, longitude: 200, latitude: 28, upload: 0 }), /longitude/);
  assert.match(validateProtocolCommand('OMO_1', 'autoDriving', { ugvID: 'OMO_1', opt_mode: 1, longitude: 112, latitude: 28, upload: 1, file_url: 'http://unsafe' }), /HTTPS/);
  assert.equal(validateProtocolCommand('OMO_1', 'autoDriving', { ugvID: 'OMO_1', opt_mode: 1, longitude: 112, latitude: 28, upload: 0 }), '');
});

test('trip ownership identity is deterministic', () => {
  assert.equal(getTripVehicleIdentity({ ugvID: 'OMO_1' }), 'OMO_1');
  assert.equal(getTripVehicleIdentity({ vehicleId: 'veh-2' }), 'veh-2');
});

test('move ratios are numeric protocol percentages within -1..1', () => {
  const command = { ugvID: 'OMO_1', speed: 1, angle: -1 };
  assert.equal(validateProtocolCommand('OMO_1', 'ugvSetMove', command), '');
  assert.match(validateProtocolCommand('OMO_1', 'ugvSetMove', { ...command, speed: 1.01 }), /speed/);
  assert.match(validateProtocolCommand('OMO_1', 'ugvSetMove', { ...command, angle: -1.01 }), /angle/);
  assert.match(validateProtocolCommand('OMO_1', 'ugvSetMove', { ...command, speed: '1' }), /speed/);
});

test('staging mps telemetry is explicitly converted for the Web kph field', () => {
  assert.equal(speedToKph(2, 'mps'), 7.2);
  assert.equal(speedToKph(2, 'kph'), 2);
  assert.equal(speedToKph('2', 'mps'), null);
  assert.equal(speedToKph(2, 'unknown'), null);
});

test('Bridge and staging simulator connect with MQTT 5', () => {
  const bridge = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const simulator = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'vehicle_simulator.js'), 'utf8');
  assert.match(bridge, /mqtt\.connect\(MQTT_URL,\s*\{\s*protocolVersion:\s*5/);
  assert.match(simulator, /mqtt\.connect\(config\.url,\s*\{\s*protocolVersion:\s*5/);
});

test('staging Bridge rejects production, plaintext Broker and wrong Client ID', () => {
  const config = {
    OMO_STAGING_MODE: 'true', TCB_ENV: 'omo-platform-staging-d5a30d0fd8f',
    MQTT_URL: 'mqtts://staging.example.test:8883', MQTT_USERNAME: 'test-user',
    MQTT_PASSWORD: 'test-password', MQTT_CLIENT_ID: 'omo-mqtt-bridge-staging',
    MQTT_TELEMETRY_SPEED_UNIT: 'mps',
  };
  assert.doesNotThrow(() => assertStagingMqttConfig(config));
  assert.throws(() => assertStagingMqttConfig({ ...config, TCB_ENV: 'omo-mqtt-prod-2g4zisao87d6ec54' }), /生产/);
  assert.throws(() => assertStagingMqttConfig({ ...config, TCB_ENV: 'other-staging-env' }), /非本次购买/);
  assert.throws(() => assertStagingMqttConfig({ ...config, MQTT_URL: 'mqtt://staging.example.test:1883' }), /TLS/);
  assert.throws(() => assertStagingMqttConfig({ ...config, MQTT_CLIENT_ID: 'other-client' }), /Client ID/);
  assert.throws(() => assertStagingMqttConfig({ ...config, MQTT_TELEMETRY_SPEED_UNIT: 'kph' }), /mps/);
});

test('vendor real profile boots blocked without credentials, topics or commands', () => {
  const config = resolveMqttRuntimeConfig({
    OMO_STAGING_MODE: 'true',
    TCB_ENV: 'omo-platform-staging-d5a30d0fd8f',
    MQTT_PROFILE: 'vendor_real',
    MQTT_CONNECTION_ENABLED: 'false',
    MQTT_COMMANDS_ENABLED: 'false',
    MQTT_TELEMETRY_SPEED_UNIT: 'unknown',
    MQTT_COORD_SYSTEM: 'unknown',
    ALLOW_INSECURE_MQTT: 'false'
  });
  assert.equal(config.connectionEnabled, false);
  assert.equal(config.commandsEnabled, false);
  assert.deepEqual(config.subscribeTopics, []);
  assert.deepEqual(config.allowedUgvIds, []);
  assert.ok(config.blockedReasons.includes('connection_disabled'));
  assert.ok(config.blockedReasons.includes('authorized_vehicle_ids_missing'));
  assert.ok(config.blockedReasons.includes('broker_credentials_missing'));
  assert.equal(isCommandRuntimeEnabled(config), false);
});

test('vendor real profile uses exact vehicle topics and requires explicit plaintext approval', () => {
  const base = {
    OMO_STAGING_MODE: 'true',
    TCB_ENV: 'omo-platform-staging-d5a30d0fd8f',
    MQTT_PROFILE: 'vendor_real',
    MQTT_CONNECTION_ENABLED: 'true',
    MQTT_COMMANDS_ENABLED: 'false',
    MQTT_ALLOWED_UGV_IDS: 'OMO_REAL_01,OMO_REAL_02',
    MQTT_URL: 'mqtt://vendor.example.test:1883',
    MQTT_USERNAME: 'local-secret-user',
    MQTT_PASSWORD: 'local-secret-password',
    MQTT_TELEMETRY_SPEED_UNIT: 'unknown',
    MQTT_COORD_SYSTEM: 'unknown'
  };
  assert.throws(() => resolveMqttRuntimeConfig(base), /ALLOW_INSECURE_MQTT/);
  const config = resolveMqttRuntimeConfig({ ...base, ALLOW_INSECURE_MQTT: 'true' });
  assert.equal(config.connectionEnabled, true);
  assert.deepEqual(config.subscribeTopics, [
    'ugv/OMO_REAL_01/device', 'ugv/OMO_REAL_01/response',
    'ugv/OMO_REAL_02/device', 'ugv/OMO_REAL_02/response'
  ]);
  assert.equal(config.allowedCommandTypes.has('ugvSetMove'), false);
});

test('vendor real commands require supervision and a live control window', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const base = {
    OMO_STAGING_MODE: 'true', TCB_ENV: 'omo-platform-staging-d5a30d0fd8f',
    MQTT_PROFILE: 'vendor_real', MQTT_CONNECTION_ENABLED: 'true', MQTT_COMMANDS_ENABLED: 'true',
    MQTT_ALLOWED_UGV_IDS: 'OMO_REAL_01', MQTT_URL: 'mqtts://vendor.example.test:8883',
    MQTT_USERNAME: 'local-secret-user', MQTT_PASSWORD: 'local-secret-password',
    MQTT_TELEMETRY_SPEED_UNIT: 'mps', MQTT_COORD_SYSTEM: 'wgs84',
    CONTROL_WINDOW_EXPIRES_AT: future
  };
  const unsupervised = resolveMqttRuntimeConfig(base);
  assert.equal(isCommandRuntimeEnabled(unsupervised), false);
  assert.ok(getCommandRuntimeBlockedReasons(unsupervised).includes('vehicle_supervision_not_confirmed'));
  const supervised = resolveMqttRuntimeConfig({ ...base, VEHICLE_SUPERVISION_CONFIRMED: 'true' });
  assert.equal(isCommandRuntimeEnabled(supervised), true);
  assert.equal(isCommandRuntimeEnabled(supervised, Date.now() + 120_000), false);
  assert.throws(() => resolveMqttRuntimeConfig({ ...base, TCB_ENV: 'omo-mqtt-prod-2g4zisao87d6ec54' }), /生产/);
});
