// Run with Node 22: node --env-file=scripts/.env.simulator scripts/vehicle_simulator.js
const { createRequire } = require('node:module');
const path = require('node:path');
const { resolveSimulatorConfig } = require('./staging/simulator-config');
const { createVehicleSimulator } = require('./staging/vehicle-simulator-core');
const mqtt = createRequire(path.join(__dirname, '..', 'omo-mqtt-bridge', 'package.json'))('mqtt');

const config = resolveSimulatorConfig();
const vehicle = createVehicleSimulator(config.deviceId);
const topics = {
  device: `ugv/${config.deviceId}/device`,
  platform: `ugv/${config.deviceId}/platform`,
  response: `ugv/${config.deviceId}/response`,
};
const client = mqtt.connect(config.url, {
  protocolVersion: 5, clientId: config.clientId, clean: true,
  connectTimeout: 4000, username: config.username, password: config.password,
  rejectUnauthorized: true, reconnectPeriod: 1000,
});

client.on('connect', () => {
  console.log('[MQTT] Connected to staging TLS Broker');
  client.subscribe(topics.platform, { qos: 1 }, (error) => {
    if (error) console.error('[MQTT] Subscribe failed:', error.message);
  });
  client.publish(topics.device, JSON.stringify(vehicle.telemetry()), { qos: 0, retain: false });
});

client.on('message', (topic, bytes) => {
  if (topic !== topics.platform) return;
  let packet;
  try { packet = JSON.parse(bytes.toString()); }
  catch { console.error('[MQTT] Invalid JSON command'); return; }
  const response = vehicle.receive(packet);
  client.publish(topics.response, JSON.stringify(response), { qos: 0, retain: false }, (error) => {
    if (error) console.error('[MQTT] Response publish failed:', error.message);
  });
});

setInterval(() => vehicle.tick(), 100);
setInterval(() => {
  if (!client.connected) return;
  client.publish(topics.device, JSON.stringify(vehicle.telemetry()), { qos: 0, retain: false }, (error) => {
    if (error) console.error('[MQTT] Telemetry publish failed:', error.message);
  });
}, 5000);

client.on('error', (error) => console.error('[MQTT] Connection error:', error.message));
