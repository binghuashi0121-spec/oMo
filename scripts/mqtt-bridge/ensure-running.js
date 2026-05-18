const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { resolveProjectPath } = require('../cloudbase/utils');

const MQTT_BRIDGE_DIR = resolveProjectPath('mqtt-bridge');
const RUN_DIR = path.join(MQTT_BRIDGE_DIR, 'run');
const PID_FILE = path.join(RUN_DIR, 'mqtt-bridge.pid');
const STDOUT_LOG = path.join(RUN_DIR, 'mqtt-bridge.stdout.log');
const STDERR_LOG = path.join(RUN_DIR, 'mqtt-bridge.stderr.log');
const HEALTH_URL = 'http://127.0.0.1:3000/health';
const HEALTH_TIMEOUT_MS = 20000;
const POLL_INTERVAL_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readFileSafe(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

function tailText(filePath, maxLines = 40) {
  const content = readFileSafe(filePath);
  if (!content) return '';
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-maxLines)
    .join('\n');
}

function isProcessAlive(pid) {
  if (!pid || Number.isNaN(Number(pid))) return false;

  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (err) {
    return false;
  }
}

function readPid() {
  if (!fs.existsSync(PID_FILE)) return null;
  const text = fs.readFileSync(PID_FILE, 'utf8').trim();
  return text ? Number(text) : null;
}

function writePid(pid) {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(pid));
}

function removePidFile() {
  if (fs.existsSync(PID_FILE)) {
    fs.unlinkSync(PID_FILE);
  }
}

function requestHealth() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.service === 'mqtt-bridge-service') {
            resolve(parsed);
            return;
          }
        } catch (err) {}

        resolve(null);
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function waitForHealthyService(timeoutMs = HEALTH_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const health = await requestHealth();
    if (health) {
      return health;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  return null;
}

function ensureDependenciesInstalled() {
  const requiredPackages = [
    path.join(MQTT_BRIDGE_DIR, 'node_modules', 'dotenv', 'package.json'),
    path.join(MQTT_BRIDGE_DIR, 'node_modules', 'express', 'package.json'),
    path.join(MQTT_BRIDGE_DIR, 'node_modules', 'mqtt', 'package.json'),
    path.join(MQTT_BRIDGE_DIR, 'node_modules', '@cloudbase', 'node-sdk', 'package.json')
  ];

  const missingDeps = requiredPackages.some((filePath) => !fs.existsSync(filePath));
  if (!missingDeps) {
    console.log('[INFO] mqtt-bridge dependencies already installed.');
    return;
  }

  console.log('[INFO] Installing mqtt-bridge dependencies...');

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const installResult = spawnSync(npmCommand, ['install'], {
    cwd: MQTT_BRIDGE_DIR,
    stdio: 'inherit',
    shell: false
  });

  if (installResult.status !== 0) {
    throw new Error('Failed to install mqtt-bridge dependencies.');
  }
}

function stopStaleProcessIfNeeded() {
  const pid = readPid();
  if (!pid) return;

  if (!isProcessAlive(pid)) {
    removePidFile();
    return;
  }

  console.log(`[INFO] Found existing mqtt-bridge process PID=${pid}, stopping stale instance...`);
  try {
    process.kill(pid);
  } catch (err) {
    console.warn(`[WARN] Failed to stop existing mqtt-bridge process PID=${pid}: ${err.message}`);
  }
  removePidFile();
}

function startBridgeProcess() {
  fs.mkdirSync(RUN_DIR, { recursive: true });

  if (fs.existsSync(STDOUT_LOG)) {
    fs.unlinkSync(STDOUT_LOG);
  }
  if (fs.existsSync(STDERR_LOG)) {
    fs.unlinkSync(STDERR_LOG);
  }

  const stdoutFd = fs.openSync(STDOUT_LOG, 'a');
  const stderrFd = fs.openSync(STDERR_LOG, 'a');

  const child = spawn(process.execPath, ['app.js'], {
    cwd: MQTT_BRIDGE_DIR,
    detached: true,
    stdio: ['ignore', stdoutFd, stderrFd],
    windowsHide: true
  });

  child.unref();
  writePid(child.pid);

  console.log(`[INFO] Started mqtt-bridge in background. PID=${child.pid}`);
  console.log(`[INFO] Logs: ${STDOUT_LOG}`);
}

async function main() {
  const healthyService = await waitForHealthyService(1500);
  if (healthyService) {
    console.log('[PASS] mqtt-bridge is already running.');
    console.log(`[INFO] /health -> mqtt.connected=${healthyService.mqtt?.connected} cloudbase.ready=${healthyService.cloudbase?.ready}`);
    return;
  }

  ensureDependenciesInstalled();
  stopStaleProcessIfNeeded();
  startBridgeProcess();

  const health = await waitForHealthyService();
  if (!health) {
    const stdoutTail = tailText(STDOUT_LOG);
    const stderrTail = tailText(STDERR_LOG);

    throw new Error(
      `mqtt-bridge did not become healthy within ${HEALTH_TIMEOUT_MS}ms.\n` +
      `stdout:\n${stdoutTail || '(empty)'}\n` +
      `stderr:\n${stderrTail || '(empty)'}`
    );
  }

  console.log('[PASS] mqtt-bridge is ready for local real-device testing.');
  console.log(`[INFO] /health -> mqtt.connected=${health.mqtt?.connected} cloudbase.ready=${health.cloudbase?.ready}`);
}

main().catch((err) => {
  console.error(`[FAIL] ${err.message}`);
  process.exit(1);
});
