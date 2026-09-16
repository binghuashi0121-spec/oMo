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
    const result = await db.runTransaction(async (transaction) => {
      const tripRes = await transaction.collection('trips').doc(tripId).get();
      const trip = tripRes.data;

      if (!trip) {
        await transaction.rollback('trip_not_found');
      }
      if (trip.openid !== openid) {
        await transaction.rollback('forbidden');
      }
      if (trip.status === 'active') {
        await transaction.rollback('already_active');
      }
      if (trip.status !== 'waiting_pickup') {
        return { skipped: true };
      }

      await transaction.collection('trips').doc(tripId).update({
        data: {
          status: 'cancelled',
          cancelTime: db.serverDate(),
          endAt: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      if (trip.vehicleId) {
        await transaction.collection('vehicles').doc(trip.vehicleId).update({
          data: {
            status: 'available',
            activeOrderId: null,
            updateTime: db.serverDate()
          }
        });
      }

      return { skipped: false };
    });

    if (result && result.skipped) {
      return { code: 0, msg: 'trip already finished' };
    }
    return { code: 0, msg: 'cancelled' };
  } catch (err) {
    if (err.message === 'trip_not_found') return { code: 1002, msg: '行程不存在' };
    if (err.message === 'forbidden') return { code: 1003, msg: '无权取消该行程' };
    if (err.message === 'already_active') return { code: 1004, msg: '行程已开始，不能取消等待' };

    console.error('cancelWaitingTrip error', err);
    return {
      code: 500,
      msg: 'cancelWaitingTrip failed',
      error: err
    };
  }
};
