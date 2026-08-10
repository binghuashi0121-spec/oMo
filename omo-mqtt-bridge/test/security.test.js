const test = require('node:test');
const assert = require('node:assert/strict');
const { getTrustedCloudBaseIdentity } = require('../cloudbaseIdentity');
const { validateProtocolCommand, getTripVehicleIdentity } = require('../commandPolicy');

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
