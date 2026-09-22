const net = require('node:net');

const PROTOCOL_COMMAND_TYPES = Object.freeze([
  'ugvSetMode', 'ugvSetMove', 'getVersion', 'gstUdpStart', 'gstUdpStop',
  'gstRtmpStart', 'gstRtmpStop', 'gstVideoStart', 'gstVideoStop',
  'gstTakePhoto', 'osmDownload', 'autoDriving'
]);
const ALLOWED_COMMAND_TYPES = new Set(PROTOCOL_COMMAND_TYPES);

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value || {}).every((key) => allowedKeys.includes(key));
}

function isNonEmptyString(value, maxLength = 1024) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength && !value.includes('\0');
}

function isHttpsUrl(value) {
  if (!isNonEmptyString(value, 2048)) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function isRtmpUrl(value) {
  if (!isNonEmptyString(value, 2048)) return false;
  try { return ['rtmp:', 'rtmps:'].includes(new URL(value).protocol); } catch { return false; }
}

function validateCamera(command) {
  return [1, 2].includes(Number(command.camera_id)) ? '' : 'camera_id must be 1 or 2';
}

function validateUpload(command) {
  const upload = Number(command.upload);
  if (![0, 1].includes(upload)) return 'upload must be 0 or 1';
  if (upload === 1 && !isHttpsUrl(command.file_url)) return 'file_url must use HTTPS when upload is 1';
  return '';
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

  if (messageType === 'getVersion') {
    if (!hasOnlyKeys(command, ['ugvID'])) return 'getVersion contains unknown fields';
  }

  if (messageType === 'gstUdpStart') {
    if (!hasOnlyKeys(command, ['ugvID', 'camera_id', 'udp_ip', 'udp_port'])) return 'gstUdpStart contains unknown fields';
    const cameraError = validateCamera(command);
    if (cameraError) return cameraError;
    if (net.isIP(String(command.udp_ip || '')) === 0) return 'gstUdpStart.udp_ip must be an IPv4 or IPv6 address';
    const port = Number(command.udp_port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return 'gstUdpStart.udp_port is invalid';
  }

  if (['gstUdpStop', 'gstRtmpStop'].includes(messageType)) {
    if (!hasOnlyKeys(command, ['ugvID', 'camera_id'])) return `${messageType} contains unknown fields`;
    const cameraError = validateCamera(command);
    if (cameraError) return cameraError;
  }

  if (messageType === 'gstRtmpStart') {
    if (!hasOnlyKeys(command, ['ugvID', 'camera_id', 'rtmp_url'])) return 'gstRtmpStart contains unknown fields';
    const cameraError = validateCamera(command);
    if (cameraError) return cameraError;
    if (!isRtmpUrl(command.rtmp_url)) return 'gstRtmpStart.rtmp_url must use RTMP or RTMPS';
  }

  if (messageType === 'gstVideoStart') {
    if (!hasOnlyKeys(command, ['ugvID', 'camera_id', 'video_path'])) return 'gstVideoStart contains unknown fields';
    const cameraError = validateCamera(command);
    if (cameraError) return cameraError;
    if (!isNonEmptyString(command.video_path)) return 'gstVideoStart.video_path is invalid';
  }

  if (messageType === 'gstVideoStop') {
    if (!hasOnlyKeys(command, ['ugvID', 'camera_id', 'upload', 'file_url'])) return 'gstVideoStop contains unknown fields';
    const cameraError = validateCamera(command);
    if (cameraError) return cameraError;
    const uploadError = validateUpload(command);
    if (uploadError) return uploadError;
  }

  if (messageType === 'gstTakePhoto') {
    if (!hasOnlyKeys(command, ['ugvID', 'camera_id', 'photo_path', 'upload', 'file_url'])) return 'gstTakePhoto contains unknown fields';
    const cameraError = validateCamera(command);
    if (cameraError) return cameraError;
    if (!isNonEmptyString(command.photo_path)) return 'gstTakePhoto.photo_path is invalid';
    const uploadError = validateUpload(command);
    if (uploadError) return uploadError;
  }

  if (messageType === 'osmDownload') {
    if (!hasOnlyKeys(command, ['ugvID', 'opt_mode', 'osm_id', 'osm_name', 'file_url', 'version'])) return 'osmDownload contains unknown fields';
    const option = Number(command.opt_mode);
    if (![0, 1, 2].includes(option)) return 'osmDownload.opt_mode is invalid';
    if (!isNonEmptyString(command.osm_id, 128)) return 'osmDownload.osm_id is invalid';
    if (!isNonEmptyString(command.osm_name, 256)) return 'osmDownload.osm_name is invalid';
    if (!isNonEmptyString(command.version, 128)) return 'osmDownload.version is invalid';
    if ([1, 2].includes(option) && !isHttpsUrl(command.file_url)) return 'osmDownload.file_url must use HTTPS for add or overwrite';
  }

  if (messageType === 'autoDriving') {
    if (!hasOnlyKeys(command, ['ugvID', 'opt_mode', 'longitude', 'latitude', 'upload', 'file_url', 'max_speed'])) return 'autoDriving contains unknown fields';
    const option = Number(command.opt_mode);
    if (![1, 2, 3, 4, 5].includes(option)) return 'autoDriving.opt_mode is invalid';
    if (option === 1) {
      const longitude = Number(command.longitude); const latitude = Number(command.latitude);
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return 'autoDriving.longitude is invalid';
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return 'autoDriving.latitude is invalid';
      const uploadError = validateUpload(command);
      if (uploadError) return uploadError;
    }
    if (option === 2 && (!Number.isFinite(Number(command.max_speed)) || Number(command.max_speed) <= 0 || Number(command.max_speed) > 5)) return 'autoDriving.max_speed is invalid';
  }
  return '';
}

function getTripVehicleIdentity(trip) {
  return String(trip && (trip.ugvID || trip.vehicleId || trip.vehicleNo) || '').trim();
}

module.exports = { PROTOCOL_COMMAND_TYPES, ALLOWED_COMMAND_TYPES, validateProtocolCommand, getTripVehicleIdentity };
