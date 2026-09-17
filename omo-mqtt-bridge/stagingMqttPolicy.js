function assertStagingMqttConfig(environment = process.env) {
  if (environment.OMO_STAGING_MODE !== 'true') return;
  const envId = String(environment.TCB_ENV || '').trim();
  if (envId !== 'omo-platform-staging-d3acae2142c' || /prod/i.test(envId)) {
    throw new Error('staging Bridge 不允许缺失、生产或非本次购买的 CloudBase 环境 ID');
  }
  let broker;
  try { broker = new URL(String(environment.MQTT_URL || '')); }
  catch { throw new Error('staging Bridge 缺少有效的 MQTT_URL'); }
  if (!['mqtts:', 'wss:'].includes(broker.protocol)) throw new Error('staging Bridge 必须使用 TLS Broker');
  if (broker.username || broker.password) throw new Error('Broker 凭据不能放在 MQTT_URL 中');
  if (!environment.MQTT_USERNAME || !environment.MQTT_PASSWORD) throw new Error('staging Bridge 缺少独立 Broker 凭据');
  if (environment.MQTT_CLIENT_ID !== 'omo-mqtt-bridge-staging') throw new Error('staging Bridge Client ID 不匹配');
}

module.exports = { assertStagingMqttConfig };
