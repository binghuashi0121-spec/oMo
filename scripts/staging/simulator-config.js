function resolveSimulatorConfig(environment = process.env) {
  const url = String(environment.MQTT_SIMULATOR_URL || '').trim();
  const username = String(environment.MQTT_SIMULATOR_USERNAME || '').trim();
  const password = String(environment.MQTT_SIMULATOR_PASSWORD || '');
  const deviceId = String(environment.MQTT_SIMULATOR_DEVICE_ID || 'OMO_STAGING_0001').trim();
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('模拟器需要有效的 MQTT_SIMULATOR_URL'); }
  if (!['mqtts:', 'wss:'].includes(parsed.protocol)) throw new Error('模拟器只允许 mqtts:// 或 wss:// TLS Broker');
  if (parsed.username || parsed.password) throw new Error('Broker 凭据必须通过独立环境变量传入，不能写在 URL 中');
  if (!username || !password) throw new Error('模拟器缺少独立测试 Broker 账号或密码');
  if (deviceId !== 'OMO_STAGING_0001') throw new Error('模拟器车辆 ID 必须与 staging 测试车辆 OMO_STAGING_0001 一致');
  return {
    url, username, password, deviceId,
    clientId: `omo-simulator-staging-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

module.exports = { resolveSimulatorConfig };
