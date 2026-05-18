
const LOW_BATTERY_THRESHOLD = 20;
const POSITION_STALE_MS = 60 * 1000;
const POSITION_FUTURE_TOLERANCE_MS = 5 * 1000;

const PARKING_UNIT_PRICE = 1;
const PARKING_UNIT_MINUTES = 10;
const DRIVE_UNIT_PRICE = 0.5;
const BASE_PRICE = 10;
const BASE_KM = 1.5;
const EXTRA_PRICE_PER_KM = 5;
const DEPOSIT_AMOUNT = 200;

function sendApi(res, httpStatus, payload) {
  res.status(httpStatus).json(payload);
}

function ok(res, requestId, msg, data) {
  sendApi(res, 200, {
    code: 0,
    msg: msg || 'ok',
    data: data == null ? null : data,
    requestId
  });
}

function fail(res, requestId, code, msg, httpStatus = 400, data = null) {
  sendApi(res, httpStatus, {
    code,
    msg,
    data,
    requestId
  });
}

function getOpenId(req) {
  const value = req.headers['x-wx-openid'] || req.headers['x-openid'] || req.headers.openid || '';
  return String(value || '').trim();
}

function requireOpenId(req, res) {
  const openid = getOpenId(req);
  if (!openid) {
    fail(res, req.requestId, 'BRIDGE_AUTH_MISSING_OPENID', 'missing openid in request header', 401);
    return null;
  }
  return openid;
}

function isDocumentNotExistError(err) {
  const message = String((err && (err.errMsg || err.message)) || '');
  return message.includes('document not exist');
}

