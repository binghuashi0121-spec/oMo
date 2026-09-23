const { resolveMqttRuntimeConfig } = require('./mqttRuntimePolicy');

function assertStagingMqttConfig(environment = process.env) {
  if (environment.OMO_STAGING_MODE !== 'true') return null;
  return resolveMqttRuntimeConfig(environment);
}

module.exports = { assertStagingMqttConfig };
