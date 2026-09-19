const ENVIRONMENT_DEFINITIONS = Object.freeze({
  develop: Object.freeze({
    name: 'development',
    cloudEnvId: '',
    containerServiceName: 'mqtt-bridge-development',
    containerPathPrefix: '/mqtt'
  }),
  trial: Object.freeze({
    name: 'staging',
    cloudEnvId: '',
    containerServiceName: 'mqtt-bridge-staging',
    containerPathPrefix: '/mqtt'
  }),
  release: Object.freeze({
    name: 'production',
    cloudEnvId: 'omo-mqtt-prod-2g4zisao87d6ec54',
    containerServiceName: 'mqtt-bridge-v3',
    containerPathPrefix: '/mqtt'
  })
});

function detectEnvVersion(wxApi = wx) {
  if (!wxApi || typeof wxApi.getAccountInfoSync !== 'function') {
    throw new Error('无法识别小程序版本环境');
  }
  const accountInfo = wxApi.getAccountInfoSync();
  const envVersion = accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion;
  if (!envVersion || !Object.prototype.hasOwnProperty.call(ENVIRONMENT_DEFINITIONS, envVersion)) {
    throw new Error(`不支持的小程序版本环境：${envVersion || 'unknown'}`);
  }
  return envVersion;
}

function resolveRuntimeEnvironment(envVersion, definitions = ENVIRONMENT_DEFINITIONS) {
  const config = definitions[envVersion];
  if (!config) throw new Error(`未定义的小程序版本环境：${envVersion || 'unknown'}`);
  if (!config.cloudEnvId || !config.containerServiceName || !config.containerPathPrefix) {
    throw new Error(`${config.name || envVersion} 环境未配置，已阻止连接云服务`);
  }
  return { envVersion, ...config };
}

module.exports = { ENVIRONMENT_DEFINITIONS, detectEnvVersion, resolveRuntimeEnvironment };
