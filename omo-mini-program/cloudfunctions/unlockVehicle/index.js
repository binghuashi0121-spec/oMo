const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const LOW_BATTERY_THRESHOLD = 20;

function buildOrderNo(now = Date.now()) {
  return `OM${now}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

async function resolveVehicleReference(identity) {
  const normalizedIdentity = String(identity || '').trim();
  if (!normalizedIdentity) {
    return null;
  }

  const ugvRes = await db.collection('vehicles').where({
    ugvID: normalizedIdentity
  }).limit(1).get();

  if (Array.isArray(ugvRes.data) && ugvRes.data.length > 0) {
    const vehicle = ugvRes.data[0];
    return {
      vehicle,
      vehicleDocId: vehicle._id,
      ugvID: vehicle.ugvID || normalizedIdentity
    };
  }

  try {
    const docRes = await db.collection('vehicles').doc(normalizedIdentity).get();
    const vehicle = docRes.data || null;

    if (!vehicle) {
      return null;
    }

    return {
      vehicle,
      vehicleDocId: vehicle._id || normalizedIdentity,
      ugvID: vehicle.ugvID || normalizedIdentity
    };
  } catch (err) {
    return null;
  }
}

function getTimestamp(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) return numericValue;
  const parsedValue = new Date(value).getTime();
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function pickLatestTrip(trips) {
  if (!Array.isArray(trips) || trips.length === 0) {
    return null;
  }

  return trips
    .slice()
    .sort((a, b) => {
      const aTime = Math.max(
        getTimestamp(a.waitStartTime),
        getTimestamp(a.startTime),
        getTimestamp(a.updateTime),
        getTimestamp(a.createTime)
      );
      const bTime = Math.max(
        getTimestamp(b.waitStartTime),
        getTimestamp(b.startTime),
        getTimestamp(b.updateTime),
        getTimestamp(b.createTime)
      );
      return bTime - aTime;
    })[0];
}

function formatTripData(trip) {
  if (!trip) return null;

  return {
    tripId: trip._id,
    runtimeId: trip.runtimeId || '',
    vehicleId: trip.vehicleId || '',
    ugvID: trip.ugvID || trip.vehicleId || '',
    status: trip.status || 'active',
    startTime: trip.startTime || null,
    waitStartTime: trip.waitStartTime || null
  };
}

function getVehicleStatusInfo(vehicle) {
  if (vehicle && vehicle.statusInfo && typeof vehicle.statusInfo === 'object') {
    return vehicle.statusInfo;
  }

  return vehicle && vehicle.status && typeof vehicle.status === 'object'
    ? vehicle.status
    : {};
}

function getVehicleLatestStatus(vehicle) {
  const latestPayload =
    vehicle && vehicle.latestPayload && typeof vehicle.latestPayload === 'object'
      ? vehicle.latestPayload
      : {};

  return latestPayload && latestPayload.payload && typeof latestPayload.payload === 'object'
    ? latestPayload.payload
    : {};
}

function getVehicleBattery(vehicle) {
  const statusInfo = getVehicleStatusInfo(vehicle);
  const latestStatus = getVehicleLatestStatus(vehicle);

  const battery = Number(
    vehicle.battery ?? statusInfo.electiricQuantity ?? latestStatus.electiricQuantity
  );

  return Number.isFinite(battery) ? battery : null;
}

function getVehicleRuntimeStatus(vehicle) {
  const statusInfo = getVehicleStatusInfo(vehicle);
  const latestStatus = getVehicleLatestStatus(vehicle);
  const businessStatus = typeof vehicle.status === 'string' ? vehicle.status : '';

  return statusInfo.status || latestStatus.status || businessStatus || '';
}

function getVehicleAvailabilityStatus(vehicle) {
  const businessStatus = typeof vehicle.status === 'string' ? vehicle.status : '';
  const runtimeStatus = getVehicleRuntimeStatus(vehicle);

  if (businessStatus) {
    return businessStatus;
  }

  if (runtimeStatus === 'faulty' || runtimeStatus === 'maintenance' || runtimeStatus === 'in_use') {
    return runtimeStatus;
  }

  if (runtimeStatus === 'offline') {
    return 'offline';
  }

  // 'available' and 'online' are both usable
  return 'available';
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const vehicleIdentity = (event && (event.ugvID || event.vehicleId)) || '';

  if (!vehicleIdentity) {
    return { code: 1001, msg: '缺少车辆ID' };
  }

  try {
    const activeTripRes = await db.collection('trips').where({
      openid,
      status: _.in(['active', 'waiting_pickup'])
    }).limit(20).get();

    const activeTrip = pickLatestTrip(activeTripRes.data);

    if (activeTrip) {
      return {
        code: 1002,
        msg: '您有未结束的行程，请先结束',
        data: formatTripData(activeTrip)
      };
    }

    const resolvedVehicle = await resolveVehicleReference(vehicleIdentity);
    if (!resolvedVehicle || !resolvedVehicle.vehicle || !resolvedVehicle.vehicleDocId) {
      return { code: 1003, msg: '车辆不存在' };
    }

    const { vehicle, vehicleDocId, ugvID } = resolvedVehicle;

    const vehicleActiveTripByUgv = await db.collection('trips').where({
      ugvID,
      status: _.in(['active', 'waiting_pickup'])
    }).limit(1).get();

    const vehicleActiveTripByDocId = await db.collection('trips').where({
      vehicleId: vehicleDocId,
      status: _.in(['active', 'waiting_pickup'])
    }).limit(1).get();

    if (
      (vehicleActiveTripByUgv.data && vehicleActiveTripByUgv.data.length > 0) ||
      (vehicleActiveTripByDocId.data && vehicleActiveTripByDocId.data.length > 0)
    ) {
      return { code: 1005, msg: '车辆已被他人扫码' };
    }

    const runtimeStatus = getVehicleRuntimeStatus(vehicle);
    const availabilityStatus = getVehicleAvailabilityStatus(vehicle);

    if (runtimeStatus === 'faulty' || runtimeStatus === 'maintenance' || vehicle.faultCode) {
      return { code: 1007, msg: '车辆故障，暂不可用' };
    }

    const battery = getVehicleBattery(vehicle);
    if (battery !== null && battery < LOW_BATTERY_THRESHOLD) {
      return { code: 1006, msg: '电量过低，无法使用' };
    }

    if (availabilityStatus !== 'available') {
      return { code: 1004, msg: '车辆暂不可用', status: availabilityStatus };
    }

    const orderNo = buildOrderNo();
    const scenicAreaId = vehicle.scenicAreaId || 'tianmashan';
    const result = await db.runTransaction(async (transaction) => {
      const v = await transaction.collection('vehicles').doc(vehicleDocId).get();
      const latestAvailabilityStatus = getVehicleAvailabilityStatus(v.data);
      if (latestAvailabilityStatus !== 'available') {
        await transaction.rollback('vehicle_busy');
      }

      const latestBattery = getVehicleBattery(v.data);
      if (latestBattery !== null && latestBattery < LOW_BATTERY_THRESHOLD) {
        await transaction.rollback('vehicle_low_battery');
      }

      await transaction.collection('vehicles').doc(vehicleDocId).update({
        data: {
          status: 'active',
          lastUsedTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      const tripRes = await transaction.collection('trips').add({
        data: {
          scenicAreaId,
          orderNo,
          openid,
          vehicleId: vehicleDocId,
          vehicleNo: ugvID,
          vehicleModel: vehicle.model,
          startTime: null,
          startAt: null,
          waitStartTime: db.serverDate(),
          status: 'waiting_pickup',
          startLocation: {
            lat: vehicle.lat,
            lng: vehicle.lng
          },
          cost: 0,
          originalAmountCents: 0,
          effectiveAmountCents: 0,
          distance: 0,
          distanceKm: 0,
          durationMinutes: 0,
          payStatus: 'unpaid',
          runtimeId: null,
          settleId: null,
          ugvID,
          createdAt: db.serverDate(),
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      const tripId = tripRes._id;

      const runtimeRes = await transaction.collection('trip_runtime').add({
        data: {
          scenicAreaId,
          tripId,
          vehicleId: vehicleDocId,
          ugvID,
          openid,
          distanceMetersRaw: 0,
          isTempParking: false,
          parkingSessions: [],
          lastUpdateAt: db.serverDate(),
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      const runtimeId = runtimeRes._id;

      await transaction.collection('trips').doc(tripId).update({
        data: {
          runtimeId,
          updateTime: db.serverDate()
        }
      });
      await transaction.collection('vehicles').doc(vehicleDocId).update({
        data: { activeOrderId: tripId, updateTime: db.serverDate() }
      });

      return {
        tripId,
        runtimeId,
        vehicleId: vehicleDocId,
        ugvID,
        orderNo,
        scenicAreaId
      };
    });

    return {
      code: 0,
      msg: '开锁成功',
      data: result
    };
  } catch (err) {
    console.error('unlockVehicle error', err);

    if (err.message === 'vehicle_busy') {
      return { code: 1005, msg: '车辆已被他人扫码' };
    }

    if (err.message === 'vehicle_low_battery') {
      return { code: 1006, msg: '电量过低，无法使用' };
    }

    if (err.errMsg && err.errMsg.includes('document not exist')) {
      return { code: 1003, msg: '车辆不存在' };
    }

    return {
      code: 500,
      msg: `服务器错误: ${err.errMsg || err.message}`,
      error: err
    };
  }
};
