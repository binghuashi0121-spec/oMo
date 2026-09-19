const ALLOWED_COMMAND_TYPES = new Set(['ugvSetMode', 'ugvSetMove', 'autoDriving']);

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value || {}).every((key) => allowedKeys.includes(key));
}

function validateProtocolCommand(ugvID, messageType, command) {
  if (!ALLOWED_COMMAND_TYPES.has(messageType)) return 'messageType is not allowed';
  if (!command || typeof command !== 'object' || Array.isArray(command)) return 'command must be an object';
  if (String(command.ugvID || '') !== ugvID) return 'command.ugvID must match ugvID';
  if (messageType === 'ugvSetMode') {
    if (!hasOnlyKeys(command, ['ugvID', 'mode', 'speedMode'])) return 'ugvSetMode contains unknown fields';
    if (![0, 1, 2, 3].includes(Number(command.mode))) return 'ugvSetMode.mode is invalid';
    if (![1, 2, 5].includes(Number(command.speedMode))) return 'ugvSetMode.speedMode is invalid';
  }
  if (messageType === 'ugvSetMove') {
    if (!hasOnlyKeys(command, ['ugvID', 'speed', 'angle'])) return 'ugvSetMove contains unknown fields';
    if (typeof command.speed !== 'number' || !Number.isFinite(command.speed) || Math.abs(command.speed) > 1) return 'ugvSetMove.speed is invalid';
    if (typeof command.angle !== 'number' || !Number.isFinite(command.angle) || Math.abs(command.angle) > 1) return 'ugvSetMove.angle is invalid';
  }
  if (messageType === 'autoDriving') {
    if (!hasOnlyKeys(command, ['ugvID', 'opt_mode', 'longitude', 'latitude', 'upload', 'file_url', 'max_speed'])) return 'autoDriving contains unknown fields';
    const option = Number(command.opt_mode);
    if (![1, 2, 3, 4, 5].includes(option)) return 'autoDriving.opt_mode is invalid';
    if (option === 1) {
      const longitude = Number(command.longitude); const latitude = Number(command.latitude);
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return 'autoDriving.longitude is invalid';
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return 'autoDriving.latitude is invalid';
      if (![0, 1].includes(Number(command.upload))) return 'autoDriving.upload is invalid';
      if (Number(command.upload) === 1 && !/^https:\/\//i.test(String(command.file_url || ''))) return 'autoDriving.file_url must use HTTPS';
    }
    if (option === 2 && (!Number.isFinite(Number(command.max_speed)) || Number(command.max_speed) <= 0 || Number(command.max_speed) > 5)) return 'autoDriving.max_speed is invalid';
  }
  return '';
}

function getTripVehicleIdentity(trip) {
  return String(trip && (trip.ugvID || trip.vehicleId || trip.vehicleNo) || '').trim();
}

module.exports = { ALLOWED_COMMAND_TYPES, validateProtocolCommand, getTripVehicleIdentity };
