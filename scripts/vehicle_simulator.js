// Vehicle simulator
// Run with Node 22: node --env-file=scripts/.env.simulator scripts/vehicle_simulator.js

const { createRequire } = require('node:module');
const path = require('node:path');
const { resolveSimulatorConfig } = require('./staging/simulator-config');
const mqtt = createRequire(path.join(__dirname, '..', 'omo-mqtt-bridge', 'package.json'))('mqtt');

const MQTT_CONFIG = resolveSimulatorConfig();

const SPEED_MODE_LIMITS = {
  1: 1,
  2: 2,
  5: 5
};

const client = mqtt.connect(MQTT_CONFIG.url, {
  clientId: MQTT_CONFIG.clientId,
  clean: true,
  connectTimeout: 4000,
  username: MQTT_CONFIG.username,
  password: MQTT_CONFIG.password,
  rejectUnauthorized: true,
  reconnectPeriod: 1000
});

const TOPICS = {
  device_up: `ugv/${MQTT_CONFIG.deviceId}/device`,
  platform_dn: `ugv/${MQTT_CONFIG.deviceId}/platform`,
  response_up: `ugv/${MQTT_CONFIG.deviceId}/response`
};

let vehicleState = {
  ugvID: MQTT_CONFIG.deviceId,
  mode: 0,
  speedMode: 2,
  status: 'idle',
  electiricQuantity: 85,
  longitude: 112.94170,
  latitude: 28.17314,
  altitude: 300,
  speed: 0,
  isCharging: 0,
  autoStatus: 0,
  total_metre: 1234.5,
  odom_metre: 0
};

client.on('connect', () => {
  console.log('[MQTT] Connected to staging TLS Broker');

  client.subscribe([TOPICS.platform_dn], () => {
    console.log(`[MQTT] Subscribed to topic: ${TOPICS.platform_dn}`);
  });

  startHeartbeat();
});

client.on('message', (topic, payload) => {
  console.log(`[MQTT] Received Message on ${topic}:`, payload.toString());

  try {
    const msg = JSON.parse(payload.toString());
    handleCommand(msg);
  } catch (error) {
    console.error('[MQTT] Failed to parse message:', error);
  }
});

function buildResponse(header, retCode = 0, retMsg = 'ok') {
  return {
    header: {
      messageNo: `resp-${header.messageNo || Date.now()}`,
      messageType: header.messageType,
      timestamp: Date.now()
    },
    payload: {
      ugvID: MQTT_CONFIG.deviceId,
      ret_code: retCode,
      ret_msg: retMsg
    }
  };
}

function handleCommand(msg) {
  const { header = {}, payload = {} } = msg || {};
  const msgType = header.messageType;

  console.log(`[Command] Received ${msgType}, payload:`, payload);

  setTimeout(() => {
    const response = buildResponse(header);
    client.publish(TOPICS.response_up, JSON.stringify(response), { qos: 0, retain: false }, (error) => {
      if (error) {
        console.error('[MQTT] Publish response error:', error);
      } else {
        console.log(`[Response] Sent response for ${msgType}`);
      }
    });

    if (msgType === 'ugvSetMode') {
      vehicleState.mode = Number(payload.mode) || 0;
      if (Number.isFinite(Number(payload.speedMode))) {
        vehicleState.speedMode = Number(payload.speedMode);
      }
      console.log(`[State] Mode=${vehicleState.mode}, speedMode=${vehicleState.speedMode}`);
      return;
    }

    if (msgType === 'ugvSetMove') {
      const speedPercent = Math.max(-1, Math.min(1, Number(payload.speed) || 0));
      const anglePercent = Math.max(-1, Math.min(1, Number(payload.angle) || 0));
      const speedLimit = SPEED_MODE_LIMITS[vehicleState.speedMode] || SPEED_MODE_LIMITS[2];
      const actualSpeed = speedPercent * speedLimit;

      vehicleState.speed = actualSpeed;

      if (actualSpeed !== 0) {
        vehicleState.latitude += actualSpeed * 0.00001;
        vehicleState.longitude += anglePercent * 0.000002;
        vehicleState.total_metre += Math.abs(actualSpeed) * 0.5;
      }

      console.log(
        `[State] speedPercent=${speedPercent}, anglePercent=${anglePercent}, actualSpeed=${actualSpeed.toFixed(2)}`
      );
    }
  }, 500);
}

function startHeartbeat() {
  setInterval(() => {
    if (Math.abs(vehicleState.speed) > 0) {
      vehicleState.electiricQuantity = Math.max(0, vehicleState.electiricQuantity - 0.1);
    }

    const reportMsg = {
      header: {
        messageNo: `${Date.now()}`,
        messageType: 'ugvRealtimeInfo',
        timestamp: Date.now()
      },
      payload: {
        ...vehicleState,
        timestamp: Date.now()
      }
    };

    client.publish(TOPICS.device_up, JSON.stringify(reportMsg), { qos: 0, retain: false }, (error) => {
      if (error) {
        console.error('[Heartbeat] Publish error:', error);
      } else {
        console.log(
          `[Heartbeat] mode=${vehicleState.mode}, speedMode=${vehicleState.speedMode}, speed=${vehicleState.speed.toFixed(2)}`
        );
      }
    });
  }, 5000);
}

client.on('error', (error) => {
  console.error('[MQTT] Connection error:', error);
});
