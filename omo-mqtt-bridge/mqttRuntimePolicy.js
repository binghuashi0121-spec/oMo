const STAGING_ENV_ID = 'omo-platform-staging-d5a30d0fd8f';
const PRODUCTION_ENV_ID = 'omo-mqtt-prod-2g4zisao87d6ec54';
const VEHICLE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const VALID_PROFILES = new Set(['legacy', 'safe_blocked', 'isolated_simulator', 'vendor_real']);
const VALID_SPEED_UNITS = new Set(['unknown', 'mps', 'kph']);
const VALID_COORD_SYSTEMS = new Set(['unknown', 'wgs84', 'gcj02']);
const VENDOR_PROTOCOL_TYPES = new Set([
  'ugvSetMode', 'ugvSetMove', 'getVersion', 'gstUdpStart', 'gstUdpStop',
  'gstRtmpStart', 'gstRtmpStop', 'gstVideoStart', 'gstVideoStop',
  'gstTakePhoto', 'osmDownload', 'autoDriving'
]);
const VENDOR_DEFAULT_TYPES = [...VENDOR_PROTOCOL_TYPES].filter((type) => type !== 'ugvSetMove');

function csv(value) {
  return [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))];
}

function enabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function resolveVendorCommandTypes(environment) {
  const configured = csv(environment.MQTT_ALLOWED_COMMAND_TYPES);
  const selected = configured.length ? configured : VENDOR_DEFAULT_TYPES;
  const invalid = selected.find((type) => !VENDOR_PROTOCOL_TYPES.has(type));
  if (invalid) throw new Error(`MQTT_ALLOWED_COMMAND_TYPES contains unsupported type: ${invalid}`);
  if (selected.includes('ugvSetMove') && !enabled(environment.MQTT_MOVE_CONTROL_ENABLED)) {
    throw new Error('ugvSetMove requires MQTT_MOVE_CONTROL_ENABLED=true');
  }
  return new Set(selected);
}

function parseBrokerUrl(rawValue) {
  if (!String(rawValue || '').trim()) return null;
  let parsed;
  try {
    parsed = new URL(String(rawValue).trim());
  } catch {
    throw new Error('MQTT_URL 无效');
  }
  if (parsed.username || parsed.password) throw new Error('Broker 凭据不能放在 MQTT_URL 中');
  return parsed;
}

function assertStagingEnvironment(environment) {
  const envId = String(environment.TCB_ENV || '').trim();
  if (envId !== STAGING_ENV_ID || envId === PRODUCTION_ENV_ID || /prod/i.test(envId)) {
    throw new Error('staging Bridge 不允许缺失、生产或非本次购买的 CloudBase 环境 ID');
  }
}

