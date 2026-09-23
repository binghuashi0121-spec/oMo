const { CORE_COLLECTIONS } = require('./config');
const { loadCollectionFromBackup, resolveProjectPath } = require('./utils');

function mapById(rows) {
  const m = new Map();
  for (const row of rows) {
    if (row && row._id) m.set(row._id, row);
  }
  return m;
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function info(message) {
  console.log(`[INFO] ${message}`);
}

function main() {
  const backupDir = resolveProjectPath('omo-mini-program', 'database_import');
  const requiredUgvId = process.argv[2] || 'AB101';

  const data = {};
  for (const name of CORE_COLLECTIONS) {
    const rows = loadCollectionFromBackup(backupDir, name);
    if (!rows) {
      fail(`missing collection backup: ${name}`);
      continue;
    }
    data[name] = rows;
  }

  if (process.exitCode) return;

  const tripRuntimeById = mapById(data.trip_runtime);
  const trips = data.trips;
  const brokenRuntimeRefs = [];
  for (const trip of trips) {
    if (!trip.runtimeId) continue;
    if (!tripRuntimeById.has(trip.runtimeId)) {
      brokenRuntimeRefs.push({ tripId: trip._id, runtimeId: trip.runtimeId });
    }
  }
  if (brokenRuntimeRefs.length > 0) {
    fail(`trips.runtimeId missing in trip_runtime: ${brokenRuntimeRefs.length} rows`);
  } else {
    pass('all trips.runtimeId references are valid.');
  }

  const vehicles = data.vehicles || [];
  const existsRequiredUgv = vehicles.some((v) => (v.ugvID || v._id) === requiredUgvId);
  if (!existsRequiredUgv) {
    fail(`required vehicle not found: ${requiredUgvId}`);
  } else {
    pass(`required vehicle exists: ${requiredUgvId}`);
  }

  const activeTrips = trips.filter((t) => t.status === 'active');
  info(`active trips count = ${activeTrips.length}`);

  const duplicatedActiveByOpenid = new Map();
  for (const trip of activeTrips) {
    const key = trip.openid || '(empty-openid)';
    duplicatedActiveByOpenid.set(key, (duplicatedActiveByOpenid.get(key) || 0) + 1);
  }
  const offenders = [...duplicatedActiveByOpenid.entries()].filter(([, count]) => count > 1);
  if (offenders.length > 0) {
    fail(`users with multiple active trips: ${offenders.length}`);
  } else {
    pass('no user has multiple active trips.');
  }

  if (process.exitCode) {
    console.error('[RESULT] validation failed. Fix backup data before import.');
    process.exit(1);
  }

  console.log('[RESULT] validation passed. Backup is ready for import.');
}

if (require.main === module) {
  main();
}

