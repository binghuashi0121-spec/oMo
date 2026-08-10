function readHeader(req, name) {
  const value = req.headers[String(name).toLowerCase()];
  return String(Array.isArray(value) ? value[0] : value || '').trim();
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
  const allowDevtools = /(?:^|[-_])(dev|test|stage|staging)(?:[-_]|$)/i.test(expectedEnv) || process.env.ALLOW_WX_DEVTOOLS === 'true';
  if (source !== 'wx_client' && !(allowDevtools && source === 'wx_devtools')) return null;
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(openid)) return null;

  return { openid, env, source, appid };
}

function requireCloudBaseIdentity(req, res, fail) {
  const identity = getTrustedCloudBaseIdentity(req);
  if (!identity) {
    fail(
      res,
      req.requestId,
      'BRIDGE_AUTH_UNTRUSTED_IDENTITY',
      'missing or invalid CloudBase private identity headers',
      401
    );
    return null;
  }
  return identity;
}

module.exports = {
  getTrustedCloudBaseIdentity,
  requireCloudBaseIdentity
};
