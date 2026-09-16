const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const PARKING_UNIT_PRICE = 1;
const PARKING_UNIT_MINUTES = 10;
const DRIVE_UNIT_PRICE = 0.5;
const BASE_PRICE = 10;
const BASE_KM = 1.5;
const EXTRA_PRICE_PER_KM = 5;
const DEPOSIT_AMOUNT = 200;

function getDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { tripId, endLocation, distance } = event;

  if (!tripId) {
    return { code: 1001, msg: '缺少行程ID' };
  }

  try {
    const tripRes = await db.collection('trips').doc(tripId).get();
    const trip = tripRes.data;

    if (!trip) {
      return { code: 1002, msg: '行程不存在' };
    }

    if (trip.status !== 'active') {
      return { code: 1003, msg: '行程已结束或无效' };
    }

    if (trip.openid !== openid) {
      return { code: 1004, msg: '无权操作此行程' };
    }

    let runtimeData = null;
    if (trip.runtimeId) {
      const runtimeRes = await db.collection('trip_runtime').doc(trip.runtimeId).get();
      runtimeData = runtimeRes.data || null;
    } else {
      const runtimeRes = await db.collection('trip_runtime').where({ tripId }).limit(1).get();
      runtimeData = runtimeRes.data && runtimeRes.data.length ? runtimeRes.data[0] : null;
    }

    const distanceMeters =
      runtimeData && Number.isFinite(Number(runtimeData.distanceMetersRaw))
        ? Number(runtimeData.distanceMetersRaw)
        : getSafeDistanceMeters(distance);
    const distanceKm = distanceMeters / 1000;

    const startTime = getDate(trip.startTime);
    const endTime = new Date();
    const totalDurationMs = startTime ? Math.max(0, endTime.getTime() - startTime.getTime()) : 0;
    const totalMinutes = Math.ceil(totalDurationMs / 1000 / 60);

    const parkingSessions = runtimeData && Array.isArray(runtimeData.parkingSessions)
      ? runtimeData.parkingSessions
      : [];

    let parkingMinutes = 0;
    parkingSessions.forEach((session) => {
      const sessionStart = getDate(session && session.startAt);
      const sessionEnd = getDate(session && session.endAt);
      if (sessionStart && sessionEnd && sessionEnd >= sessionStart) {
        parkingMinutes += Math.ceil((sessionEnd.getTime() - sessionStart.getTime()) / 1000 / 60);
      }
    });

    if (runtimeData && runtimeData.isTempParking && runtimeData.lastUpdateAt) {
      const tempParkingStart = getDate(runtimeData.lastUpdateAt);
      if (tempParkingStart) {
        parkingMinutes += Math.ceil((endTime.getTime() - tempParkingStart.getTime()) / 1000 / 60);
      }
    }

    const parkingBlocks = Math.ceil(parkingMinutes / PARKING_UNIT_MINUTES);
    const parkingFeeAmount = parkingBlocks * PARKING_UNIT_PRICE;

    const driveMinutes = Math.max(0, totalMinutes - parkingMinutes);
    const timeFeeAmount = driveMinutes * DRIVE_UNIT_PRICE;

    let distanceFeeAmount = 0;
    if (distanceKm <= BASE_KM) {
      distanceFeeAmount = BASE_PRICE;
    } else {
      const extraKm = distanceKm - BASE_KM;
      const extraUnits = Math.ceil(extraKm);
      distanceFeeAmount = BASE_PRICE + (extraUnits * EXTRA_PRICE_PER_KM);
    }

    const totalFee = timeFeeAmount + distanceFeeAmount + parkingFeeAmount;
    const refundAmount = parseFloat(Math.max(0, DEPOSIT_AMOUNT - totalFee).toFixed(2));
    const extraPayAmount = parseFloat(Math.max(0, totalFee - DEPOSIT_AMOUNT).toFixed(2));
    const paymentStatus = extraPayAmount > 0 ? 'pending' : 'paid';
    const settlementStatus = refundAmount > 0 ? 'refunded' : (extraPayAmount > 0 ? 'pending_payment' : 'completed');

    const result = await db.runTransaction(async (transaction) => {
      const settleRes = await transaction.collection('trip_settlements').add({
        data: {
          scenicAreaId: trip.scenicAreaId || 'tianmashan',
          tripId,
          orderId: tripId,
          orderNo: trip.orderNo || tripId,
          openid,
          vehicleId: trip.vehicleId,
          pricingVersion: 'v1_202602',
          depositAmount: DEPOSIT_AMOUNT,
          fee: {
            timeFee: {
              unitPrice: DRIVE_UNIT_PRICE,
              minutesRaw: driveMinutes,
              minutesCeil: driveMinutes,
              amount: parseFloat(timeFeeAmount.toFixed(2))
            },
            distanceFee: {
              baseFee: BASE_PRICE,
              baseKm: BASE_KM,
              extraKmRaw: Math.max(0, distanceKm - BASE_KM),
              extraKmCeil: Math.ceil(Math.max(0, distanceKm - BASE_KM)),
              unitPrice: EXTRA_PRICE_PER_KM,
              amount: parseFloat(distanceFeeAmount.toFixed(2))
            },
            parkingFee: {
              unitPrice: PARKING_UNIT_PRICE,
              blockMin: PARKING_UNIT_MINUTES,
              blocksRaw: parkingMinutes / PARKING_UNIT_MINUTES,
              blocksCeil: parkingBlocks,
              amount: parseFloat(parkingFeeAmount.toFixed(2))
            },
            total: parseFloat(totalFee.toFixed(2))
          },
          total: parseFloat(totalFee.toFixed(2)),
          originalAmountCents: Math.round(totalFee * 100),
          effectiveAmountCents: Math.round(totalFee * 100),
          paymentStatus: extraPayAmount > 0 ? 'demo_pending' : 'demo_paid',
          settlementStatus,
          refundAmount,
          extraPayAmount,
          refundTime: refundAmount > 0 ? db.serverDate() : null,
          createTime: db.serverDate(),
          settledAt: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      const settleId = settleRes._id;

      await transaction.collection('trips').doc(tripId).update({
        data: {
          status: 'completed',
          endTime: db.serverDate(),
          endAt: db.serverDate(),
          endLocation: endLocation || null,
          distance: parseFloat(distanceKm.toFixed(2)),
          distanceKm: parseFloat(distanceKm.toFixed(2)),
          durationMinutes: totalMinutes,
          cost: parseFloat(totalFee.toFixed(2)),
          originalAmountCents: Math.round(totalFee * 100),
          effectiveAmountCents: Math.round(totalFee * 100),
          settleId,
          payStatus: paymentStatus
        }
      });

      await transaction.collection('vehicles').doc(trip.vehicleId).update({
        data: {
          status: 'available',
          activeOrderId: null,
          lat: endLocation && (endLocation.latitude || endLocation.lat),
          lng: endLocation && (endLocation.longitude || endLocation.lng),
          lastUsedTime: db.serverDate()
        }
      });

      return {
        tripId,
        settleId,
        totalFee: totalFee.toFixed(2)
      };
    });

    return {
      code: 0,
      msg: '行程结束成功',
      data: result
    };
  } catch (err) {
    console.error('endTrip error', err);
    return {
      code: 500,
      msg: `服务端错误: ${err.errMsg || err.message}`,
      error: err
    };
  }
};

function getSafeDistanceMeters(distance) {
  const numericDistance = Number(distance);
  if (!Number.isFinite(numericDistance)) {
    return 0;
  }

  return numericDistance * 1000;
}
