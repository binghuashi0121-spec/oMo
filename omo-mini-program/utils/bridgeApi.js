function getContainerEnv() {
  const app = getApp();
  return app && app.globalData ? app.globalData.cloudEnvId : undefined;
}

function buildContainerPath(path) {
  const app = getApp();
  if (app && typeof app.buildContainerPath === 'function') {
    return app.buildContainerPath(path);
  }
  const normalizedPath = String(path || '').startsWith('/') ? path : `/${path || ''}`;
  return normalizedPath;
}

function buildContainerHeaders(header = {}) {
  const app = getApp();
  if (app && typeof app.buildContainerHeaders === 'function') {
    return app.buildContainerHeaders(header);
  }

  return { ...header };
}

function normalizeBridgeBody(raw) {
  let payload = raw;
  
  // Handle wx.cloud.callContainer response wrapping
  if (raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' && 
      raw.data.code !== undefined && !Array.isArray(raw.data)) {
    payload = raw.data;
  }

  if (!payload || typeof payload !== 'object') {
    return { code: 500, msg: 'Invalid bridge response', data: null };
  }

  // Check for standard response with code field
  if (Object.prototype.hasOwnProperty.call(payload, 'code')) {
    return Object.assign({ msg: payload.msg || 'unknown' }, payload);
  }

  // Check for ok/message structure
  if (Object.prototype.hasOwnProperty.call(payload, 'ok')) {
    if (payload.ok) {
      return {
        code: 0,
        msg: payload.message || 'ok',
        data: payload.data,
        requestId: payload.requestId
      };
    }

    return {
      code: payload.code || 500,
      msg: payload.message || 'request failed',
      data: payload.data,
      requestId: payload.requestId
    };
  }

  // If still no standard structure, wrap it
  return {
    code: 500,
    msg: 'Unexpected response structure',
    data: payload
  };
}

function callBridge(options = {}) {
  const {
    path,
    method = 'GET',
    data = {},
    header = {},
    timeout = 15000
  } = options;

  return new Promise((resolve, reject) => {
    if (!wx.cloud || !wx.cloud.callContainer) {
      reject(new Error('bridge unavailable'));
      return;
    }

    wx.cloud.callContainer({
      config: { env: getContainerEnv() },
      path: buildContainerPath(path),
      method,
      data,
      header: buildContainerHeaders({
        'content-type': 'application/json',
        ...header
      }),
      timeout,
      success: (res) => {
        resolve(normalizeBridgeBody(res && res.data ? res.data : res));
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

function isBridgeSuccess(result) {
  if (!result) return false;
  const code = result.code;
  return code === 0 || code === '0';
}

module.exports = {
  getContainerEnv,
  buildContainerPath,
  buildContainerHeaders,
  normalizeBridgeBody,
  callBridge,
  isBridgeSuccess
};
