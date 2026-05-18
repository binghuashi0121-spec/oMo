const path = require('path');
const { spawnSync } = require('child_process');
const { resolveProjectPath } = require('../cloudbase/utils');

function runNodeScript(relativePath) {
  const scriptPath = resolveProjectPath(relativePath);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: resolveProjectPath(),
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`Script failed: ${relativePath}`);
  }
}

function main() {
  console.log('[STEP] Checking CloudBase and mqtt-bridge env configuration...');
  runNodeScript(path.join('scripts', 'cloudbase', 'check-env.js'));

  console.log('[STEP] Ensuring mqtt-bridge is running...');
  runNodeScript(path.join('scripts', 'mqtt-bridge', 'ensure-running.js'));

  console.log('[PASS] Real-device testing prerequisites are ready.');
  console.log('[NEXT] You can now open WeChat DevTools and start real-device debugging.');
}

main();
