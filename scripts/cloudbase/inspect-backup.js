const fs = require('fs');
const path = require('path');
const { CORE_COLLECTIONS, REQUIRED_COLLECTIONS, IMPORT_ORDER } = require('./config');
const { readJsonFlexible, resolveProjectPath, safeKeys } = require('./utils');

function formatCount(count) {
  return String(count).padStart(6, ' ');
}

function main() {
  const backupDir = resolveProjectPath('omo-mini-program', 'database_import');
  if (!fs.existsSync(backupDir)) {
    throw new Error(`Backup directory does not exist: ${backupDir}`);
  }

  const files = fs
    .readdirSync(backupDir)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .sort();

  console.log(`[INFO] backup dir: ${backupDir}`);
  console.log(`[INFO] json files: ${files.length}`);
  console.log('');

  const existingCollections = new Set();
  for (const fileName of files) {
    const collection = path.basename(fileName, '.json');
    const filePath = path.join(backupDir, fileName);
    const rows = readJsonFlexible(filePath);
    existingCollections.add(collection);
    const sampleKeys = rows.length > 0 ? safeKeys(rows[0]).slice(0, 10).join(', ') : '';
    console.log(`${collection.padEnd(18)} rows=${formatCount(rows.length)} keys=[${sampleKeys}]`);
  }

  const missingRequired = REQUIRED_COLLECTIONS.filter((name) => !existingCollections.has(name));
  const missingCore = CORE_COLLECTIONS.filter((name) => !existingCollections.has(name));
  console.log('');

  if (missingRequired.length > 0) {
    console.warn(`[WARN] missing required collections: ${missingRequired.join(', ')}`);
  } else {
    console.log('[PASS] all required collections exist in backup.');
  }

  if (missingCore.length > 0) {
    console.error(`[FAIL] missing core collections: ${missingCore.join(', ')}`);
    process.exit(1);
  }

  console.log('[PASS] core collections are complete for migration.');
  console.log('');
  console.log('[INFO] import order:');
  IMPORT_ORDER.forEach((group, idx) => {
    console.log(`  ${idx + 1}. ${group.join(', ')}`);
  });
}

if (require.main === module) {
  main();
}

