// Generated from 2026020210334111342_天马山脚下.osm
// Use in MQTTX Script mode with topic: ugv/OMO_0008/device

const ugvID = "OMO_0008";
const baseMessageNo = 260;
const baseTotalMetre = 1493.9546244466533;
const battery = 48.412685394287109;
const altitude = 41.213500000000003;
const runtimeStatus = "available";

const track = [
  { latitude: 28.173840662500002, longitude: 112.94114946750000, speed: 0.000000, distance: 0.000 },
  { latitude: 28.173796606500002, longitude: 112.94116340050000, speed: 1.017123, distance: 5.086 },
  { latitude: 28.173735745999998, longitude: 112.94118679000000, speed: 1.429037, distance: 12.231 },
  { latitude: 28.173675417999998, longitude: 112.94120851933333, speed: 1.407637, distance: 19.269 },
  { latitude: 28.173614360666665, longitude: 112.94123265883333, speed: 1.437955, distance: 26.459 },
  { latitude: 28.173554508166667, longitude: 112.94125877050000, speed: 1.426098, distance: 33.589 },
  { latitude: 28.173494137333332, longitude: 112.94128531083334, speed: 1.439879, distance: 40.789 },
  { latitude: 28.173436368166666, longitude: 112.94131766400000, speed: 1.432762, distance: 47.952 },
  { latitude: 28.173383529166667, longitude: 112.94135938366666, speed: 1.431696, distance: 55.111 },
  { latitude: 28.173335723499999, longitude: 112.94140799100001, speed: 1.427697, distance: 62.249 },
  { latitude: 28.173292574000001, longitude: 112.94146187000000, speed: 1.427062, distance: 69.385 },
  { latitude: 28.173254794500000, longitude: 112.94152116566667, speed: 1.434285, distance: 76.556 },
  { latitude: 28.173219915666667, longitude: 112.94158215783334, speed: 1.425261, distance: 83.682 },
  { latitude: 28.173183822999999, longitude: 112.94164348100000, speed: 1.445523, distance: 90.910 },
  { latitude: 28.173144267166666, longitude: 112.94170076483333, speed: 1.426527, distance: 98.043 },
  { latitude: 28.173112073500000, longitude: 112.94173117433333, speed: 0.931660, distance: 102.701 },
  { latitude: 28.173091568166665, longitude: 112.94173954516667, speed: 0.484647, distance: 105.124 },
  { latitude: 28.173070080500001, longitude: 112.94174127399999, speed: 0.479064, distance: 107.520 },
  { latitude: 28.173046066333335, longitude: 112.94173481183333, speed: 0.548871, distance: 110.264 },
  { latitude: 28.173027752333333, longitude: 112.94172343183334, speed: 0.464384, distance: 112.586 },
  { latitude: 28.173009344499999, longitude: 112.94170520916667, speed: 0.543329, distance: 115.302 },
  { latitude: 28.172970635166667, longitude: 112.94164746950000, speed: 1.422100, distance: 122.413 },
  { latitude: 28.172939851333332, longitude: 112.94158487150000, speed: 1.405228, distance: 129.439 },
  { latitude: 28.172909717166668, longitude: 112.94152150016667, speed: 1.411571, distance: 136.497 },
  { latitude: 28.172882594000001, longitude: 112.94145632300000, speed: 1.412971, distance: 143.562 },
  { latitude: 28.172851822999998, longitude: 112.94139134866667, speed: 1.445956, distance: 150.792 },
  { latitude: 28.172823837500001, longitude: 112.94132550866667, speed: 1.432957, distance: 157.956 },
  { latitude: 28.172802049166666, longitude: 112.94125758016666, speed: 1.417105, distance: 165.042 },
  { latitude: 28.172780928333335, longitude: 112.94118925966667, speed: 1.419348, distance: 172.139 },
  { latitude: 28.172756081999999, longitude: 112.94112041616667, speed: 1.458360, distance: 179.430 },
  { latitude: 28.172725208333333, longitude: 112.94105625483333, speed: 1.433029, distance: 186.596 },
  { latitude: 28.172688645166666, longitude: 112.94099502166667, speed: 1.449902, distance: 193.845 },
  { latitude: 28.172656718833334, longitude: 112.94093334016667, speed: 1.402260, distance: 200.856 },
  { latitude: 28.172626958166667, longitude: 112.94087022533333, speed: 1.403214, distance: 207.872 },
  { latitude: 28.172593093333333, longitude: 112.94080722133333, speed: 1.446646, distance: 215.106 },
  { latitude: 28.172558765166666, longitude: 112.94074606833334, speed: 1.421298, distance: 222.212 },
  { latitude: 28.172593093333333, longitude: 112.94080722133333, speed: 1.421298, distance: 229.319 },
  { latitude: 28.172626958166667, longitude: 112.94087022533333, speed: 1.446646, distance: 236.552 },
  { latitude: 28.172656718833334, longitude: 112.94093334016667, speed: 1.403214, distance: 243.568 },
  { latitude: 28.172688645166666, longitude: 112.94099502166667, speed: 1.402260, distance: 250.579 },
  { latitude: 28.172725208333333, longitude: 112.94105625483333, speed: 1.449902, distance: 257.829 },
  { latitude: 28.172756081999999, longitude: 112.94112041616667, speed: 1.433029, distance: 264.994 },
  { latitude: 28.172780928333335, longitude: 112.94118925966667, speed: 1.458360, distance: 272.286 },
  { latitude: 28.172802049166666, longitude: 112.94125758016666, speed: 1.419348, distance: 279.383 },
  { latitude: 28.172823837500001, longitude: 112.94132550866667, speed: 1.417105, distance: 286.468 },
  { latitude: 28.172851822999998, longitude: 112.94139134866667, speed: 1.432957, distance: 293.633 },
  { latitude: 28.172882594000001, longitude: 112.94145632300000, speed: 1.445956, distance: 300.863 },
  { latitude: 28.172909717166668, longitude: 112.94152150016667, speed: 1.412971, distance: 307.927 },
  { latitude: 28.172939851333332, longitude: 112.94158487150000, speed: 1.411571, distance: 314.985 },
  { latitude: 28.172970635166667, longitude: 112.94164746950000, speed: 1.405228, distance: 322.011 },
  { latitude: 28.173009344499999, longitude: 112.94170520916667, speed: 1.422100, distance: 329.122 },
  { latitude: 28.173027752333333, longitude: 112.94172343183334, speed: 0.543329, distance: 331.839 },
  { latitude: 28.173046066333335, longitude: 112.94173481183333, speed: 0.464384, distance: 334.161 },
  { latitude: 28.173070080500001, longitude: 112.94174127399999, speed: 0.548871, distance: 336.905 },
  { latitude: 28.173091568166665, longitude: 112.94173954516667, speed: 0.479064, distance: 339.300 },
  { latitude: 28.173112073500000, longitude: 112.94173117433333, speed: 0.484647, distance: 341.723 },
  { latitude: 28.173144267166666, longitude: 112.94170076483333, speed: 0.931660, distance: 346.382 },
  { latitude: 28.173183822999999, longitude: 112.94164348100000, speed: 1.426527, distance: 353.514 },
  { latitude: 28.173219915666667, longitude: 112.94158215783334, speed: 1.445523, distance: 360.742 },
  { latitude: 28.173254794500000, longitude: 112.94152116566667, speed: 1.425261, distance: 367.868 },
  { latitude: 28.173292574000001, longitude: 112.94146187000000, speed: 1.434285, distance: 375.040 },
  { latitude: 28.173335723499999, longitude: 112.94140799100001, speed: 1.427062, distance: 382.175 },
  { latitude: 28.173383529166667, longitude: 112.94135938366666, speed: 1.427697, distance: 389.314 },
  { latitude: 28.173436368166666, longitude: 112.94131766400000, speed: 1.431696, distance: 396.472 },
  { latitude: 28.173494137333332, longitude: 112.94128531083334, speed: 1.432762, distance: 403.636 },
  { latitude: 28.173554508166667, longitude: 112.94125877050000, speed: 1.439879, distance: 410.835 },
  { latitude: 28.173614360666665, longitude: 112.94123265883333, speed: 1.426098, distance: 417.966 },
  { latitude: 28.173675417999998, longitude: 112.94120851933333, speed: 1.437955, distance: 425.155 },
  { latitude: 28.173735745999998, longitude: 112.94118679000000, speed: 1.407637, distance: 432.194 },
  { latitude: 28.173796606500002, longitude: 112.94116340050000, speed: 1.429037, distance: 439.339 },
  { latitude: 28.173840662500002, longitude: 112.94114946750000, speed: 1.017123, distance: 444.424 }
];

const cycleDistance = 444.424;

function buildPayload(point, index) {
  const numericIndex = Number.isFinite(index) ? index : 0;
  const cycle = Math.floor(numericIndex / track.length);
  const messageNo = String(baseMessageNo + numericIndex);

  return JSON.stringify({
    header: {
      messageNo,
      messageType: "ugvRealtimeInfo",
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
  const i = (Number.isFinite(index) ? index : 0) % track.length;
  return buildPayload(track[i], Number.isFinite(index) ? index : 0);
}

execute(handlePayload);
