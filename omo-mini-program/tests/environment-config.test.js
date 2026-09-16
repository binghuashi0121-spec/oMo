const test = require('node:test');
const assert = require('node:assert/strict');
const { ENVIRONMENT_DEFINITIONS, detectEnvVersion, resolveRuntimeEnvironment } = require('../config/environments');

test('maps WeChat versions to isolated logical environments', () => {
  assert.equal(ENVIRONMENT_DEFINITIONS.develop.name, 'development');
  assert.equal(ENVIRONMENT_DEFINITIONS.trial.name, 'staging');
  assert.equal(ENVIRONMENT_DEFINITIONS.release.name, 'production');
  assert.notEqual(ENVIRONMENT_DEFINITIONS.trial.containerServiceName, ENVIRONMENT_DEFINITIONS.release.containerServiceName);
});

test('detects only known envVersion values', () => {
  assert.equal(detectEnvVersion({ getAccountInfoSync: () => ({ miniProgram: { envVersion: 'trial' } }) }), 'trial');
  assert.throws(() => detectEnvVersion({ getAccountInfoSync: () => ({ miniProgram: { envVersion: 'preview' } }) }), /不支持/);
});

test('blocks unconfigured environments instead of falling back to production', () => {
  assert.throws(() => resolveRuntimeEnvironment('develop'), /development 环境未配置/);
  assert.throws(() => resolveRuntimeEnvironment('trial'), /staging 环境未配置/);
  assert.equal(resolveRuntimeEnvironment('release').cloudEnvId, 'omo-mqtt-prod-2g4zisao87d6ec54');
});

test('resolves an explicitly configured staging environment', () => {
  const definitions = { trial: { name: 'staging', cloudEnvId: 'omo-platform-staging-123', containerServiceName: 'mqtt-bridge-staging', containerPathPrefix: '/mqtt' } };
  assert.deepEqual(resolveRuntimeEnvironment('trial', definitions), { envVersion: 'trial', ...definitions.trial });
});
