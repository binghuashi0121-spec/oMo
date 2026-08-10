try {
  require('dotenv').config();
} catch (e) {}

const express = require('express');
const mqtt = require('mqtt');
const cloudbase = require('@cloudbase/node-sdk');
const { registerTripGatewayRoutes } = require('./tripGateway');
const { getTrustedCloudBaseIdentity } = require('./cloudbaseIdentity');
const { validateProtocolCommand, getTripVehicleIdentity } = require('./commandPolicy');

const app = express();
app.use(express.json({ limit: '64kb' }));

const PORT = Number(process.env.PORT || 3000);
const TCB_ENV = process.env.TCB_ENV;
const TENCENTCLOUD_SECRETID = process.env.TENCENTCLOUD_SECRETID || '';
const TENCENTCLOUD_SECRETKEY = process.env.TENCENTCLOUD_SECRETKEY || '';
const TCB_TIMEOUT_MS = Number(process.env.TCB_TIMEOUT_MS || 10000);
const DB_QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 8000);
const VEHICLE_STATUS_STALE_MS = Number(process.env.VEHICLE_STATUS_STALE_MS || 60 * 1000);
const VEHICLE_STATUS_FUTURE_TOLERANCE_MS = Number(process.env.VEHICLE_STATUS_FUTURE_TOLERANCE_MS || 5 * 1000);
const TCB_DISABLE_METADATA_PROBE = process.env.TCB_DISABLE_METADATA_PROBE !== 'false';
const DEFAULT_SCENIC_AREA_ID = /^[A-Za-z0-9_-]{2,64}$/.test(String(process.env.DEFAULT_SCENIC_AREA_ID || ''))
  ? String(process.env.DEFAULT_SCENIC_AREA_ID)
  : 'tianmashan';

// MQTT config from env
const MQTT_URL = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const MQTT_CLIENT_ID =
  process.env.MQTT_CLIENT_ID || `mqtt-bridge-${Date.now()}`;

