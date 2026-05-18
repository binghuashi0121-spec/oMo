const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const result = await db.collection('trips')
      .where({
        openid,
        status: _.in(['waiting_pickup', 'active'])
      })
      .limit(20)
      .get();

    if (!result.data || result.data.length === 0) {
      return {
        code: 0,
        msg: 'no active trip',
        data: null
      };
    }

    const trip = result.data.sort((a, b) => {
      const ta = new Date(a.waitStartTime || a.startTime || 0).getTime();
      const tb = new Date(b.waitStartTime || b.startTime || 0).getTime();
      return tb - ta;
    })[0];
    return {
      code: 0,
      msg: 'found trip',
      data: {
        tripId: trip._id,
        runtimeId: trip.runtimeId,
        vehicleId: trip.vehicleId,
        ugvID: trip.ugvID || trip.vehicleId,
        status: trip.status,
        startTime: trip.startTime,
        waitStartTime: trip.waitStartTime
      }
    };
  } catch (err) {
    console.error('checkActiveTrip error', err);
    return {
      code: 500,
      msg: 'checkActiveTrip failed',
      error: err
    };
  }
};
