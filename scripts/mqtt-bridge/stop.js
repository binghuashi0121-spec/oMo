const fs = require('fs');
const path = require('path');
const { resolveProjectPath } = require('../cloudbase/utils');

const PID_FILE = resolveProjectPath('omo-mqtt-bridge', 'run', 'mqtt-bridge.pid');

function readPid() {
  if (!fs.existsSync(PID_FILE)) return null;
  const text = fs.readFileSync(PID_FILE, 'utf8').trim();
  return text ? Number(text) : null;
}

function removePidFile() {
  if (fs.existsSync(PID_FILE)) {
    fs.unlinkSync(PID_FILE);
  }
}

function main() {
  const pid = readPid();
  if (!pid) {
    console.log('[INFO] mqtt-bridge is not running.');
    return;
  }

  try {
    process.kill(pid);
    console.log(`[PASS] Stopped mqtt-bridge. PID=${pid}`);
  } catch (err) {
    console.warn(`[WARN] Failed to stop mqtt-bridge PID=${pid}: ${err.message}`);
  } finally {
    removePidFile();
  }
}

main();