function resolveVendorRealConfig(environment) {
  assertStagingEnvironment(environment);
  const connectionRequested = enabled(environment.MQTT_CONNECTION_ENABLED);
  const commandsRequested = enabled(environment.MQTT_COMMANDS_ENABLED);
  const allowInsecure = enabled(environment.ALLOW_INSECURE_MQTT);
  const supervisionConfirmed = enabled(environment.VEHICLE_SUPERVISION_CONFIRMED);
  const allowedUgvIds = csv(environment.MQTT_ALLOWED_UGV_IDS);
  const clientId = String(environment.MQTT_CLIENT_ID || 'omo-mqtt-bridge-staging').trim();
  if (clientId !== 'omo-mqtt-bridge-staging') throw new Error('真实平台 staging Bridge Client ID 不匹配');
  const invalidVehicleId = allowedUgvIds.find((id) => !VEHICLE_ID_PATTERN.test(id));
  if (invalidVehicleId) throw new Error(`MQTT_ALLOWED_UGV_IDS 包含无效车辆编号: ${invalidVehicleId}`);

  const telemetrySpeedUnit = String(environment.MQTT_TELEMETRY_SPEED_UNIT || 'unknown').trim().toLowerCase();
  const coordSystem = String(environment.MQTT_COORD_SYSTEM || 'unknown').trim().toLowerCase();
  if (!VALID_SPEED_UNITS.has(telemetrySpeedUnit)) throw new Error('MQTT_TELEMETRY_SPEED_UNIT 必须是 unknown、mps 或 kph');
  if (!VALID_COORD_SYSTEMS.has(coordSystem)) throw new Error('MQTT_COORD_SYSTEM 必须是 unknown、wgs84 或 gcj02');

  const broker = parseBrokerUrl(environment.MQTT_URL);
  if (broker && !['mqtt:', 'mqtts:', 'wss:'].includes(broker.protocol)) {
    throw new Error('真实平台 MQTT_URL 只允许 mqtt://、mqtts:// 或 wss://');
  }
  if (connectionRequested && broker?.protocol === 'mqtt:' && !allowInsecure) {
    throw new Error('明文 MQTT 连接必须显式设置 ALLOW_INSECURE_MQTT=true');
  }

  const blockedReasons = [];
  if (!connectionRequested) blockedReasons.push('connection_disabled');
  if (!allowedUgvIds.length) blockedReasons.push('authorized_vehicle_ids_missing');
  if (!broker) blockedReasons.push('broker_url_missing');
  if (!environment.MQTT_USERNAME || !environment.MQTT_PASSWORD) blockedReasons.push('broker_credentials_missing');

  const connectionEnabled = connectionRequested && blockedReasons.length === 0;
  const controlWindowRaw = String(environment.CONTROL_WINDOW_EXPIRES_AT || '').trim();
  const controlWindowExpiresAt = controlWindowRaw ? new Date(controlWindowRaw).getTime() : 0;
  const commandBlockedReasons = [];
  if (!commandsRequested) commandBlockedReasons.push('commands_disabled');
  if (!connectionEnabled) commandBlockedReasons.push('mqtt_not_enabled');
  if (!supervisionConfirmed) commandBlockedReasons.push('vehicle_supervision_not_confirmed');
  if (!Number.isFinite(controlWindowExpiresAt) || controlWindowExpiresAt <= Date.now()) {
    commandBlockedReasons.push('control_window_missing_or_expired');
  }

  return {
    profile: 'vendor_real',
    url: broker ? broker.toString() : '',
    username: String(environment.MQTT_USERNAME || ''),
    password: String(environment.MQTT_PASSWORD || ''),
    clientId,
    connectionEnabled,
    connectionRequested,
    blockedReasons,
    allowedUgvIds,
    subscribeTopics: allowedUgvIds.flatMap((id) => [`ugv/${id}/device`, `ugv/${id}/response`]),
    telemetrySpeedUnit,
    coordSystem,
    allowInsecure,
    commandsRequested,
    commandsEnabled: commandsRequested && commandBlockedReasons.length === 0,
    commandBlockedReasons,
    controlWindowExpiresAt: Number.isFinite(controlWindowExpiresAt) && controlWindowExpiresAt > 0
      ? new Date(controlWindowExpiresAt).toISOString()
      : '',
    supervisionConfirmed,
    allowedCommandTypes: resolveVendorCommandTypes(environment)
  };
}

function resolveIsolatedSimulatorConfig(environment) {
  assertStagingEnvironment(environment);
  const broker = parseBrokerUrl(environment.MQTT_URL);
  if (!broker || !['mqtts:', 'wss:'].includes(broker.protocol)) throw new Error('staging Bridge 必须使用 TLS Broker');
  if (!environment.MQTT_USERNAME || !environment.MQTT_PASSWORD) throw new Error('staging Bridge 缺少独立 Broker 凭据');
  if (environment.MQTT_CLIENT_ID !== 'omo-mqtt-bridge-staging') throw new Error('staging Bridge Client ID 不匹配');
  if (environment.MQTT_TELEMETRY_SPEED_UNIT !== 'mps') throw new Error('staging 模拟车遥测速度单位必须显式设为 mps');
  return {
    profile: 'isolated_simulator',
    url: broker.toString(),
    username: environment.MQTT_USERNAME,
    password: environment.MQTT_PASSWORD,
    clientId: environment.MQTT_CLIENT_ID,
    connectionEnabled: true,
    connectionRequested: true,
    blockedReasons: [],
    allowedUgvIds: ['OMO_STAGING_0001'],
    subscribeTopics: ['ugv/+/device', 'ugv/+/response'],
    telemetrySpeedUnit: 'mps',
    coordSystem: 'wgs84',
    allowInsecure: false,
    commandsRequested: true,
    commandsEnabled: true,
    commandBlockedReasons: [],
    controlWindowExpiresAt: '',
    supervisionConfirmed: true,
    allowedCommandTypes: new Set(VENDOR_PROTOCOL_TYPES)
  };
}

