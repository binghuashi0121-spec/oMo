const INITIAL_POSITION = { latitude: 28.17314, longitude: 112.94170 };
const SPEED_LIMITS = { 1: 1, 2: 2, 5: 5 };
const EARTH_RADIUS_METERS = 6371000;

function distanceMeters(from, to) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLng = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createVehicleSimulator(deviceId) {
  const state = {
    ugvID: deviceId, mode: 0, speedMode: 2, status: 'idle', electiricQuantity: 85,
    longitude: INITIAL_POSITION.longitude, latitude: INITIAL_POSITION.latitude,
    altitude: 300, speed: 0, isCharging: 0, autoStatus: 0,
    total_metre: 1234.5, odom_metre: 0,
  };
  let destination = null;
  let plannedDistance = 0;
  let lastTickAt = null;
  let lastMoveAt = null;
  let steering = 0;
  const responses = new Map();

  function response(header, code, message, extra = {}, now = Date.now()) {
    return {
      header: {
        messageNo: `resp-${String(header?.messageNo || now)}`,
        messageType: String(header?.messageType || ''), timestamp: now,
      },
      payload: { ugvID: deviceId, ret_code: code, ret_msg: message, ...extra },
    };
  }

  function receive(packet, now = Date.now()) {
    const header = packet?.header;
    const payload = packet?.payload;
    const type = String(header?.messageType || '');
    const id = String(header?.messageNo || '');
    if (!header || !payload || typeof payload !== 'object' || !type || !id) {
      return response(header, 400, 'invalid packet', {}, now);
    }
    if (payload.ugvID !== deviceId) return response(header, 403, 'wrong vehicle', {}, now);
    if (responses.has(id)) return responses.get(id);

    let result;
    if (type === 'ugvSetMode') {
      const mode = payload.mode;
      if (![0, 1, 2, 3].includes(mode) || !Object.hasOwn(SPEED_LIMITS, payload.speedMode)) {
        result = response(header, 400, 'invalid mode', {}, now);
      } else {
        state.mode = mode;
        state.speedMode = payload.speedMode;
        state.speed = 0;
        lastMoveAt = null;
        if (mode !== 2) {
          destination = null;
          plannedDistance = 0;
          state.autoStatus = mode === 0 ? 5 : 0;
        }
        result = response(header, 0, 'ok', {}, now);
      }
    } else if (type === 'ugvSetMove') {
      if (state.mode !== 1 || typeof payload.speed !== 'number' ||
          typeof payload.angle !== 'number' || !Number.isFinite(payload.speed) ||
          !Number.isFinite(payload.angle) || Math.abs(payload.speed) > 1 || Math.abs(payload.angle) > 1) {
        result = response(header, 409, 'move requires APP mode and ratios within -1..1', {}, now);
      } else {
        state.speed = payload.speed * SPEED_LIMITS[state.speedMode];
        steering = payload.angle;
        lastMoveAt = now;
        result = response(header, 0, 'ok', {}, now);
      }
    } else if (type === 'autoDriving') {
      const option = payload.opt_mode;
      if (option === 1) {
        const point = { latitude: payload.latitude, longitude: payload.longitude };
        const distance = distanceMeters(state, point);
        if (state.mode !== 2 || !Number.isFinite(distance) || distance <= 0 || distance > 1000 ||
            !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
            Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) {
          result = response(header, 409, 'route requires auto mode and a destination within 1000m', {}, now);
        } else {
          destination = point;
          plannedDistance = distance;
          state.odom_metre = 0;
          state.autoStatus = 1;
          state.speed = 0;
          result = response(header, 0, 'ok', { total_distance: distance }, now);
        }
      } else if (option === 2) {
        if (state.mode !== 2 || state.autoStatus !== 1 || !destination ||
            typeof payload.max_speed !== 'number' || payload.max_speed <= 0 || payload.max_speed > 5) {
          result = response(header, 409, 'start requires a planned route and valid speed', {}, now);
        } else {
          state.autoStatus = 2;
          state.speed = payload.max_speed;
          lastTickAt = now;
          result = response(header, 0, 'ok', {}, now);
        }
      } else if (option === 3 && state.autoStatus === 2) {
        state.autoStatus = 3;
        state.speed = 0;
        result = response(header, 0, 'ok', {}, now);
      } else if (option === 4 && state.autoStatus === 3 && destination) {
        state.autoStatus = 2;
        state.speed = Math.min(SPEED_LIMITS[state.speedMode], 5);
        lastTickAt = now;
        result = response(header, 0, 'ok', {}, now);
      } else if (option === 5) {
        state.autoStatus = 5;
        state.mode = 0;
        state.speed = 0;
        destination = null;
        plannedDistance = 0;
        result = response(header, 0, 'ok', {}, now);
      } else {
        result = response(header, 409, 'invalid auto-driving transition', {}, now);
      }
    } else {
      result = response(header, 400, 'unsupported command', {}, now);
    }

    responses.set(id, result);
    if (responses.size > 100) responses.delete(responses.keys().next().value);
    return result;
  }

  function tick(now = Date.now()) {
    const deltaSeconds = lastTickAt === null ? 0 : Math.min(5, Math.max(0, now - lastTickAt) / 1000);
    lastTickAt = now;
    if (state.mode === 1 && lastMoveAt !== null && now - lastMoveAt > 2000) {
      state.mode = 0;
      state.speed = 0;
      lastMoveAt = null;
    }
    if (state.mode === 1 && state.speed !== 0) {
      const moved = Math.abs(state.speed) * deltaSeconds;
      state.latitude += state.speed * deltaSeconds / 111000;
      state.longitude += steering * moved / 111000;
      state.total_metre += moved;
    }
    if (state.mode === 2 && state.autoStatus === 2 && destination && deltaSeconds > 0) {
      const remaining = distanceMeters(state, destination);
      const moved = Math.min(remaining, state.speed * deltaSeconds);
      const fraction = remaining > 0 ? moved / remaining : 1;
      state.latitude += (destination.latitude - state.latitude) * fraction;
      state.longitude += (destination.longitude - state.longitude) * fraction;
      state.total_metre += moved;
      state.odom_metre = Math.min(plannedDistance, state.odom_metre + moved);
      if (moved >= remaining - 0.01) {
        state.latitude = destination.latitude;
        state.longitude = destination.longitude;
        state.speed = 0;
        state.autoStatus = 6;
      }
    }
    if (state.speed !== 0) state.electiricQuantity = Math.max(0, state.electiricQuantity - 0.001 * deltaSeconds);
  }

  function telemetry(now = Date.now()) {
    return {
      header: { messageNo: `telemetry-${now}`, messageType: 'ugvRealtimeInfo', timestamp: now },
      payload: { ...state },
    };
  }

  return { receive, tick, telemetry, getState: () => ({ ...state }) };
}

module.exports = { createVehicleSimulator, distanceMeters };
