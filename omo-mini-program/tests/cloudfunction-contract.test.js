const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function includesFields(text, fields) {
  for (const field of fields) assert.match(text, new RegExp(`\\b${field}\\b`), `missing canonical field ${field}`);
}

test('unlockVehicle creates a traceable canonical order and vehicle link', () => {
  const text = source('cloudfunctions/unlockVehicle/index.js');
  includesFields(text, [
    'scenicAreaId', 'orderNo', 'vehicleNo', 'startAt', 'createdAt',
    'originalAmountCents', 'effectiveAmountCents', 'distanceKm', 'durationMinutes', 'activeOrderId',
  ]);
  assert.match(text, /status:\s*'waiting_pickup'/);
});

test('start, cancel and end cloud functions maintain canonical lifecycle fields', () => {
  const start = source('cloudfunctions/startTrip/index.js');
  const cancel = source('cloudfunctions/cancelWaitingTrip/index.js');
  const end = source('cloudfunctions/endTrip/index.js');

  assert.match(start, /status:\s*'active'/);
  includesFields(start, ['startAt']);
  assert.match(cancel, /status:\s*'cancelled'/);
  includesFields(cancel, ['endAt', 'activeOrderId']);
  assert.match(cancel, /activeOrderId:\s*null/);
  assert.match(end, /status:\s*'completed'/);
  includesFields(end, [
    'orderId', 'orderNo', 'originalAmountCents', 'effectiveAmountCents', 'paymentStatus',
    'settledAt', 'endAt', 'distanceKm', 'durationMinutes', 'activeOrderId',
  ]);
  assert.match(end, /activeOrderId:\s*null/);
});

test('MQTT telemetry persists canonical vehicle presentation fields', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', '..', 'omo-mqtt-bridge', 'app.js'), 'utf8');
  includesFields(text, ['batteryPercent', 'positionGcj02', 'positionWgs84', 'speedKph', 'heartbeatAt']);
});