function resolveLegacyConfig(environment) {
  const broker = parseBrokerUrl(environment.MQTT_URL || 'mqtt://127.0.0.1:1883');
  const topics = csv(environment.MQTT_SUB_TOPICS || 'ugv/+/device,ugv/+/response');
  const telemetrySpeedUnit = String(environment.MQTT_TELEMETRY_SPEED_UNIT || 'kph').toLowerCase();
  const coordSystem = String(environment.MQTT_COORD_SYSTEM || 'wgs84').toLowerCase();
  if (!VALID_SPEED_UNITS.has(telemetrySpeedUnit)) throw new Error('MQTT_TELEMETRY_SPEED_UNIT 无效');
  if (!VALID_COORD_SYSTEMS.has(coordSystem)) throw new Error('MQTT_COORD_SYSTEM 无效');
  return {
    profile: 'legacy',
    url: broker.toString(),
    username: String(environment.MQTT_USERNAME || ''),
    password: String(environment.MQTT_PASSWORD || ''),
    clientId: String(environment.MQTT_CLIENT_ID || `mqtt-bridge-${Date.now()}`),
    connectionEnabled: true,
    connectionRequested: true,
    blockedReasons: [],
    allowedUgvIds: [],
    subscribeTopics: topics,
    telemetrySpeedUnit,
    coordSystem,
    allowInsecure: broker.protocol === 'mqtt:',
    commandsRequested: true,
    commandsEnabled: true,
    commandBlockedReasons: [],
    controlWindowExpiresAt: '',
    supervisionConfirmed: true,
    allowedCommandTypes: new Set(VENDOR_PROTOCOL_TYPES)
  };
}

function resolveSafeBlockedConfig(environment) {
  return {
    profile: 'safe_blocked',
    url: '',
    username: '',
    password: '',
    clientId: String(environment.MQTT_CLIENT_ID || 'mqtt-bridge-safe-blocked'),
    connectionEnabled: false,
    connectionRequested: false,
    blockedReasons: ['runtime_configuration_missing'],
    allowedUgvIds: [],
    subscribeTopics: [],
    telemetrySpeedUnit: 'unknown',
    coordSystem: 'unknown',
    allowInsecure: false,
    commandsRequested: false,
    commandsEnabled: false,
    commandBlockedReasons: ['commands_disabled', 'runtime_configuration_missing'],
    controlWindowExpiresAt: '',
    supervisionConfirmed: false,
    allowedCommandTypes: new Set()
  };
}

function resolveMqttRuntimeConfig(environment = process.env) {
  const fallbackProfile = environment.OMO_STAGING_MODE === 'true'
    ? 'isolated_simulator'
    : environment.NODE_ENV === 'production'
      ? 'safe_blocked'
      : 'legacy';
  const profile = String(environment.MQTT_PROFILE || fallbackProfile).trim();
  if (!VALID_PROFILES.has(profile)) throw new Error(`MQTT_PROFILE 无效: ${profile}`);
  if (profile === 'vendor_real') return resolveVendorRealConfig(environment);
  if (profile === 'isolated_simulator') return resolveIsolatedSimulatorConfig(environment);
  if (profile === 'safe_blocked') return resolveSafeBlockedConfig(environment);
  return resolveLegacyConfig(environment);
}

function isCommandRuntimeEnabled(config, now = Date.now()) {
  return getCommandRuntimeBlockedReasons(config, now).length === 0;
}

function getCommandRuntimeBlockedReasons(config, now = Date.now()) {
  if (config.profile !== 'vendor_real') return config.commandsEnabled ? [] : [...config.commandBlockedReasons];
  const reasons = [...config.commandBlockedReasons].filter((reason) => reason !== 'control_window_missing_or_expired');
  const expiresAt = new Date(config.controlWindowExpiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) reasons.push('control_window_missing_or_expired');
  return [...new Set(reasons)];
}

module.exports = {
  STAGING_ENV_ID,
  PRODUCTION_ENV_ID,
  VEHICLE_ID_PATTERN,
  VENDOR_PROTOCOL_TYPES,
  resolveMqttRuntimeConfig,
  isCommandRuntimeEnabled,
  getCommandRuntimeBlockedReasons
};
