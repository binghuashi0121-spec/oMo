const { convertWgs84ToGcj02 } = require('./vehicleControl');

const MAX_ACTIVE_ROUTE_POINTS = 18;

const ALL_ROUTE_NETWORK_RAW_POINTS = [
  { key: 'node_01', name: '路网点01', latitude: 28.1738406625, longitude: 112.9411494675 },
  { key: 'node_02', name: '路网点02', latitude: 28.1737966065, longitude: 112.9411634005 },
  { key: 'node_03', name: '路网点03', latitude: 28.173735746, longitude: 112.94118679 },
  { key: 'node_04', name: '路网点04', latitude: 28.173675418, longitude: 112.94120851933333 },
  { key: 'node_05', name: '路网点05', latitude: 28.173614360666665, longitude: 112.94123265883333 },
  { key: 'node_06', name: '路网点06', latitude: 28.173554508166667, longitude: 112.9412587705 },
  { key: 'node_07', name: '路网点07', latitude: 28.173494137333332, longitude: 112.94128531083334 },
  { key: 'node_08', name: '路网点08', latitude: 28.173436368166666, longitude: 112.941317664 },
  { key: 'node_09', name: '路网点09', latitude: 28.173383529166667, longitude: 112.94135938366666 },
  { key: 'node_10', name: '路网点10', latitude: 28.1733357235, longitude: 112.941407991 },
  { key: 'node_11', name: '路网点11', latitude: 28.173292574, longitude: 112.94146187 },
  { key: 'node_12', name: '路网点12', latitude: 28.1732547945, longitude: 112.94152116566667 },
  { key: 'node_13', name: '路网点13', latitude: 28.173219915666667, longitude: 112.94158215783334 },
  { key: 'node_14', name: '路网点14', latitude: 28.173183823, longitude: 112.941643481 },
  { key: 'node_15', name: '路网点15', latitude: 28.173144267166666, longitude: 112.94170076483333 },
  { key: 'node_16', name: '路网点16', latitude: 28.1731120735, longitude: 112.94173117433333 },
  { key: 'node_17', name: '路网点17', latitude: 28.173091568166665, longitude: 112.94173954516667 },
  { key: 'node_18', name: '路网点18', latitude: 28.1730700805, longitude: 112.941741274 },
  { key: 'node_19', name: '路网点19', latitude: 28.173046066333335, longitude: 112.94173481183333 },
  { key: 'node_20', name: '路网点20', latitude: 28.173027752333333, longitude: 112.94172343183334 },
  { key: 'node_21', name: '路网点21', latitude: 28.1730093445, longitude: 112.94170520916667 },
  { key: 'node_22', name: '路网点22', latitude: 28.172970635166667, longitude: 112.9416474695 },
  { key: 'node_23', name: '路网点23', latitude: 28.172939851333332, longitude: 112.9415848715 },
  { key: 'node_24', name: '路网点24', latitude: 28.172909717166668, longitude: 112.94152150016667 },
  { key: 'node_25', name: '路网点25', latitude: 28.172882594, longitude: 112.941456323 },
  { key: 'node_26', name: '路网点26', latitude: 28.172851823, longitude: 112.94139134866667 },
  { key: 'node_27', name: '路网点27', latitude: 28.1728238375, longitude: 112.94132550866667 },
  { key: 'node_28', name: '路网点28', latitude: 28.172802049166666, longitude: 112.94125758016666 },
  { key: 'node_29', name: '路网点29', latitude: 28.172780928333335, longitude: 112.94118925966667 },
  { key: 'node_30', name: '路网点30', latitude: 28.172756082, longitude: 112.94112041616667 },
  { key: 'node_31', name: '路网点31', latitude: 28.172725208333333, longitude: 112.94105625483333 },
  { key: 'node_32', name: '路网点32', latitude: 28.172688645166666, longitude: 112.94099502166667 },
  { key: 'node_33', name: '路网点33', latitude: 28.172656718833334, longitude: 112.94093334016667 },
  { key: 'node_34', name: '路网点34', latitude: 28.172626958166667, longitude: 112.94087022533333 },
  { key: 'node_35', name: '路网点35', latitude: 28.172593093333333, longitude: 112.94080722133333 },
  { key: 'node_36', name: '路网点36', latitude: 28.172558765166666, longitude: 112.94074606833334 }
];

const ROUTE_NETWORK_RAW_POINTS = ALL_ROUTE_NETWORK_RAW_POINTS.slice(0, MAX_ACTIVE_ROUTE_POINTS);

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
