const STAGING_ENV_ID = 'omo-platform-staging-d5a30d0fd8f';
const STAGING_APP_ID = 'wx6443442c17eb3220';

function canReturnDebugCode(wxContext = {}, environment = process.env) {
  const configuredEnvId = String(environment.SMS_DEBUG_ENV_ID || '').trim();
  const configuredAppId = String(environment.SMS_DEBUG_APP_ID || '').trim();
  const runtimeEnvId = String(wxContext.ENV || '').trim();
  const runtimeAppId = String(wxContext.APPID || '').trim();

  return environment.SMS_DEBUG_CODE_ENABLED === 'true' &&
    configuredEnvId === STAGING_ENV_ID &&
    configuredAppId === STAGING_APP_ID &&
    runtimeEnvId === STAGING_ENV_ID &&
    runtimeAppId === STAGING_APP_ID;
}

module.exports = { STAGING_ENV_ID, STAGING_APP_ID, canReturnDebugCode };
