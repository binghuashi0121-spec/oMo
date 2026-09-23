const MINI_PROGRAM_APP_ID = 'wx6443442c17eb3220';

const ENVIRONMENT_DEFINITIONS = Object.freeze({
  develop: Object.freeze({
    name: 'staging',
    cloudEnvId: 'omo-platform-staging-d5a30d0fd8f',
    containerServiceName: 'mqtt-bridge-staging',
    containerPathPrefix: '/mqtt'
  }),
  trial: Object.freeze({
    name: 'staging',
    cloudEnvId: 'omo-platform-staging-d5a30d0fd8f',
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
  const miniProgram = accountInfo && accountInfo.miniProgram;
  const envVersion = miniProgram && miniProgram.envVersion;
  const appId = miniProgram && miniProgram.appId;
  if (appId && appId !== MINI_PROGRAM_APP_ID) {
    throw new Error(`小程序 AppID 不匹配：${appId}`);
  }
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

module.exports = { MINI_PROGRAM_APP_ID, ENVIRONMENT_DEFINITIONS, detectEnvVersion, resolveRuntimeEnvironment };