// Configurable subscribe topics
// Default based on teacher's doc: ugv/+/device (status), ugv/+/response (cmd response)
const DEFAULT_SUB_TOPICS = ['ugv/+/device', 'ugv/+/response'];
const SUB_TOPICS = (process.env.MQTT_SUB_TOPICS || DEFAULT_SUB_TOPICS.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function disableCloudbaseMetadataProbe() {
  if (!TCB_DISABLE_METADATA_PROBE) {
    return {
      applied: false,
      reason: 'disabled-by-env'
    };
  }

  try {
    const metadataUtils = require('@cloudbase/node-sdk/dist/utils/metadata');

    // Force the SDK to use public CloudBase endpoints instead of probing
    // Tencent metadata, which can hang in some cloud hosting/container setups.
    metadataUtils.lookupAppId = async () => '';

    return {
      applied: true,
      reason: 'forced-public-endpoint'
    };
  } catch (err) {
    console.warn('[WARN] Failed to disable CloudBase metadata probe:', err.message);
    return {
      applied: false,
      reason: 'patch-failed'
    };
  }
}

const metadataProbePatch = disableCloudbaseMetadataProbe();

function getCloudbaseConfigStatus() {
  const missingEnv = [];

  if (!TCB_ENV) {
    missingEnv.push('TCB_ENV');
  }
  if (!TENCENTCLOUD_SECRETID) {
    missingEnv.push('TENCENTCLOUD_SECRETID');
  }
  if (!TENCENTCLOUD_SECRETKEY) {
    missingEnv.push('TENCENTCLOUD_SECRETKEY');
  }

  return {
    env: TCB_ENV || '',
    authMode: TENCENTCLOUD_SECRETID && TENCENTCLOUD_SECRETKEY ? 'secretPair' : 'none',
    secretIdConfigured: Boolean(TENCENTCLOUD_SECRETID),
    secretKeyConfigured: Boolean(TENCENTCLOUD_SECRETKEY),
    metadataProbeDisabled: TCB_DISABLE_METADATA_PROBE,
    metadataProbePatchApplied: metadataProbePatch.applied,
    sdkTimeoutMs: TCB_TIMEOUT_MS,
    dbQueryTimeoutMs: DB_QUERY_TIMEOUT_MS,
    missingEnv,
    ready: missingEnv.length === 0
  };
}

// ---- CloudBase init ----
const cloudbaseConfigStatus = getCloudbaseConfigStatus();

if (!TCB_ENV) {
  console.warn('[WARN] TCB_ENV is empty. Please set TCB_ENV in cloud hosting env vars.');
}

if (
  (TENCENTCLOUD_SECRETID && !TENCENTCLOUD_SECRETKEY) ||
  (!TENCENTCLOUD_SECRETID && TENCENTCLOUD_SECRETKEY)
) {
  console.warn('[WARN] CAM secret pair is incomplete. Both TENCENTCLOUD_SECRETID and TENCENTCLOUD_SECRETKEY are required.');
} else if (!TENCENTCLOUD_SECRETID && !TENCENTCLOUD_SECRETKEY) {
  console.warn('[WARN] CloudBase CAM auth is missing. Set both TENCENTCLOUD_SECRETID and TENCENTCLOUD_SECRETKEY.');
}

const tcbInitConfig = {
  env: TCB_ENV,
  timeout: TCB_TIMEOUT_MS
};

if (TENCENTCLOUD_SECRETID && TENCENTCLOUD_SECRETKEY) {
  tcbInitConfig.secretId = TENCENTCLOUD_SECRETID;
  tcbInitConfig.secretKey = TENCENTCLOUD_SECRETKEY;
}

const tcb = cloudbase.init(tcbInitConfig);
const db = tcb.database();

console.log(
  `[BOOT] CloudBase init ready env=${TCB_ENV || '(empty)'} authMode=${cloudbaseConfigStatus.authMode} timeout=${TCB_TIMEOUT_MS}ms metadataProbeDisabled=${TCB_DISABLE_METADATA_PROBE} patchApplied=${metadataProbePatch.applied}`
);

// Collections
const vehiclesCol = db.collection('vehicles');
const mqttLogsCol = db.collection('mqtt_logs');
const commandHistoryCol = db.collection('command_history');
const tripsCol = db.collection('trips');

// ---- MQTT state ----
let mqttConnected = false;
let lastMqttError = null;
let lastMessageAt = 0;
let lastMessageTopic = '';
let lastMessageUgvID = '';

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getFirstDoc(queryResult) {
  return Array.isArray(queryResult?.data) && queryResult.data.length > 0
    ? queryResult.data[0]
    : null;
}

function buildVehicleDocument(existingDoc, updateData) {
  const nextDoc = {
    ...(existingDoc || {}),
    ...updateData
  };

  delete nextDoc._id;

  return nextDoc;
}

function getVehicleBusinessStatus(existingDoc, statusPayload) {
  const runtimeStatus =
    statusPayload && typeof statusPayload.status === 'string'
      ? statusPayload.status
      : '';

  if (runtimeStatus === 'available' || runtimeStatus === 'online') {
    return 'available';
  }

  if (runtimeStatus === 'faulty' || runtimeStatus === 'maintenance' || runtimeStatus === 'in_use') {
    return runtimeStatus;
  }

  if (runtimeStatus === 'offline') {
    return 'offline';
  }

  const existingStatus = typeof existingDoc?.status === 'string' ? existingDoc.status : '';
  if (existingStatus) {
    return existingStatus;
  }

  return 'available';
}

function getTimestamp(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  if (value && typeof value === 'object') {
    if (value.$date) {
      const dateValue = new Date(value.$date).getTime();
      return Number.isFinite(dateValue) ? dateValue : 0;
    }
    if (value._seconds) {
      const second = Number(value._seconds);
      const nano = Number(value._nanoseconds || 0);
      if (Number.isFinite(second)) return second * 1000 + Math.floor(nano / 1e6);
    }
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getVehicleStatusInfo(vehicle) {
  if (vehicle && vehicle.statusInfo && typeof vehicle.statusInfo === 'object') {
    return vehicle.statusInfo;
  }
  return vehicle && vehicle.status && typeof vehicle.status === 'object' ? vehicle.status : {};
}

function getVehicleLatestStatus(vehicle) {
  const latestPayload =
    vehicle && vehicle.latestPayload && typeof vehicle.latestPayload === 'object'
      ? vehicle.latestPayload
      : {};

  return latestPayload && latestPayload.payload && typeof latestPayload.payload === 'object'
    ? latestPayload.payload
    : {};
}

function getVehicleReportAt(vehicle) {
  const statusInfo = getVehicleStatusInfo(vehicle);
  const latestStatus = getVehicleLatestStatus(vehicle);
  return getTimestamp(vehicle?.lastReportAt ?? statusInfo.timestamp ?? latestStatus.timestamp ?? vehicle?.updatedAt ?? 0);
}

function getVehicleAgeMs(vehicle, now = Date.now()) {
  const reportAt = getVehicleReportAt(vehicle);
  if (!Number.isFinite(reportAt) || reportAt <= 0) return Number.POSITIVE_INFINITY;
  const ageMs = now - reportAt;
  if (ageMs < 0 && Math.abs(ageMs) <= VEHICLE_STATUS_FUTURE_TOLERANCE_MS) {
    return 0;
  }
  return ageMs;
}

function isVehicleStatusFresh(vehicle, maxAgeMs = VEHICLE_STATUS_STALE_MS, now = Date.now()) {
  const ageMs = getVehicleAgeMs(vehicle, now);
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeMs;
}

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timeout after ${timeoutMs}ms`);
      err.code = 'DB_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

const EARTH_PI = Math.PI;
const EARTH_A = 6378245.0;
const EARTH_EE = 0.00669342162296594323;

function isOutsideChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * EARTH_PI) + 20.0 * Math.sin(2.0 * x * EARTH_PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * EARTH_PI) + 40.0 * Math.sin(y / 3.0 * EARTH_PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * EARTH_PI) + 320 * Math.sin(y * EARTH_PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * EARTH_PI) + 20.0 * Math.sin(2.0 * x * EARTH_PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * EARTH_PI) + 40.0 * Math.sin(x / 3.0 * EARTH_PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * EARTH_PI) + 300.0 * Math.sin(x / 30.0 * EARTH_PI)) * 2.0 / 3.0;
  return ret;
}

function convertWgs84ToGcj02(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (isOutsideChina(lat, lng)) {
    return {
      latitude: lat,
      longitude: lng,
      converted: false
    };
  }

  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * EARTH_PI;
  let magic = Math.sin(radLat);
  magic = 1 - EARTH_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((EARTH_A * (1 - EARTH_EE)) / (magic * sqrtMagic) * EARTH_PI);
  dLng = (dLng * 180.0) / (EARTH_A / sqrtMagic * Math.cos(radLat) * EARTH_PI);

  return {
    latitude: lat + dLat,
    longitude: lng + dLng,
    converted: true
  };
}

// ---- MQTT client ----
const mqttClient = mqtt.connect(MQTT_URL, {
  clientId: MQTT_CLIENT_ID,
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  reconnectPeriod: 2000,
  connectTimeout: 10 * 1000,
  clean: true
});

mqttClient.on('connect', () => {
  mqttConnected = true;
  lastMqttError = null;
  console.log(`[MQTT] connected: ${MQTT_URL}`);

  mqttClient.subscribe(SUB_TOPICS, { qos: 0 }, (err, granted) => {
    if (err) {
      console.error('[MQTT] subscribe failed:', err.message);
      return;
    }
    console.log('[MQTT] subscribed:', granted);
  });
});

mqttClient.on('reconnect', () => {
  mqttConnected = false;
  console.log('[MQTT] reconnecting...');
});

mqttClient.on('close', () => {
  mqttConnected = false;
  console.log('[MQTT] connection closed');
});

mqttClient.on('error', (err) => {
  mqttConnected = false;
  lastMqttError = err.message;
  console.error('[MQTT] error:', err.message);
});

mqttClient.on('message', async (topic, payloadBuffer) => {
  const payloadText = payloadBuffer.toString();
  const now = Date.now();
  lastMessageAt = now;
  lastMessageTopic = topic;

  console.log('[MQTT] message received:', { topic, payloadText });

  let parsedPayload = null;
  let parseError = null;

  try {
    parsedPayload = JSON.parse(payloadText);
  } catch (e) {
    parseError = e.message;
  }

  const topicParts = topic.split('/');
  const topicTail = topicParts[topicParts.length - 1] || '';
  const isResponseTopic = topicTail === 'response';
  let ugvID = null;
  if (topicParts.length >= 2 && topicParts[0] === 'ugv') ugvID = topicParts[1];
  if (!ugvID) ugvID = parsedPayload?.ugvID || parsedPayload?.payload?.ugvID;
  if (ugvID) lastMessageUgvID = ugvID;

  let existingVehicle = null;
  let vehicleLookupError = null;
  if (ugvID) {
    try {
      const queryRes = await vehiclesCol.where({ ugvID }).limit(1).get();
      existingVehicle = getFirstDoc(queryRes);
      if (!existingVehicle) {
        try {
          existingVehicle = getFirstDoc(await vehiclesCol.doc(ugvID).get());
        } catch (error) {
          existingVehicle = null;
        }
      }
    } catch (error) {
      vehicleLookupError = error;
    }
  }
  const scenicAreaId = String(existingVehicle?.scenicAreaId || DEFAULT_SCENIC_AREA_ID);

  // 1) write mqtt_logs
  try {
    await mqttLogsCol.add({
      scenicAreaId,
      ugvID: ugvID || '',
      topic,
      payloadRaw: payloadText,
      payloadJson: parsedPayload,
      parseError,
      createdAt: now
    });
  } catch (dbErr) {
    console.error('[DB] write mqtt_logs failed:', dbErr.message);
  }

  // 2) update vehicles if ugvID exists
  try {
    if (!ugvID) return;
    if (vehicleLookupError) throw vehicleLookupError;

    const packetPayload =
      parsedPayload && parsedPayload.payload && typeof parsedPayload.payload === 'object'
        ? parsedPayload.payload
        : parsedPayload && typeof parsedPayload === 'object'
          ? parsedPayload
          : null;

    const packetHeader =
      parsedPayload && parsedPayload.header && typeof parsedPayload.header === 'object'
        ? parsedPayload.header
        : null;

    const updateData = {
      ugvID,
      scenicAreaId,
      updatedAt: now
    };

    if (isResponseTopic) {
      const responseTimestamp = Number(
        packetHeader?.timestamp ??
        packetPayload?.timestamp ??
        now
      );

      updateData.latestResponseTopic = topic;
      updateData.latestResponse = parsedPayload;
      updateData.latestResponseRaw = payloadText;
      updateData.latestResponseAt = Number.isFinite(responseTimestamp)
        ? responseTimestamp
        : now;

      if (packetPayload && typeof packetPayload === 'object') {
        updateData.responseInfo = packetPayload;

        const retCode = Number(packetPayload.ret_code);
        if (Number.isFinite(retCode)) {
          updateData.lastResponseCode = retCode;
        }

        if (typeof packetPayload.ret_msg === 'string' && packetPayload.ret_msg) {
          updateData.lastResponseMessage = packetPayload.ret_msg;
        }
      }
    } else {
      const rawLatitude = packetPayload ? Number(packetPayload.latitude ?? packetPayload.lat) : NaN;
      const rawLongitude = packetPayload ? Number(packetPayload.longitude ?? packetPayload.lng) : NaN;
      const speed = packetPayload ? Number(packetPayload.speed ?? 0) : NaN;
      const reportTimestamp = Number(
        packetHeader?.timestamp ??
        packetPayload?.timestamp ??
        now
      );
      const convertedCoords = convertWgs84ToGcj02(rawLatitude, rawLongitude);
      const normalizedPayload = packetPayload && typeof packetPayload === 'object'
        ? {
            ...packetPayload,
            latitude: convertedCoords ? convertedCoords.latitude : packetPayload.latitude,
            longitude: convertedCoords ? convertedCoords.longitude : packetPayload.longitude,
            lat: convertedCoords ? convertedCoords.latitude : packetPayload.lat,
            lng: convertedCoords ? convertedCoords.longitude : packetPayload.lng,
            rawLatitude: Number.isFinite(rawLatitude) ? rawLatitude : packetPayload.rawLatitude,
            rawLongitude: Number.isFinite(rawLongitude) ? rawLongitude : packetPayload.rawLongitude,
            coordSystem: convertedCoords && convertedCoords.converted ? 'gcj02' : 'wgs84'
          }
        : packetPayload;

      updateData.latestTopic = topic;
      updateData.latestPayload = parsedPayload && typeof parsedPayload === 'object'
        ? {
            ...parsedPayload,
            payload: normalizedPayload
          }
        : parsedPayload; // Full packet including header
      updateData.latestRaw = payloadText;

      if (normalizedPayload && typeof normalizedPayload === 'object') {
        updateData.statusInfo = normalizedPayload;

        if (typeof normalizedPayload.status === 'string' && normalizedPayload.status) {
          updateData.runtimeStatus = normalizedPayload.status;
        }

        const battery = Number(normalizedPayload.electiricQuantity ?? normalizedPayload.battery);
        if (Number.isFinite(battery)) {
          updateData.battery = battery;
        }
      }

      if (convertedCoords && Number.isFinite(convertedCoords.latitude) && Number.isFinite(convertedCoords.longitude)) {
        updateData.lat = convertedCoords.latitude;
        updateData.lng = convertedCoords.longitude;
        updateData.latitude = convertedCoords.latitude;
        updateData.longitude = convertedCoords.longitude;
      }
      if (Number.isFinite(rawLatitude) && Number.isFinite(rawLongitude)) {
        updateData.rawLatitude = rawLatitude;
        updateData.rawLongitude = rawLongitude;
        updateData.sourceCoordSystem = 'wgs84';
      }
      if (Number.isFinite(speed)) {
        updateData.speed = speed;
      }
      if (Number.isFinite(reportTimestamp)) {
        updateData.lastReportAt = reportTimestamp;
      }
    }

    if (existingVehicle) {
      if (!isResponseTopic || !existingVehicle.status) {
        updateData.status = getVehicleBusinessStatus(existingVehicle, packetPayload);
      }
      await vehiclesCol.doc(existingVehicle._id || ugvID).set(
        buildVehicleDocument(existingVehicle, updateData)
      );
    } else {
      updateData.status = getVehicleBusinessStatus(null, isResponseTopic ? null : packetPayload);
      await vehiclesCol.add(updateData);
    }
  } catch (dbErr) {
    console.error('[DB] upsert vehicles failed:', dbErr.message);
  }
});

// ---- Routes ----
app.use((req, res, next) => {
  const rawRequestId = Array.isArray(req.headers['x-request-id']) ? req.headers['x-request-id'][0] : req.headers['x-request-id'];
  const candidate = String(rawRequestId || '').trim();
  req.requestId = /^[A-Za-z0-9._:-]{8,100}$/.test(candidate) ? candidate : createRequestId();
  res.setHeader('x-request-id', req.requestId);
  next();
});

// health check
function handleHealth(req, res) {
  res.json({
    ok: true,
    service: 'mqtt-bridge-service',
    time: new Date().toISOString(),
    mqtt: {
      connected: mqttConnected,
      clientId: MQTT_CLIENT_ID,
      subTopics: SUB_TOPICS,
      lastError: lastMqttError,
      lastMessageAt,
      lastMessageTopic,
      lastMessageUgvID
    },
    cloudbase: cloudbaseConfigStatus
  });
}

async function findOwnedActiveTrip(openid, ugvID) {
  const query = tripsCol.where({
    openid,
    status: db.command.in(['waiting_pickup', 'active', 'ongoing'])
  }).limit(20).get();
  const result = await withTimeout(query, DB_QUERY_TIMEOUT_MS, 'sendCommand.tripOwnership');
  return (Array.isArray(result && result.data) ? result.data : []).find(
    (trip) => getTripVehicleIdentity(trip) === ugvID
  ) || null;
}

// Authenticated, ownership-bound protocol command. Raw MQTT topic/payload is intentionally unsupported.
async function handleSendCommand(req, res) {
  const requestId = req.requestId;
  try {
    const body = req.body || {};
    const { ugvID: rawUgvID, command, messageType } = body;
    const ugvID = String(rawUgvID || '').trim();
    console.log(
      `[HTTP] /sendCommand requestId=${requestId} ugvID=${ugvID || ''} messageType=${messageType || ''}`
    );

    if (Object.prototype.hasOwnProperty.call(body, 'topic') || Object.prototype.hasOwnProperty.call(body, 'payload')) {
      return res.status(400).json({ code: 'BRIDGE_RAW_COMMAND_FORBIDDEN', msg: 'Raw MQTT topic/payload mode is disabled', data: null, ok: false, message: 'Raw MQTT topic/payload mode is disabled', requestId });
    }

    const identity = getTrustedCloudBaseIdentity(req);
    if (!identity) {
      return res.status(401).json({ code: 'BRIDGE_AUTH_UNTRUSTED_IDENTITY', msg: 'Missing or invalid CloudBase private identity', data: null, ok: false, message: 'Missing or invalid CloudBase private identity', requestId });
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(ugvID)) {
      return res.status(400).json({ code: 'BRIDGE_INVALID_VEHICLE', msg: 'Invalid ugvID', data: null, ok: false, message: 'Invalid ugvID', requestId });
    }
    const validationError = validateProtocolCommand(ugvID, String(messageType || ''), command);
    if (validationError) {
      return res.status(400).json({ code: 'BRIDGE_COMMAND_NOT_ALLOWED', msg: validationError, data: null, ok: false, message: validationError, requestId });
    }
    const ownedTrip = await findOwnedActiveTrip(identity.openid, ugvID);
    if (!ownedTrip) {
      return res.status(403).json({ code: 'BRIDGE_VEHICLE_FORBIDDEN', msg: 'Vehicle is not bound to the current active trip', data: null, ok: false, message: 'Vehicle is not bound to the current active trip', requestId });
    }

    const topic = `ugv/${ugvID}/platform`;
    const timestamp = Date.now();
    const payload = {
      header: {
        messageNo: `cmd-${timestamp}-${Math.floor(Math.random() * 1000)}`,
        messageType,
        timestamp
      },
      payload: command
    };

    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({
        code: 400,
        msg: 'Missing or invalid "topic"',
        data: null,
        ok: false,
        message: 'Missing or invalid "topic"',
        requestId
      });
    }

    if (payload === undefined) {
      return res.status(400).json({
        code: 400,
        msg: 'Missing "payload"',
        data: null,
        ok: false,
        message: 'Missing "payload"',
        requestId
      });
    }

    if (!mqttConnected) {
      return res.status(503).json({
        code: 'BRIDGE_MQTT_UNAVAILABLE',
        msg: 'MQTT is not connected',
        data: null,
        ok: false,
        message: 'MQTT is not connected',
        requestId
      });
    }

    const payloadString = JSON.stringify(payload);
    const publishedAt = Date.now();

    mqttClient.publish(topic, payloadString, { qos: 0, retain: false }, async (err) => {
      if (err) {
        console.error(`[MQTT] publish failed requestId=${requestId}:`, err.message);

        try {
          await withTimeout(
            commandHistoryCol.add({
              scenicAreaId: ownedTrip.scenicAreaId || DEFAULT_SCENIC_AREA_ID,
              topic,
              payload,
              payloadRaw: payloadString,
              result: 'failed',
              errorMessage: err.message,
              requestId,
              createdAt: publishedAt
            }),
            DB_QUERY_TIMEOUT_MS,
            'command_history.add(failed)'
          );
        } catch (dbErr) {
          console.error(`[DB] write command_history failed requestId=${requestId}:`, dbErr.message);
        }

        return res.status(500).json({
          code: 500,
          msg: 'MQTT publish failed',
          data: null,
          ok: false,
          message: 'MQTT publish failed',
          requestId
        });
      }

      // Publish success, write command_history
      try {
        await withTimeout(
          commandHistoryCol.add({
            scenicAreaId: ownedTrip.scenicAreaId || DEFAULT_SCENIC_AREA_ID,
            topic,
            payload,
            payloadRaw: payloadString,
            result: 'success',
            requestId,
            createdAt: publishedAt
          }),
          DB_QUERY_TIMEOUT_MS,
          'command_history.add(success)'
        );
      } catch (dbErr) {
        console.error(`[DB] write command_history failed requestId=${requestId}:`, dbErr.message);
      }

      return res.json({
        code: 0,
        msg: 'Command published',
        ok: true,
        message: 'Command published',
        requestId,
        data: {
          topic,
          payload
        }
      });
    });
  } catch (err) {
    console.error(`[HTTP] /sendCommand error requestId=${requestId}:`, err.message);
    return res.status(500).json({
      code: 500,
      msg: 'Internal server error',
      data: null,
      ok: false,
      message: 'Internal server error',
      requestId
    });
  }
}

// query vehicle latest status
async function handleVehicleStatus(req, res) {
  const requestId = req.requestId;
  try {
    const identity = getTrustedCloudBaseIdentity(req);
    if (!identity) {
      return res.status(401).json({ code: 'BRIDGE_AUTH_UNTRUSTED_IDENTITY', msg: 'Missing or invalid CloudBase private identity', data: null, ok: false, message: 'Missing or invalid CloudBase private identity', requestId });
    }
    if (!cloudbaseConfigStatus.ready) {
      return res.status(503).json({
        msg: 'CloudBase CAM configuration is incomplete',
        data: null,
        ok: false,
        code: 'CLOUDBASE_CONFIG_MISSING',
        message: 'CloudBase CAM configuration is incomplete',
        missingEnv: cloudbaseConfigStatus.missingEnv,
        requestId
      });
    }

    const ugvID = typeof req.query.ugvID === 'string' ? req.query.ugvID.trim() : '';
    console.log(`[HTTP] /vehicleStatus requestId=${requestId} ugvID=${ugvID || ''}`);

    if (!/^[A-Za-z0-9_-]{1,64}$/.test(ugvID)) {
      return res.status(400).json({
        code: 400,
        msg: 'Missing or invalid query param "ugvID"',
        data: null,
        ok: false,
        message: 'Missing or invalid query param "ugvID"',
        requestId
      });
    }

    if (!(await findOwnedActiveTrip(identity.openid, ugvID))) {
      return res.status(403).json({ code: 'BRIDGE_VEHICLE_FORBIDDEN', msg: 'Vehicle is not bound to the current active trip', data: null, ok: false, message: 'Vehicle is not bound to the current active trip', requestId });
    }

    let result = await withTimeout(
      vehiclesCol.where({ ugvID }).get(),
      DB_QUERY_TIMEOUT_MS,
      'vehicles.where(ugvID).get'
    );
    if (!getFirstDoc(result)) {
      try {
        const byId = await withTimeout(
          vehiclesCol.doc(ugvID).get(),
          DB_QUERY_TIMEOUT_MS,
          'vehicles.doc(ugvID).get'
        );
        const existingById = getFirstDoc(byId);
        if (existingById) {
          result = { data: [existingById] };
        }
      } catch (e) {
        // ignore and keep not-found handling below
      }
    }

    const vehicle = getFirstDoc(result);
    if (!vehicle) {
      return res.status(404).json({
        code: 404,
        msg: `Vehicle not found: ${ugvID}`,
        data: null,
        ok: false,
        message: `Vehicle not found: ${ugvID}`,
        requestId
      });
    }

    if (!isVehicleStatusFresh(vehicle)) {
      const reportAt = getVehicleReportAt(vehicle);
      const now = Date.now();
      return res.status(409).json({
        code: 'BRIDGE_VEHICLE_STATUS_STALE',
        msg: 'vehicle status stale',
        data: {
          ugvID,
          reportAt,
          now,
          staleMs: VEHICLE_STATUS_STALE_MS
        },
        ok: false,
        message: 'vehicle status stale',
        requestId
      });
    }

    return res.json({
      code: 0,
      msg: 'ok',
      ok: true,
      mqttConnected,
      requestId,
      data: vehicle
    });
  } catch (err) {
    if (err && err.code === 'DB_TIMEOUT') {
      console.error(`[HTTP] /vehicleStatus timeout requestId=${requestId}:`, err.message);
      return res.status(504).json({
        ok: false,
        code: 'DB_TIMEOUT',
        msg: 'Database query timeout',
        data: null,
        message: 'Database query timeout',
        requestId
      });
    }
    console.error(`[HTTP] /vehicleStatus error requestId=${requestId}:`, err.message);
    return res.status(500).json({
      code: 500,
      msg: 'Database query failed',
      data: null,
      ok: false,
      message: 'Database query failed',
      requestId
    });
  }
}

['', '/mqtt'].forEach((prefix) => {
  app.get(`${prefix}/health`, handleHealth);
  app.post(`${prefix}/sendCommand`, handleSendCommand);
  app.get(`${prefix}/vehicleStatus`, handleVehicleStatus);
});

registerTripGatewayRoutes(app, {
  db,
  withTimeout,
  dbQueryTimeoutMs: DB_QUERY_TIMEOUT_MS,
  defaultScenicAreaId: DEFAULT_SCENIC_AREA_ID,
  isMqttConnected: () => mqttConnected
});

// fallback route
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: 'Not Found'
  });
});

// global error middleware
app.use((err, req, res, next) => {
  console.error('[HTTP] unhandled error:', err);
  res.status(500).json({
    ok: false,
    message: 'Internal server error'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[HTTP] service listening on 0.0.0.0:${PORT}`);
});











