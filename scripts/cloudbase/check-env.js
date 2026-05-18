const fs = require('fs');
const path = require('path');
const { resolveProjectPath } = require('./utils');

function extractCloudEnvIdFromAppJs(text) {
  const match = text.match(/const\s+CLOUD_ENV_ID\s*=\s*['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

function extractTcbEnvFromDotEnv(text) {
  return extractEnvValue(text, 'TCB_ENV');
}

function extractEnvValue(text, key) {
  const line = text
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${key}=`));
  if (!line) return null;
  return line.split('=').slice(1).join('=').trim();
}

function main() {
  const appJsPath = resolveProjectPath('app.js');
  const mqttEnvPath = resolveProjectPath('mqtt-bridge', '.env');

  if (!fs.existsSync(appJsPath)) {
    throw new Error(`app.js not found: ${appJsPath}`);
  }

  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const cloudEnvId = extractCloudEnvIdFromAppJs(appJs);

  if (!cloudEnvId) {
    throw new Error('Cannot parse CLOUD_ENV_ID from app.js');
  }

  let tcbEnv = null;
  let secretId = null;
  let secretKey = null;
  if (fs.existsSync(mqttEnvPath)) {
    const envText = fs.readFileSync(mqttEnvPath, 'utf8');
    tcbEnv = extractTcbEnvFromDotEnv(envText);
    secretId = extractEnvValue(envText, 'TENCENTCLOUD_SECRETID');
    secretKey = extractEnvValue(envText, 'TENCENTCLOUD_SECRETKEY');
  }

  console.log(`[INFO] app.js CLOUD_ENV_ID = ${cloudEnvId}`);
  console.log(`[INFO] mqtt-bridge/.env TCB_ENV = ${tcbEnv || '(missing .env or TCB_ENV)'}`);
  console.log(`[INFO] mqtt-bridge/.env TENCENTCLOUD_SECRETID configured = ${Boolean(secretId)}`);
  console.log(`[INFO] mqtt-bridge/.env TENCENTCLOUD_SECRETKEY configured = ${Boolean(secretKey)}`);

  if (tcbEnv && tcbEnv !== cloudEnvId) {
    console.error('[FAIL] CLOUD_ENV_ID and TCB_ENV are not equal.');
    process.exit(1);
  }

  if (!secretId || !secretKey) {
    console.error('[FAIL] TENCENTCLOUD_SECRETID/TENCENTCLOUD_SECRETKEY must both be configured in mqtt-bridge/.env.');
    process.exit(1);
  }

  console.log('[PASS] Environment IDs are aligned.');
  console.log('[PASS] CAM secret pair is configured.');
  console.log(`[NEXT] CloudBase Console should also use env: ${cloudEnvId}`);
}

if (require.main === module) {
  main();
}
