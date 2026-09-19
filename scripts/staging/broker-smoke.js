const net = require('node:net');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');

function resolveBrokerSmokeConfig(env = process.env) {
  let url;
  try { url = new URL(String(env.MQTT_URL || '')); }
  catch { throw new Error('缺少有效的 MQTT_URL'); }
  if (url.protocol !== 'mqtts:' || url.port !== '8883' || !url.hostname || url.username || url.password) {
    throw new Error('测试 Broker 必须是无内嵌凭据的 mqtts://<host>:8883');
  }
  if (/prod/i.test(url.hostname) || ['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('不能使用生产或本机 Broker 地址');
  }
  if (env.MQTT_SIMULATOR_URL !== url.href || !env.MQTT_USERNAME || !env.MQTT_PASSWORD ||
      !env.MQTT_SIMULATOR_USERNAME || !env.MQTT_SIMULATOR_PASSWORD ||
      env.MQTT_USERNAME === env.MQTT_SIMULATOR_USERNAME) {
    throw new Error('Bridge 与模拟器必须使用同一独立 TLS 地址、不同账号和各自密码');
  }
  return { url: url.href, host: url.hostname, bridgeUsername: env.MQTT_USERNAME,
    bridgePassword: env.MQTT_PASSWORD, simulatorUsername: env.MQTT_SIMULATOR_USERNAME,
    simulatorPassword: env.MQTT_SIMULATOR_PASSWORD };
}

async function checkPlaintextPortClosed(host) {
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: 1883 });
    socket.setTimeout(2500);
    socket.once('connect', () => { socket.destroy(); reject(new Error('1883 明文端口可连接；停止测试并确认 Broker 类型')); });
    socket.once('error', () => resolve());
    socket.once('timeout', () => { socket.destroy(); resolve(); });
  });
}

async function runSmoke(config, mqtt) {
  const clients = [];
  const connect = (clientId, username, password) => new Promise((resolve, reject) => {
    const client = mqtt.connect(config.url, { clientId, username, password, protocolVersion: 5,
      rejectUnauthorized: true, reconnectPeriod: 0, connectTimeout: 5000, clean: true });
    clients.push(client);
    client.on('error', () => {});
    const timer = setTimeout(() => reject(new Error(`${clientId} 连接超时`)), 6500);
    client.once('connect', () => { clearTimeout(timer); resolve(client); });
    client.once('error', (error) => { clearTimeout(timer); reject(new Error(`${clientId} 连接失败：${error.message}`)); });
  });
  const subscribe = (client, topic) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`订阅超时：${topic}`)), 5000);
    client.subscribe(topic, { qos: 1 }, (error, granted) => {
      clearTimeout(timer);
      if (error) return reject(error);
      if (!granted?.length || granted.some((item) => item.qos >= 128)) return reject(new Error(`订阅被拒绝：${topic}`));
      resolve();
    });
  });
  const publish = (client, topic, payload) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`发布超时：${topic}`)), 5000);
    client.publish(topic, payload, { qos: 1, retain: false }, (error) => {
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    });
  });
  const waitMessage = (client, topic, marker, timeoutMs = 4000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { client.removeListener('message', onMessage); reject(new Error(`未收到 ${topic} 的测试消息`)); }, timeoutMs);
    const onMessage = (receivedTopic, payload) => {
      if (receivedTopic !== topic || !payload.toString().includes(marker)) return;
      clearTimeout(timer); client.removeListener('message', onMessage); resolve();
    };
    client.on('message', onMessage);
  });
  const vehicle = 'OMO_STAGING_0001';
  const up = `ugv/${vehicle}/device`, response = `ugv/${vehicle}/response`, down = `ugv/${vehicle}/platform`;
  try {
    const bridge = await connect('omo-mqtt-bridge-staging', config.bridgeUsername, config.bridgePassword);
    const simulator = await connect(`omo-simulator-staging-smoke-${randomUUID()}`, config.simulatorUsername, config.simulatorPassword);
    await subscribe(bridge, 'ugv/+/device');
    await subscribe(bridge, 'ugv/+/response');
    await subscribe(simulator, down);
    for (const [sender, receiver, topic] of [[simulator, bridge, up], [simulator, bridge, response], [bridge, simulator, down]]) {
      const marker = randomUUID();
      const received = waitMessage(receiver, topic, marker);
      await publish(sender, topic, JSON.stringify({ stagingSmoke: marker }));
      await received;
    }
    const denied = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('越权订阅检查超时，不能判定为拒绝')), 5000);
      simulator.subscribe('ugv/+/device', { qos: 1 }, (error, items) => {
        clearTimeout(timer);
        resolve(Boolean(error) || Boolean(items?.length && items.every((item) => item.qos >= 128)));
      });
    });
    if (!denied) throw new Error('模拟器可以订阅未经授权的车辆遥测 Topic');
    let leaked = false;
    const unauthorizedTopic = 'ugv/OMO_STAGING_0002/device';
    const onMessage = (topic) => { if (topic === unauthorizedTopic) leaked = true; };
    bridge.on('message', onMessage);
    await publish(simulator, unauthorizedTopic, JSON.stringify({ stagingSmoke: randomUUID() })).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 1500));
    bridge.removeListener('message', onMessage);
    if (leaked) throw new Error('模拟器可以向其他车辆 Topic 发布消息');
    try {
      const bad = await connect(`omo-bad-password-smoke-${randomUUID()}`, config.bridgeUsername, randomUUID());
      bad.end(true);
      throw new Error('错误密码被 Broker 接受');
    } catch (error) {
      if (error.message === '错误密码被 Broker 接受') throw error;
    }
    await checkPlaintextPortClosed(config.host);
  } finally {
    for (const client of clients) client.end(true);
  }
}

if (require.main === module) {
  (async () => {
    if (process.env.OMO_BROKER_SMOKE_APPLY !== 'TEST_ISOLATED_STAGING_ONLY') {
      throw new Error('缺少 OMO_BROKER_SMOKE_APPLY=TEST_ISOLATED_STAGING_ONLY');
    }
    const config = resolveBrokerSmokeConfig();
    const mqtt = createRequire(path.resolve(__dirname, '../../omo-mqtt-bridge/package.json'))('mqtt');
    await runSmoke(config, mqtt);
    console.log('PASS: TLS、双向 Topic、分离账号、越权拒绝、错误密码和明文端口检查');
  })().catch((error) => { console.error('[broker-smoke]', error.message); process.exitCode = 1; });
}

module.exports = { resolveBrokerSmokeConfig, runSmoke };
