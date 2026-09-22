const { convertWgs84ToGcj02 } = require('./vehicleControl');

// Source: gps2osm_20260911_214337.osm (way -9999, WGS-84 node order).
const ROUTE_NETWORK_RAW_POINTS = [
  { key: 'node_01', name: '路网点01', latitude: 28.1738232585, longitude: 112.94417355933334 },
  { key: 'node_02', name: '路网点02', latitude: 28.173865641166667, longitude: 112.94419107266667 },
  { key: 'node_03', name: '路网点03', latitude: 28.173878742166668, longitude: 112.94420598833334 },
  { key: 'node_04', name: '路网点04', latitude: 28.1739199535, longitude: 112.94426087466667 },
  { key: 'node_05', name: '路网点05', latitude: 28.173964609166667, longitude: 112.94431277483334 },
  { key: 'node_06', name: '路网点06', latitude: 28.173997446, longitude: 112.944371997 },
  { key: 'node_07', name: '路网点07', latitude: 28.174003351833335, longitude: 112.94439208416667 }
];

const ROUTE_NETWORK_POINTS = ROUTE_NETWORK_RAW_POINTS.map((point) => {
  const converted = convertWgs84ToGcj02(point.latitude, point.longitude);
  const gcj02Latitude = converted && Number.isFinite(converted.latitude)
    ? converted.latitude
    : point.latitude;
  const gcj02Longitude = converted && Number.isFinite(converted.longitude)
    ? converted.longitude
    : point.longitude;

  return {
    key: point.key,
    name: point.name,
    wgs84Latitude: point.latitude,
    wgs84Longitude: point.longitude,
    gcj02Latitude,
    gcj02Longitude
  };
});

const ROUTE_NETWORK_POLYLINE_GCJ02 = ROUTE_NETWORK_POINTS.map((point) => ({
  latitude: point.gcj02Latitude,
  longitude: point.gcj02Longitude
}));

module.exports = {
  ROUTE_NETWORK_POINTS,
  ROUTE_NETWORK_POLYLINE_GCJ02
};
