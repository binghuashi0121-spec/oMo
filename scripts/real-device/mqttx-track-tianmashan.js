// Generated from omo-mini-program/gps2osm_20260911_214337.osm.
// Use in MQTTX Script mode with topic: ugv/OMO_0008/device.

const ugvID = 'OMO_0008';
const baseMessageNo = 260;
const baseTotalMetre = 1493.9546244466533;
const battery = 48.412685394287109;
const altitude = 41.2135;
const runtimeStatus = 'available';

// Traverse the seven-node way and return along the same path to avoid a jump
// between MQTTX cycles. Coordinates remain WGS-84 for the Bridge to convert.
const track = [
  { latitude: 28.1738232585, longitude: 112.94417355933334, speed: 0, distance: 0 },
  { latitude: 28.173865641166667, longitude: 112.94419107266667, speed: 1, distance: 5.015659 },
  { latitude: 28.173878742166668, longitude: 112.94420598833334, speed: 1, distance: 7.079569 },
  { latitude: 28.1739199535, longitude: 112.94426087466667, speed: 1, distance: 14.146634 },
  { latitude: 28.173964609166667, longitude: 112.94431277483334, speed: 1, distance: 21.255528 },
  { latitude: 28.173997446, longitude: 112.944371997, speed: 1, distance: 28.113346 },
  { latitude: 28.174003351833335, longitude: 112.94439208416667, speed: 0, distance: 30.188922 },
  { latitude: 28.173997446, longitude: 112.944371997, speed: 1, distance: 32.264498 },
  { latitude: 28.173964609166667, longitude: 112.94431277483334, speed: 1, distance: 39.122316 },
  { latitude: 28.1739199535, longitude: 112.94426087466667, speed: 1, distance: 46.231210 },
  { latitude: 28.173878742166668, longitude: 112.94420598833334, speed: 1, distance: 53.298275 },
  { latitude: 28.173865641166667, longitude: 112.94419107266667, speed: 1, distance: 55.362185 },
  { latitude: 28.1738232585, longitude: 112.94417355933334, speed: 0, distance: 60.377844 }
];

const cycleDistance = 60.377844;

function buildPayload(point, index) {
  const numericIndex = Number.isFinite(index) ? index : 0;
  const cycle = Math.floor(numericIndex / track.length);
  return JSON.stringify({
    header: {
      messageNo: String(baseMessageNo + numericIndex),
      messageType: 'ugvRealtimeInfo',
      timestamp: String(Date.now())
    },
    payload: {
      altitude,
      autoStatus: 0,
      electiricQuantity: battery,
      isCharging: 0,
      latitude: point.latitude,
      longitude: point.longitude,
      mode: 3,
      odom_metre: 0,
      speed: point.speed,
      status: runtimeStatus,
      total_metre: Number((baseTotalMetre + cycle * cycleDistance + point.distance).toFixed(6)),
      ugvID
    }
  });
}

function handlePayload(value, msgType, index) {
  const numericIndex = Number.isFinite(index) ? index : 0;
  return buildPayload(track[numericIndex % track.length], numericIndex);
}

execute(handlePayload);
