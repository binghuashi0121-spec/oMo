function readHeader(req, name) {
  const headers = req && req.headers ? req.headers : {};
  const value = headers[String(name).toLowerCase()];
  return String(Array.isArray(value) ? value[0] : value || '').trim();
}

function diagnoseCloudBaseIdentity(req) {
  const openid = readHeader(req, 'x-wx-openid');
  const env = readHeader(req, 'x-wx-env');
  const source = readHeader(req, 'x-wx-source');
  const platform = readHeader(req, 'x-wx-platform');
  const appid = readHeader(req, 'x-wx-appid');
  const expectedEnv = String(process.env.TCB_ENV || '').trim();
  const expectedAppId = String(process.env.WECHAT_APP_ID || '').trim();
  const isNonProductionEnv = /(?:^|[-_])(dev|test|stage|staging)(?:[-_]|$)/i.test(expectedEnv);
  const allowDevtools = isNonProductionEnv || process.env.ALLOW_WX_DEVTOOLS === 'true';
  const allowUnknownSource = isNonProductionEnv && process.env.ALLOW_UNKNOWN_WX_SOURCE === 'true';
  const sourceAccepted = source === 'wx_client' || (allowDevtools && source === 'wx_devtools') || (allowUnknownSource && Boolean(source));

  return {
    openidPresent: Boolean(openid),
    openidFormatValid: /^[A-Za-z0-9_-]{6,128}$/.test(openid),
    envPresent: Boolean(env),
    envMatchesExpected: Boolean(expectedEnv) && env === expectedEnv,
    expectedEnvConfigured: Boolean(expectedEnv),
    sourcePresent: Boolean(source),
    sourceValue: /^[A-Za-z0-9_-]{1,64}$/.test(source) ? source : 'invalid',
    sourceAccepted,
    platformValue: /^[A-Za-z0-9_-]{1,64}$/.test(platform) ? platform : '',
    devtoolsAllowed: allowDevtools,
    unknownSourceAllowed: allowUnknownSource,
    appidPresent: Boolean(appid),
    appidMatchesExpected: !expectedAppId || appid === expectedAppId,
    expectedAppIdConfigured: Boolean(expectedAppId)
  };
}

function getTrustedCloudBaseIdentity(req) {
  const openid = readHeader(req, 'x-wx-openid');
  const env = readHeader(req, 'x-wx-env');
  const source = readHeader(req, 'x-wx-source');
  const appid = readHeader(req, 'x-wx-appid');
  const expectedEnv = String(process.env.TCB_ENV || '').trim();
  const expectedAppId = String(process.env.WECHAT_APP_ID || '').trim();

  if (!openid || !env || !source || !expectedEnv) return null;
  if (env !== expectedEnv) return null;
  if (expectedAppId && appid !== expectedAppId) return null;
  const isNonProductionEnv = /(?:^|[-_])(dev|test|stage|staging)(?:[-_]|$)/i.test(expectedEnv);
  const allowDevtools = isNonProductionEnv || process.env.ALLOW_WX_DEVTOOLS === 'true';
  const allowUnknownSource = isNonProductionEnv && process.env.ALLOW_UNKNOWN_WX_SOURCE === 'true';
  if (source !== 'wx_client' && !(allowDevtools && source === 'wx_devtools') && !(allowUnknownSource && source)) return null;
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(openid)) return null;

  return { openid, env, source, appid };
}

function requireCloudBaseIdentity(req, res, fail) {
  const identity = getTrustedCloudBaseIdentity(req);
  if (!identity) {
    const diagnosis = diagnoseCloudBaseIdentity(req);
    // Do not log header values or OpenID. Presence/match flags are enough to
    // diagnose CloudBase association and service-environment mistakes.
    console.warn('[AUTH] rejected CloudBase identity', {
      requestId: req.requestId || '',
      ...diagnosis
    });
    const expectedEnv = String(process.env.TCB_ENV || '').trim();
    const exposeSafeDiagnosis = /(?:^|[-_])(dev|test|stage|staging)(?:[-_]|$)/i.test(expectedEnv);
    fail(
      res,
      req.requestId,
      'BRIDGE_AUTH_UNTRUSTED_IDENTITY',
      'missing or invalid CloudBase private identity headers',
      401,
      exposeSafeDiagnosis ? { identity: diagnosis } : null
    );
    return null;
  }
  return identity;
}

module.exports = {
  diagnoseCloudBaseIdentity,
  getTrustedCloudBaseIdentity,
  requireCloudBaseIdentity
};
