const REQUIRED_COLLECTIONS = [
  'vehicles',
  'trips',
  'trip_runtime',
  'trip_settlements',
  'SmsCode',
  'User',
  'Session',
  'mqtt_logs',
  'command_history'
];

const CORE_COLLECTIONS = [
  'vehicles',
  'trips',
  'trip_runtime',
  'trip_settlements',
  'SmsCode',
  'User',
  'Session'
];

const IMPORT_ORDER = [
  ['vehicles', 'User'],
  ['trips'],
  ['trip_runtime', 'trip_settlements'],
  ['Session', 'SmsCode'],
  ['mqtt_logs', 'command_history']
];

const INDEX_SPECS = [
  { collection: 'vehicles', fields: [{ field: 'ugvID', order: 'asc' }] },
  {
    collection: 'trips',
    fields: [
      { field: 'openid', order: 'asc' },
      { field: 'status', order: 'asc' },
      { field: 'startTime', order: 'desc' }
    ]
  },
  { collection: 'trip_runtime', fields: [{ field: 'tripId', order: 'asc' }] },
  {
    collection: 'SmsCode',
    fields: [
      { field: 'phone', order: 'asc' },
      { field: 'code', order: 'asc' },
      { field: 'used', order: 'asc' },
      { field: 'expireTime', order: 'desc' }
    ]
  },
  { collection: 'Session', fields: [{ field: 'token', order: 'asc' }] },
  { collection: 'mqtt_logs', fields: [{ field: 'createdAt', order: 'desc' }] },
  { collection: 'command_history', fields: [{ field: 'createdAt', order: 'desc' }] }
];

module.exports = {
  REQUIRED_COLLECTIONS,
  CORE_COLLECTIONS,
  IMPORT_ORDER,
  INDEX_SPECS
};

