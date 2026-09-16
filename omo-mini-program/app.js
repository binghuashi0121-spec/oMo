const SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 hours
const SESSION_EXPIRED_NOTICE_KEY = 'session_expired_notice';
const { detectEnvVersion, resolveRuntimeEnvironment } = require('./config/environments');

App({
  onLaunch() {
    try {
      const runtimeEnvironment = resolveRuntimeEnvironment(detectEnvVersion());
      Object.assign(this.globalData, {
        environmentReady: true,
        environmentName: runtimeEnvironment.name,
        envVersion: runtimeEnvironment.envVersion,
        cloudEnvId: runtimeEnvironment.cloudEnvId,
        containerPathPrefix: runtimeEnvironment.containerPathPrefix,
        containerServiceName: runtimeEnvironment.containerServiceName,
        environmentError: ''
      });
      console.info(`[app] environment=${runtimeEnvironment.name} envVersion=${runtimeEnvironment.envVersion}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '小程序运行环境配置错误';
      Object.assign(this.globalData, { environmentReady: false, environmentError: message });
      console.error('[app] environment validation failed', error);
      if (typeof wx.showModal === 'function') wx.showModal({ title: '环境配置错误', content: message, showCancel: false });
      return;
    }

    try {
      if (!wx.cloud) {
        console.error('Please use base library >= 2.2.3 to enable cloud capability.');
      } else {
        wx.cloud.init({
          env: this.globalData.cloudEnvId,
          traceUser: true
        });
      }
    } catch (error) {
      console.error('[app] wx.cloud.init failed', error);
    }

    try {
      this.checkLoginStatus();
    } catch (error) {
      // Prevent launch-stage exceptions from breaking lifecycle start.
      console.error('[app] checkLoginStatus failed', error);
      this.globalData.isLoggedIn = false;
      this.globalData.lastLogoutReason = 'error';
    }

    this.globalData.systemInfo = this.getSafeSystemInfo();
  },

  globalData: {
    isLoggedIn: false,
    environmentReady: false,
    environmentName: '',
    envVersion: '',
    environmentError: '',
    cloudEnvId: '',
    containerPathPrefix: '',
    containerServiceName: '',
    lastLogoutReason: '',
    sessionExpiredNotice: false,
    systemInfo: {}
  },

  getSafeSystemInfo() {
    try {
      const info = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : null;
      return info && typeof info === 'object' ? info : {};
    } catch (error) {
      console.warn('[app] getSystemInfoSync failed', error);
      return {};
    }
  },

  buildContainerPath(path) {
    const prefix = (this.globalData && this.globalData.containerPathPrefix) || '';
    const normalizedPath = String(path || '').startsWith('/') ? path : `/${path || ''}`;
    if (!prefix) return normalizedPath;
    const normalizedPrefix = String(prefix).startsWith('/') ? prefix : `/${prefix}`;
    return `${normalizedPrefix.replace(/\/+$/, '')}${normalizedPath}`;
  },

  buildContainerHeaders(header = {}) {
    const serviceName = (this.globalData && this.globalData.containerServiceName) || '';
    return serviceName
      ? {
          'X-WX-SERVICE': serviceName,
          ...header
        }
      : { ...header };
  },

  checkLoginStatus() {
    const flag = wx.getStorageSync('isLoggedIn');
    const loginTime = wx.getStorageSync('loginTime');
    const now = Date.now();
    const isExpired = Boolean(flag && loginTime && now - loginTime >= SESSION_DURATION);

    if (flag && loginTime && now - loginTime < SESSION_DURATION) {
      this.globalData.isLoggedIn = true;
      this.globalData.lastLogoutReason = '';
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo) {
        this.globalData.userInfo = userInfo;
      }
    } else {
      this.logout(isExpired ? 'expired' : 'invalid');
    }
  },

  setLoggedIn(flag, userInfo = null) {
    if (flag) {
      this.globalData.isLoggedIn = true;
      this.globalData.lastLogoutReason = '';
      this.globalData.sessionExpiredNotice = false;
      wx.setStorageSync('isLoggedIn', true);
      wx.setStorageSync('loginTime', Date.now());
      wx.removeStorageSync(SESSION_EXPIRED_NOTICE_KEY);
      if (userInfo) {
        this.globalData.userInfo = userInfo;
        wx.setStorageSync('userInfo', userInfo);
      }
    } else {
      this.logout('manual');
    }
  },

  logout(reason = 'manual') {
    const shouldNotifyExpired = reason === 'expired';
    this.globalData.isLoggedIn = false;
    this.globalData.userInfo = null;
    this.globalData.lastLogoutReason = reason;
    this.globalData.sessionExpiredNotice = shouldNotifyExpired;
    wx.removeStorageSync('isLoggedIn');
    wx.removeStorageSync('loginTime');
    wx.removeStorageSync('user_phone');
    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('guest_token');
    wx.removeStorageSync('openid');
    wx.removeStorageSync('openId');
    if (shouldNotifyExpired) {
      wx.setStorageSync(SESSION_EXPIRED_NOTICE_KEY, true);
    } else {
      wx.removeStorageSync(SESSION_EXPIRED_NOTICE_KEY);
    }
  },

  consumeSessionExpiredNotice() {
    const shouldShow = Boolean(
      this.globalData.sessionExpiredNotice || wx.getStorageSync(SESSION_EXPIRED_NOTICE_KEY)
    );

    this.globalData.sessionExpiredNotice = false;
    wx.removeStorageSync(SESSION_EXPIRED_NOTICE_KEY);
    return shouldShow;
  },

  wasSessionExpired() {
    return this.globalData.lastLogoutReason === 'expired';
  },

  isLoggedIn() {
    this.checkLoginStatus();
    return this.globalData.isLoggedIn;
  }
});
