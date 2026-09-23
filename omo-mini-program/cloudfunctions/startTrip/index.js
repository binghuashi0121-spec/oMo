const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { tripId } = event || {};

  if (!tripId) {
    return { code: 1001, msg: '缺少行程ID' };
  }

  try {
    const tripRes = await db.collection('trips').doc(tripId).get();
    const trip = tripRes.data;

    if (!trip) {
      return { code: 1002, msg: '行程不存在' };
    }
    if (trip.openid !== openid) {
      return { code: 1003, msg: '无权操作该行程' };
    }

    if (trip.status === 'active' && trip.startTime) {
      return {
        code: 0,
        msg: 'already active',
        data: {
          tripId,
          startTime: new Date(trip.startTime).getTime()
        }
      };
    }

    if (trip.status !== 'waiting_pickup') {
      return { code: 1004, msg: '行程状态不支持开始' };
    }

    const now = new Date();
    await db.collection('trips').doc(tripId).update({
      data: {
        status: 'active',
        startTime: now,
        startAt: now,
        updateTime: db.serverDate()
      }
    });

    return {
      code: 0,
      msg: 'start success',
      data: {
        tripId,
        startTime: now.getTime()
      }
    };
  } catch (err) {
    console.error('startTrip error', err);
    return {
      code: 500,
      msg: 'startTrip failed',
      error: err
    };
  }
};