function getTimestamp(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  if (value && typeof value === 'object') {
    if (value.$date) {
      const dateValue = new Date(value.$date).getTime();
      return Number.isFinite(dateValue) ? dateValue : 0;
    }
    if (value._seconds) {
      const second = Number(value._seconds);
      const nano = Number(value._nanoseconds || 0);
      if (Number.isFinite(second)) return second * 1000 + Math.floor(nano / 1e6);
    }
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sortTripsByLatest(trips) {
  if (!Array.isArray(trips)) return [];
  return trips.slice().sort((a, b) => {
    const aTime = Math.max(
      getTimestamp(a.waitStartTime),
      getTimestamp(a.startTime),
      getTimestamp(a.endTime),
      getTimestamp(a.updateTime),
      getTimestamp(a.createTime)
    );
    const bTime = Math.max(
      getTimestamp(b.waitStartTime),
      getTimestamp(b.startTime),
      getTimestamp(b.endTime),
      getTimestamp(b.updateTime),
      getTimestamp(b.createTime)
    );
    return bTime - aTime;
  });
}

function getSingleDoc(result) {
  if (Array.isArray(result?.data)) {
    return result.data.length > 0 ? result.data[0] : null;
  }

  return result && result.data && typeof result.data === 'object'
    ? result.data
    : null;
}

function formatTripData(trip) {
  if (!trip) return null;
  return {
    tripId: trip._id,
    runtimeId: trip.runtimeId || '',
    vehicleId: trip.vehicleId || '',
    ugvID: trip.ugvID || trip.vehicleId || '',
    status: trip.status || '',
    startTime: trip.startTime || null,
    waitStartTime: trip.waitStartTime || null,
    endTime: trip.endTime || null,
    distance: Number(trip.distance || 0),
    cost: Number(trip.cost || 0),
    payStatus: trip.payStatus || '',
    settleId: trip.settleId || ''
  };
}

function getStatusInfo(vehicle) {
  if (vehicle && vehicle.statusInfo && typeof vehicle.statusInfo === 'object') {
    return vehicle.statusInfo;
  }
  return vehicle && vehicle.status && typeof vehicle.status === 'object' ? vehicle.status : {};
}

function getLatestStatus(vehicle) {
  const latestPayload =
    vehicle && vehicle.latestPayload && typeof vehicle.latestPayload === 'object'
      ? vehicle.latestPayload
      : {};

  return latestPayload && latestPayload.payload && typeof latestPayload.payload === 'object'
    ? latestPayload.payload
    : {};
}

function getVehicleBattery(vehicle) {
  const statusInfo = getStatusInfo(vehicle);
  const latestStatus = getLatestStatus(vehicle);
  const battery = Number(vehicle?.battery ?? statusInfo.electiricQuantity ?? latestStatus.electiricQuantity);
  return Number.isFinite(battery) ? battery : null;
}

function getVehicleRuntimeStatus(vehicle) {
  const statusInfo = getStatusInfo(vehicle);
  const latestStatus = getLatestStatus(vehicle);
  const businessStatus = typeof vehicle?.status === 'string' ? vehicle.status : '';
  return statusInfo.status || latestStatus.status || businessStatus || '';
}

function getVehicleAvailabilityStatus(vehicle) {
  const businessStatus = typeof vehicle?.status === 'string' ? vehicle.status : '';
  const runtimeStatus = getVehicleRuntimeStatus(vehicle);
  if (runtimeStatus === 'available' || runtimeStatus === 'online') return 'available';
  if (runtimeStatus === 'faulty' || runtimeStatus === 'maintenance' || runtimeStatus === 'in_use') {
    return runtimeStatus;
  }
  if (runtimeStatus === 'offline') return 'offline';
  return 'available';
}

function getVehicleCoordinates(vehicle) {
  const statusInfo = getStatusInfo(vehicle);
  const latestStatus = getLatestStatus(vehicle);
  const lat = Number(vehicle?.lat ?? vehicle?.latitude ?? statusInfo.latitude ?? latestStatus.latitude);
  const lng = Number(vehicle?.lng ?? vehicle?.longitude ?? statusInfo.longitude ?? latestStatus.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, latitude: lat, longitude: lng };
}

function getVehicleReportAt(vehicle) {
  const statusInfo = getStatusInfo(vehicle);
  const latestStatus = getLatestStatus(vehicle);
  return getTimestamp(vehicle?.lastReportAt ?? statusInfo.timestamp ?? latestStatus.timestamp ?? vehicle?.updatedAt ?? 0);
}

function getVehicleAgeMs(vehicle, now = Date.now()) {
  const reportAt = getVehicleReportAt(vehicle);
  if (!Number.isFinite(reportAt) || reportAt <= 0) return Number.POSITIVE_INFINITY;
  const ageMs = now - reportAt;
  if (ageMs < 0 && Math.abs(ageMs) <= POSITION_FUTURE_TOLERANCE_MS) {
    return 0;
  }
  return ageMs;
}

function isVehicleTelemetryFresh(vehicle, maxAgeMs = POSITION_STALE_MS, now = Date.now()) {
  const ageMs = getVehicleAgeMs(vehicle, now);
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeMs;
}

function getSafeDistanceMeters(distanceKm) {
  const numericDistance = Number(distanceKm);
  if (!Number.isFinite(numericDistance)) return 0;
  return numericDistance * 1000;
}

async function resolveVehicleReference(db, identity) {
  const normalizedIdentity = String(identity || '').trim();
  if (!normalizedIdentity) return null;

  const ugvRes = await db.collection('vehicles').where({ ugvID: normalizedIdentity }).limit(1).get();
  if (Array.isArray(ugvRes.data) && ugvRes.data.length > 0) {
    const vehicle = ugvRes.data[0];
    return { vehicle, vehicleDocId: vehicle._id, ugvID: vehicle.ugvID || normalizedIdentity };
  }

  try {
    const docRes = await db.collection('vehicles').doc(normalizedIdentity).get();
    const vehicle = getSingleDoc(docRes);
    if (!vehicle) return null;
    return { vehicle, vehicleDocId: vehicle._id || normalizedIdentity, ugvID: vehicle.ugvID || normalizedIdentity };
  } catch (err) {
    return null;
  }
}

function getInsertedDocId(result) {
  if (typeof result?.id === 'string' || typeof result?.id === 'number') {
    return result.id;
  }
  if (Array.isArray(result?.ids) && result.ids.length > 0) {
    return result.ids[0];
  }
  if (typeof result?._id === 'string' || typeof result?._id === 'number') {
    return result._id;
  }
  return '';
}

function formatCompletedTrip(trip) {
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

function registerTripGatewayRoutes(app, deps) {
  const { db, withTimeout, dbQueryTimeoutMs, isMqttConnected } = deps;
  const _ = db.command;

  async function listAvailableVehicles(req, res) {
    const requestId = req.requestId;
    const openid = requireOpenId(req, res);
    if (!openid) return;

    try {
      const query = await withTimeout(
        db.collection('vehicles').limit(500).get(),
        dbQueryTimeoutMs,
        'vehicles.available.get'
      );

      const now = Date.now();

      const data = Array.isArray(query?.data)
        ? query.data
            .filter((vehicle) => getVehicleAvailabilityStatus(vehicle) === 'available')
            .filter((vehicle) => isVehicleTelemetryFresh(vehicle, POSITION_STALE_MS, now))
            .filter((vehicle) => Boolean(getVehicleCoordinates(vehicle)))
            .sort((a, b) => getTimestamp(b.lastReportAt) - getTimestamp(a.lastReportAt))
        : [];

      ok(res, requestId, 'ok', data);
    } catch (err) {
      if (err && err.code === 'DB_TIMEOUT') {
        fail(res, requestId, 'DB_TIMEOUT', 'Database query timeout', 504);
        return;
      }
      console.error('[TRIP] list vehicles error:', err);
      fail(res, requestId, 500, 'list vehicles failed', 500);
    }
  }

  async function getActiveTrip(req, res) {
    const requestId = req.requestId;
    const openid = requireOpenId(req, res);
    if (!openid) return;

    try {
      const result = await withTimeout(
        db.collection('trips').where({ openid, status: _.in(['waiting_pickup', 'active']) }).limit(20).get(),
        dbQueryTimeoutMs,
        'trips.active.get'
      );

      const list = sortTripsByLatest(result.data || []);
      const trip = list[0] || null;
      ok(res, requestId, trip ? 'found trip' : 'no active trip', trip ? formatTripData(trip) : null);
    } catch (err) {
      if (err && err.code === 'DB_TIMEOUT') {
        fail(res, requestId, 'DB_TIMEOUT', 'Database query timeout', 504);
        return;
      }
      console.error('[TRIP] get active trip error:', err);
      fail(res, requestId, 500, 'checkActiveTrip failed', 500);
    }
  }

  async function unlockTrip(req, res) {
    const requestId = req.requestId;
    const openid = requireOpenId(req, res);
    if (!openid) return;

    if (!isMqttConnected()) {
      fail(res, requestId, 'BRIDGE_MQTT_UNAVAILABLE', 'MQTT is not connected, please retry later', 503);
      return;
    }

    const vehicleIdentity = (req.body && (req.body.ugvID || req.body.vehicleId)) || '';
    if (!vehicleIdentity) {
      fail(res, requestId, 1001, 'missing vehicle id');
      return;
    }

    try {
      const activeTripRes = await withTimeout(
        db.collection('trips').where({ openid, status: _.in(['active', 'waiting_pickup']) }).limit(20).get(),
        dbQueryTimeoutMs,
        'trips.user-active.get'
      );

      const activeTrip = sortTripsByLatest(activeTripRes.data || [])[0] || null;
      if (activeTrip) {
        fail(res, requestId, 1002, 'you have unfinished trip', 200, formatTripData(activeTrip));
        return;
      }

      const resolvedVehicle = await resolveVehicleReference(db, vehicleIdentity);
      if (!resolvedVehicle || !resolvedVehicle.vehicle || !resolvedVehicle.vehicleDocId) {
        fail(res, requestId, 1003, 'vehicle not found');
        return;
      }

      const { vehicle, vehicleDocId, ugvID } = resolvedVehicle;
      const vehicleActiveTripByUgv = await db.collection('trips').where({ ugvID, status: _.in(['active', 'waiting_pickup']) }).limit(1).get();
      const vehicleActiveTripByDocId = await db.collection('trips').where({ vehicleId: vehicleDocId, status: _.in(['active', 'waiting_pickup']) }).limit(1).get();

      if ((vehicleActiveTripByUgv.data || []).length > 0 || (vehicleActiveTripByDocId.data || []).length > 0) {
        fail(res, requestId, 1005, 'vehicle already in use');
        return;
      }

      const runtimeStatus = getVehicleRuntimeStatus(vehicle);
      const availabilityStatus = getVehicleAvailabilityStatus(vehicle);
      if (runtimeStatus === 'faulty' || runtimeStatus === 'maintenance' || vehicle.faultCode) {
        fail(res, requestId, 1007, 'vehicle faulty');
        return;
      }

      const battery = getVehicleBattery(vehicle);
      if (battery !== null && battery < LOW_BATTERY_THRESHOLD) {
        fail(res, requestId, 1006, 'battery too low');
        return;
      }

      if (!isVehicleTelemetryFresh(vehicle)) {
        fail(res, requestId, 'BRIDGE_VEHICLE_STATUS_STALE', 'vehicle status stale', 409, {
          reportAt: getVehicleReportAt(vehicle),
          now: Date.now(),
          staleMs: POSITION_STALE_MS
        });
        return;
      }

      if (availabilityStatus !== 'available') {
        fail(res, requestId, 1004, 'vehicle unavailable', 200, { status: availabilityStatus });
        return;
      }

      const result = await db.runTransaction(async (transaction) => {
        const latestVehicleRes = await transaction.collection('vehicles').doc(vehicleDocId).get();
        const latestVehicle = latestVehicleRes && latestVehicleRes.data ? latestVehicleRes.data : null;
        if (!latestVehicle) throw new Error('vehicle_not_found');

        const latestAvailabilityStatus = getVehicleAvailabilityStatus(latestVehicle);
        if (latestAvailabilityStatus !== 'available') throw new Error('vehicle_busy');

        const latestBattery = getVehicleBattery(latestVehicle);
        if (latestBattery !== null && latestBattery < LOW_BATTERY_THRESHOLD) throw new Error('vehicle_low_battery');

        if (!isVehicleTelemetryFresh(latestVehicle)) throw new Error('vehicle_stale');
        const latestStatusInfo = getStatusInfo(latestVehicle);
        const latestStatus = getLatestStatus(latestVehicle);
        const vehicleModel =
          latestVehicle.model ||
          latestStatusInfo.model ||
          latestStatus.model ||
          'oMo_Standard';

        await transaction.collection('vehicles').doc(vehicleDocId).update({
          status: 'in_use',
          lastUsedTime: db.serverDate(),
          updateTime: db.serverDate()
        });

        const tripRes = await transaction.collection('trips').add({
          openid,
          vehicleId: vehicleDocId,
          vehicleModel,
          startTime: null,
          waitStartTime: db.serverDate(),
          status: 'waiting_pickup',
          startLocation: {
            lat: latestVehicle.lat,
            lng: latestVehicle.lng
          },
          cost: 0,
          distance: 0,
          payStatus: 'unpaid',
          runtimeId: null,
          settleId: null,
          ugvID,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        });

        const tripId = getInsertedDocId(tripRes);
        if (!tripId) throw new Error('trip_insert_failed');
        const runtimeRes = await transaction.collection('trip_runtime').add({
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
        });

        const runtimeId = getInsertedDocId(runtimeRes);
        if (!runtimeId) throw new Error('runtime_insert_failed');
        await transaction.collection('trips').doc(tripId).update({
          runtimeId,
          updateTime: db.serverDate()
        });

        return { tripId, runtimeId, vehicleId: vehicleDocId, ugvID };
      });

      ok(res, requestId, 'unlock success', result);
    } catch (err) {
      if (err.message === 'vehicle_busy') {
        fail(res, requestId, 1005, 'vehicle already in use');
        return;
      }
      if (err.message === 'vehicle_low_battery') {
        fail(res, requestId, 1006, 'battery too low');
        return;
      }
      if (err.message === 'vehicle_stale') {
        fail(res, requestId, 'BRIDGE_VEHICLE_STATUS_STALE', 'vehicle status stale', 409, {
          staleMs: POSITION_STALE_MS
        });
        return;
      }
      if (err.message === 'vehicle_not_found') {
        fail(res, requestId, 1003, 'vehicle not found');
        return;
      }
      if (isDocumentNotExistError(err)) {
        fail(res, requestId, 1003, 'vehicle not found');
        return;
      }

      const reason = String((err && (err.errMsg || err.message)) || 'unknown error');
      console.error('[TRIP] unlock error:', { requestId, openid, vehicleIdentity, reason, err });
      fail(res, requestId, 500, 'unlock failed', 500, { reason });
    }
  }
  async function startTrip(req, res) {
    const requestId = req.requestId;
    const openid = requireOpenId(req, res);
    if (!openid) return;

    const tripId = req.body && req.body.tripId;
    if (!tripId) {
      fail(res, requestId, 1001, 'missing tripId');
      return;
    }

    try {
      const tripRes = await db.collection('trips').doc(tripId).get();
      const trip = getSingleDoc(tripRes);

      if (!trip) {
        fail(res, requestId, 1002, 'trip not found');
        return;
      }
      if (trip.openid !== openid) {
        fail(res, requestId, 1003, 'forbidden');
        return;
      }

      if (trip.status === 'active' && trip.startTime) {
        ok(res, requestId, 'already active', {
          tripId,
          startTime: getTimestamp(trip.startTime)
        });
        return;
      }

      if (trip.status !== 'waiting_pickup') {
        fail(res, requestId, 1004, 'trip status not allowed');
        return;
      }

      const now = Date.now();
      await db.collection('trips').doc(tripId).update({
        status: 'active',
        startTime: new Date(now),
        updateTime: db.serverDate()
      });

      ok(res, requestId, 'start success', {
        tripId,
        startTime: now
      });
    } catch (err) {
      if (isDocumentNotExistError(err)) {
        fail(res, requestId, 1002, 'trip not found');
        return;
      }
      console.error('[TRIP] start error:', err);
      fail(res, requestId, 500, 'startTrip failed', 500);
    }
  }

  async function updateTripRuntime(req, res) {
    const requestId = req.requestId;
    const openid = requireOpenId(req, res);
    if (!openid) return;

    const { runtimeId, distanceIncrement, location, parkingAction } = req.body || {};
    if (!runtimeId) {
      fail(res, requestId, 1001, 'missing runtimeId');
      return;
    }

    try {
      let runtimeDoc;
      try {
        runtimeDoc = await db.collection('trip_runtime').doc(runtimeId).get();
      } catch (e) {
        if (isDocumentNotExistError(e)) {
          fail(res, requestId, 1002, 'runtime not found');
          return;
        }
        throw e;
      }

      const runtime = runtimeDoc && runtimeDoc.data ? runtimeDoc.data : null;
      if (!runtime) {
        fail(res, requestId, 1002, 'runtime not found');
        return;
      }

      if (runtime.openid && runtime.openid !== openid) {
        fail(res, requestId, 1003, 'forbidden');
        return;
      }

      if (runtime.tripId) {
        try {
          const tripDoc = await db.collection('trips').doc(runtime.tripId).get();
          const trip = tripDoc && tripDoc.data ? tripDoc.data : null;
          if (!trip || trip.openid !== openid) {
            fail(res, requestId, 1003, 'forbidden');
            return;
          }
        } catch (e) {
          if (isDocumentNotExistError(e)) {
            fail(res, requestId, 1002, 'trip not found');
            return;
          }
          throw e;
        }
      }

      const updateData = {
        lastUpdateAt: db.serverDate(),
        updateTime: db.serverDate()
      };

      const numericDistanceIncrement = Number(distanceIncrement);
      if (Number.isFinite(numericDistanceIncrement) && numericDistanceIncrement > 0) {
        updateData.distanceMetersRaw = _.inc(numericDistanceIncrement);
      }

      if (location && typeof location === 'object') {
        const lat = Number(location.lat ?? location.latitude);
        const lng = Number(location.lng ?? location.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          updateData.lastLocation = { lat, lng };
        }
      }

      if (parkingAction) {
        if (parkingAction === 'start') {
          updateData.isTempParking = true;
          updateData.parkingSessions = _.push({
            startAt: db.serverDate(),
            endAt: null,
            durationSec: 0,
            fee: 0
          });
        } else if (parkingAction === 'end') {
          updateData.isTempParking = false;
          const doc = await db.collection('trip_runtime').doc(runtimeId).get();
          const sessions = doc?.data?.parkingSessions || [];
          if (sessions.length > 0) {
            const lastSession = sessions[sessions.length - 1];
            if (!lastSession.endAt) {
              lastSession.endAt = new Date();
            }
            updateData.parkingSessions = sessions;
          }
        }
      }

      await db.collection('trip_runtime').doc(runtimeId).update(updateData);

      ok(res, requestId, 'runtime updated');
    } catch (err) {
      console.error('[TRIP] runtime update error:', err);
      fail(res, requestId, 500, 'runtime update failed', 500);
    }
  }

  async function endTrip(req, res) {
    const requestId = req.requestId;
    const openid = requireOpenId(req, res);
    if (!openid) return;

    if (!isMqttConnected()) {
      fail(res, requestId, 'BRIDGE_MQTT_UNAVAILABLE', 'MQTT is not connected, please retry later', 503);
      return;
    }

    const { tripId, distance } = req.body || {};
    if (!tripId) {
      fail(res, requestId, 1001, 'missing tripId');
      return;
    }

    try {
      const tripRes = await db.collection('trips').doc(tripId).get();
      const trip = getSingleDoc(tripRes);

      if (!trip) {
        fail(res, requestId, 1002, 'trip not found');
        return;
      }
      if (trip.status !== 'active') {
        fail(res, requestId, 1003, 'trip already ended or invalid');
        return;
      }
      if (trip.openid !== openid) {
        fail(res, requestId, 1004, 'forbidden');
        return;
      }

      let runtimeData = null;
      if (trip.runtimeId) {
        try {
          const runtimeRes = await db.collection('trip_runtime').doc(trip.runtimeId).get();
          runtimeData = getSingleDoc(runtimeRes);
        } catch (e) {
          runtimeData = null;
        }
      } else {
        const runtimeRes = await db.collection('trip_runtime').where({ tripId }).limit(1).get();
        runtimeData = Array.isArray(runtimeRes.data) && runtimeRes.data.length > 0 ? runtimeRes.data[0] : null;
      }

      let vehicleDoc = null;
      if (trip.ugvID) {
        const ugvVehicleRes = await db.collection('vehicles').where({ ugvID: trip.ugvID }).limit(1).get();
        vehicleDoc = Array.isArray(ugvVehicleRes.data) && ugvVehicleRes.data.length > 0 ? ugvVehicleRes.data[0] : null;
      }
      if (!vehicleDoc && trip.vehicleId) {
        try {
          const vehicleRes = await db.collection('vehicles').doc(trip.vehicleId).get();
          vehicleDoc = getSingleDoc(vehicleRes);
        } catch (e) {
          vehicleDoc = null;
        }
      }

      const coordinates = getVehicleCoordinates(vehicleDoc);
      const reportAt = getVehicleReportAt(vehicleDoc);
      const ageMs = reportAt > 0 ? Date.now() - reportAt : Number.POSITIVE_INFINITY;

      if (!coordinates || !Number.isFinite(ageMs) || ageMs > POSITION_STALE_MS) {
        fail(res, requestId, 'BRIDGE_VEHICLE_POSITION_STALE', 'vehicle position stale', 409, {
          reportAt,
          now: Date.now(),
          staleMs: POSITION_STALE_MS
        });
        return;
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

      const parkingSessions = runtimeData && Array.isArray(runtimeData.parkingSessions) ? runtimeData.parkingSessions : [];
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
        distanceFeeAmount = BASE_PRICE + extraUnits * EXTRA_PRICE_PER_KM;
      }

      const totalFee = timeFeeAmount + distanceFeeAmount + parkingFeeAmount;
      const refundAmount = parseFloat(Math.max(0, DEPOSIT_AMOUNT - totalFee).toFixed(2));
      const extraPayAmount = parseFloat(Math.max(0, totalFee - DEPOSIT_AMOUNT).toFixed(2));
      const paymentStatus = extraPayAmount > 0 ? 'pending' : 'paid';
      const settlementStatus = refundAmount > 0 ? 'refunded' : (extraPayAmount > 0 ? 'pending_payment' : 'completed');

      const result = await db.runTransaction(async (transaction) => {
        const settleRes = await transaction.collection('trip_settlements').add({
          tripId,
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
          settlementStatus,
          refundAmount,
          extraPayAmount,
          refundTime: refundAmount > 0 ? db.serverDate() : null,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        });
        const settleId = getInsertedDocId(settleRes);
        if (!settleId) throw new Error('settlement_insert_failed');
        const endLocation = {
          lat: coordinates.lat,
          lng: coordinates.lng,
          latitude: coordinates.lat,
          longitude: coordinates.lng
        };

        await transaction.collection('trips').doc(tripId).update({
          status: 'completed',
          endTime: db.serverDate(),
          endLocation,
          endLocationSource: 'mqtt-bridge',
          endLocationReportAt: reportAt,
          distance: parseFloat(distanceKm.toFixed(2)),
          cost: parseFloat(totalFee.toFixed(2)),
          settleId,
          payStatus: paymentStatus,
          updateTime: db.serverDate()
        });

        if (trip.vehicleId) {
          await transaction.collection('vehicles').doc(trip.vehicleId).update({
            status: 'available',
            lat: coordinates.lat,
            lng: coordinates.lng,
            lastUsedTime: db.serverDate(),
            updateTime: db.serverDate()
          });
        }

        return {
          tripId,
          settleId,
          totalFee: Number(totalFee.toFixed(2)),
          endLocation,
          endLocationSource: 'mqtt-bridge',
          endLocationReportAt: reportAt
        };
      });

      ok(res, requestId, 'trip ended', result);
    } catch (err) {
      if (isDocumentNotExistError(err)) {
        fail(res, requestId, 1002, 'trip not found');
        return;
      }
      console.error('[TRIP] end error:', err);
      fail(res, requestId, 500, 'endTrip failed', 500);
    }
  }

  async function cancelTrip(req, res) {
    const requestId = req.requestId;
    const openid = requireOpenId(req, res);
    if (!openid) return;

    const { tripId } = req.body || {};
    if (!tripId) {
      fail(res, requestId, 1001, 'missing tripId');
      return;
    }

    try {
      const result = await db.runTransaction(async (transaction) => {
        const tripRes = await transaction.collection('trips').doc(tripId).get();
        const trip = getSingleDoc(tripRes);

        if (!trip) throw new Error('trip_not_found');
        if (trip.openid !== openid) throw new Error('forbidden');
        if (trip.status === 'active') throw new Error('already_active');
        if (trip.status !== 'waiting_pickup') return { skipped: true };

        await transaction.collection('trips').doc(tripId).update({
          status: 'cancelled',
          cancelTime: db.serverDate(),
          updateTime: db.serverDate()
        });

        if (trip.vehicleId) {
          await transaction.collection('vehicles').doc(trip.vehicleId).update({
            status: 'available',
            updateTime: db.serverDate()
          });
        }

        return { skipped: false };
      });

      if (result && result.skipped) {
        ok(res, requestId, 'trip already finished');
        return;
      }
      ok(res, requestId, 'cancelled');
    } catch (err) {
      if (err.message === 'trip_not_found') {
        fail(res, requestId, 1002, 'trip not found');
        return;
      }
      if (err.message === 'forbidden') {
        fail(res, requestId, 1003, 'forbidden');
        return;
      }
      if (err.message === 'already_active') {
        fail(res, requestId, 1004, 'trip already active');
        return;
      }
      console.error('[TRIP] cancel error:', err);
      fail(res, requestId, 500, 'cancelWaitingTrip failed', 500);
    }
  }

  async function listCompletedTrips(req, res) {
    const requestId = req.requestId;
    const openid = requireOpenId(req, res);
    if (!openid) return;

    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));

    try {
      const result = await withTimeout(
        db.collection('trips').where({ openid, status: 'completed' }).limit(limit).get(),
        dbQueryTimeoutMs,
        'trips.completed.get'
      );

      const list = sortTripsByLatest(result.data || []).map(formatCompletedTrip);
      ok(res, requestId, 'ok', list);
    } catch (err) {
      if (err && err.code === 'DB_TIMEOUT') {
        fail(res, requestId, 'DB_TIMEOUT', 'Database query timeout', 504);
        return;
      }
      console.error('[TRIP] list completed error:', err);
      fail(res, requestId, 500, 'list completed trips failed', 500);
    }
  }

  async function getTripDetail(req, res) {
    const requestId = req.requestId;
    const openid = requireOpenId(req, res);
    if (!openid) return;

    const tripId = req.query.tripId || req.body?.tripId;
    if (!tripId) {
      fail(res, requestId, 1001, 'missing tripId');
      return;
    }

    try {
      const tripRes = await withTimeout(
        db.collection('trips').doc(tripId).get(),
        dbQueryTimeoutMs,
        'trips.detail.get'
      );
      const trip = getSingleDoc(tripRes);
      if (!trip) {
        fail(res, requestId, 1002, 'trip not found');
        return;
      }
      if (trip.openid !== openid) {
        fail(res, requestId, 1003, 'forbidden');
        return;
      }

      let settlement = null;
      if (trip.settleId) {
        try {
          const settleRes = await withTimeout(
            db.collection('trip_settlements').doc(trip.settleId).get(),
            dbQueryTimeoutMs,
            'trip_settlements.detail.get'
          );
          settlement = getSingleDoc(settleRes);
        } catch (e) {
          settlement = null;
        }
      }

      let runtime = null;
      if (trip.runtimeId) {
        try {
          const runtimeRes = await withTimeout(
            db.collection('trip_runtime').doc(trip.runtimeId).get(),
            dbQueryTimeoutMs,
            'trip_runtime.detail.get'
          );
          runtime = getSingleDoc(runtimeRes);
        } catch (e) {
          runtime = null;
        }
      }

      ok(res, requestId, 'ok', {
        trip: {
          ...trip,
          tripId: trip._id
        },
        settlement,
        runtime
      });
    } catch (err) {
      if (err && err.code === 'DB_TIMEOUT') {
        fail(res, requestId, 'DB_TIMEOUT', 'Database query timeout', 504);
        return;
      }
      if (isDocumentNotExistError(err)) {
        fail(res, requestId, 1002, 'trip not found');
        return;
      }
      console.error('[TRIP] detail error:', err);
      fail(res, requestId, 500, 'get trip detail failed', 500);
    }
  }

  ['', '/mqtt'].forEach((prefix) => {
    app.get(`${prefix}/vehicles/available`, listAvailableVehicles);
    app.get(`${prefix}/trip/active`, getActiveTrip);
    app.post(`${prefix}/trip/unlock`, unlockTrip);
    app.post(`${prefix}/trip/start`, startTrip);
    app.post(`${prefix}/trip/runtime`, updateTripRuntime);
    app.post(`${prefix}/trip/end`, endTrip);
    app.post(`${prefix}/trip/cancel`, cancelTrip);
    app.get(`${prefix}/trips/completed`, listCompletedTrips);
    app.get(`${prefix}/trip/detail`, getTripDetail);
  });
}

module.exports = {
  registerTripGatewayRoutes
};
