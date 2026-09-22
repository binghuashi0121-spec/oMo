const APP_CONTROL_SPEED_MODE = 2;
const MOVE_HEARTBEAT_INTERVAL_MS = 100;
const MOVE_SPEED_FORWARD = 1;
const MOVE_SPEED_STOP = 0;
const MOVE_STRAIGHT_ANGLE = 0;
const AUTO_DRIVING_OPT_PLAN = 1;
const AUTO_DRIVING_OPT_START = 2;
const AUTO_DRIVING_OPT_STOP = 3;
const AUTO_DRIVING_OPT_CONTINUE = 4;
const AUTO_DRIVING_OPT_EXIT = 5;
const AUTO_DRIVING_DEFAULT_MAX_SPEED = 2;
const EARTH_PI = Math.PI;
const EARTH_A = 6378245.0;
const EARTH_EE = 0.00669342162296594323;

function isOutsideChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * EARTH_PI) + 20.0 * Math.sin(2.0 * x * EARTH_PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * EARTH_PI) + 40.0 * Math.sin(y / 3.0 * EARTH_PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * EARTH_PI) + 320 * Math.sin(y * EARTH_PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * EARTH_PI) + 20.0 * Math.sin(2.0 * x * EARTH_PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * EARTH_PI) + 40.0 * Math.sin(x / 3.0 * EARTH_PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * EARTH_PI) + 300.0 * Math.sin(x / 30.0 * EARTH_PI)) * 2.0 / 3.0;
  return ret;
}

function convertWgs84ToGcj02(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (isOutsideChina(lat, lng)) {
    return {
      latitude: lat,
      longitude: lng,
      converted: false
    };
  }

  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * EARTH_PI;
  let magic = Math.sin(radLat);
  magic = 1 - EARTH_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((EARTH_A * (1 - EARTH_EE)) / (magic * sqrtMagic) * EARTH_PI);
  dLng = (dLng * 180.0) / (EARTH_A / sqrtMagic * Math.cos(radLat) * EARTH_PI);

  return {
    latitude: lat + dLat,
    longitude: lng + dLng,
    converted: true
  };
}

function convertGcj02ToWgs84(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (isOutsideChina(lat, lng)) {
    return {
      latitude: lat,
      longitude: lng,
      converted: false
    };
  }

  const gcjPoint = convertWgs84ToGcj02(lat, lng);
  if (!gcjPoint) {
    return null;
  }

  return {
    latitude: lat * 2 - gcjPoint.latitude,
    longitude: lng * 2 - gcjPoint.longitude,
    converted: true
  };
}

function buildModeCommand(ugvID, mode) {
  return {
    ugvID,
    mode,
    speedMode: APP_CONTROL_SPEED_MODE
  };
}

function buildMoveCommand(ugvID, speed, angle = MOVE_STRAIGHT_ANGLE) {
  return {
    ugvID,
    speed,
    angle
  };
}

function buildAutoDrivingCommand(ugvID, optMode, extra = {}) {
  const command = {
    ugvID,
    opt_mode: optMode,
    // The vehicle-side reference client sends this field for every
    // autoDriving operation, including start/stop/continue/exit.
    upload: Number.isFinite(Number(extra.upload)) ? Number(extra.upload) : 0
  };

  if (optMode === AUTO_DRIVING_OPT_PLAN) {
    command.longitude = Number(extra.longitude);
    command.latitude = Number(extra.latitude);
    // Some vehicle firmware expects file_url to exist even when upload is 0.
    command.file_url = typeof extra.file_url === 'string' ? extra.file_url : '';
  }

  if (optMode === AUTO_DRIVING_OPT_START) {
    command.max_speed = Number.isFinite(Number(extra.max_speed))
      ? Number(extra.max_speed)
      : AUTO_DRIVING_DEFAULT_MAX_SPEED;
  }

  return command;
}

module.exports = {
  APP_CONTROL_SPEED_MODE,
  MOVE_HEARTBEAT_INTERVAL_MS,
  MOVE_SPEED_FORWARD,
  MOVE_SPEED_STOP,
  MOVE_STRAIGHT_ANGLE,
  AUTO_DRIVING_OPT_PLAN,
  AUTO_DRIVING_OPT_START,
  AUTO_DRIVING_OPT_STOP,
  AUTO_DRIVING_OPT_CONTINUE,
  AUTO_DRIVING_OPT_EXIT,
  AUTO_DRIVING_DEFAULT_MAX_SPEED,
  convertGcj02ToWgs84,
  convertWgs84ToGcj02,
  buildModeCommand,
  buildMoveCommand,
  buildAutoDrivingCommand
};
