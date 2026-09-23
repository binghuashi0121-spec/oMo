const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function getTimeValue(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTripSummary(trip) {
  return {
    tripId: trip._id,
    vehicleId: trip.vehicleId || '',
    ugvID: trip.ugvID || trip.vehicleId || '',
    vehicleModel: trip.vehicleModel || '',
    status: trip.status || '',
    payStatus: trip.payStatus || '',
    cost: Number(trip.cost || 0),
    distance: Number(trip.distance || 0),
    startTime: trip.startTime || null,
    endTime: trip.endTime || null,
    createTime: trip.createTime || null,
    updateTime: trip.updateTime || null
  };
}

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const result = await db.collection('trips').where({
      openid,
      status: 'completed'
    }).limit(100).get();

    const list = (result.data || [])
      .slice()
      .sort((a, b) => {
        const aTime = Math.max(
          getTimeValue(a.endTime),
          getTimeValue(a.updateTime),
          getTimeValue(a.createTime)
        );
        const bTime = Math.max(
          getTimeValue(b.endTime),
          getTimeValue(b.updateTime),
          getTimeValue(b.createTime)
        );
        return bTime - aTime;
      })
      .map(formatTripSummary);

    return {
      code: 0,
      msg: 'ok',
      data: list
    };
  } catch (error) {
    console.error('listCompletedTrips error', error);
    return {
      code: 500,
      msg: 'list completed trips failed',
      error: error.message || String(error)
    };
  }
};
