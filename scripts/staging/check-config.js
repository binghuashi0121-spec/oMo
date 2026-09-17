const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const manifest = require('../../deploy/staging/manifest.json');
const productionEnvId = 'omo-mqtt-prod-2g4zisao87d6ec54';

function validateStagingConfig(config = manifest, options = {}) {
  const errors = [];
  const phase = options.phase || 'prepared';
  const environmentId = String(options.environmentId || '').trim();
  const environmentName = String(options.environmentName || config.environmentName || '').trim();
  const brokerUrl = String(options.brokerUrl || '').trim();
  const webOrigin = String(options.webOrigin || '').trim();

  if (environmentName !== 'omo-platform-staging') errors.push('环境显示名称必须是 omo-platform-staging');
  if (phase !== 'prepared' && !options.environmentName) errors.push('缺少从 CloudBase 环境列表核对的显示名称');
  if (config.forbiddenEnvironmentId !== productionEnvId) errors.push('生产环境禁止清单不匹配');
  if (config.environmentId !== 'omo-platform-staging-d5a30d0fd8f') errors.push('staging 环境 ID 清单不匹配');
  if (environmentId === productionEnvId || /prod/i.test(environmentId)) errors.push('禁止使用生产环境 ID');
  if (phase !== 'prepared' && !environmentId) errors.push('缺少 staging 环境 ID');
  if (phase !== 'prepared' && environmentId && environmentId !== config.environmentId) errors.push('目标环境不是已购买的 staging 环境 ID');
  if (options.tcbEnv && options.tcbEnv !== environmentId) errors.push('TCB_ENV 与 staging 环境 ID 不一致');
  if (options.cloudbaseEnvId && options.cloudbaseEnvId !== environmentId) errors.push('CLOUDBASE_ENV_ID 与 staging 环境 ID 不一致');

  const bridge = config.services && config.services.bridge;
  const api = config.services && config.services.adminApi;
  if (!bridge || bridge.name !== 'mqtt-bridge-staging' || bridge.port !== 3000 || bridge.minInstances !== 1 || bridge.maxInstances !== 1) errors.push('Bridge 服务名、端口或实例数不符合 staging 规格');
  if (!api || api.name !== 'admin-api-staging' || api.port !== 3001 || api.minInstances !== 1 || api.maxInstances !== 1) errors.push('Admin API 服务名、端口或实例数不符合 staging 规格');
  if (config.mqtt?.clientId !== 'omo-mqtt-bridge-staging') errors.push('MQTT Client ID 不符合 staging 规格');
  if (JSON.stringify(config.mqtt?.topics) !== JSON.stringify(['ugv/+/device', 'ugv/+/response'])) errors.push('MQTT Topic 清单不符合隔离 Broker 规格');

  const expectedFunctions = fs.readdirSync(path.join(root, 'omo-mini-program', 'cloudfunctions'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, 'omo-mini-program', 'cloudfunctions', entry.name, 'index.js')))
    .map((entry) => entry.name).sort();
  const listedFunctions = [...(config.cloudFunctions || [])].sort();
  if (JSON.stringify(listedFunctions) !== JSON.stringify(expectedFunctions)) errors.push('云函数清单与实际目录不一致');
  for (const schemaPath of Object.values(config.schema || {})) {
    if (!fs.existsSync(path.join(root, schemaPath))) errors.push(`缺少集合或索引规格：${schemaPath}`);
  }
  if (Object.keys(config.schema || {}).length !== 3) errors.push('集合与索引规格清单不完整');

  if (phase !== 'prepared') {
    if (!/^mqtts:\/\/[^\s]+$/i.test(brokerUrl) && !/^wss:\/\/[^\s]+$/i.test(brokerUrl)) errors.push('测试 Broker 必须使用 MQTT TLS 或 WSS');
    if (!/^https:\/\/[^\s/]+$/i.test(webOrigin)) errors.push('Web Origin 必须是 HTTPS 域名，不含路径');
  }
  if (phase === 'trial' && options.trialEnvironmentId !== environmentId) errors.push('小程序 trial 环境与 staging ID 不一致');
  if (!['prepared', 'deploy', 'trial'].includes(phase)) errors.push('未知配置检查阶段');
  return errors;
}

if (require.main === module) {
  const phase = process.argv[2] || 'prepared';
  const errors = validateStagingConfig(manifest, {
    phase,
    environmentId: process.env.OMO_STAGING_ENV_ID,
    environmentName: process.env.OMO_STAGING_ENV_NAME,
    brokerUrl: process.env.OMO_STAGING_MQTT_URL,
    webOrigin: process.env.OMO_STAGING_WEB_ORIGIN,
    tcbEnv: process.env.TCB_ENV,
    cloudbaseEnvId: process.env.CLOUDBASE_ENV_ID,
    trialEnvironmentId: require('../../omo-mini-program/config/environments').ENVIRONMENT_DEFINITIONS.trial.cloudEnvId,
  });
  if (errors.length) {
    for (const error of errors) console.error(`[FAIL] ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`[PASS] staging ${phase} 配置校验通过`);
  }
}

module.exports = { validateStagingConfig };
