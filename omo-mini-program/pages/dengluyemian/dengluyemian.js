const PHONE_PATTERN = /^1\d{10}$/;
const CODE_PATTERN = /^\d{4,6}$/;
const {
  shibinghuaSafeEventDetail,
  shibinghuaSafeObject,
  shibinghuaSafeString
} = require('../../utils/shibinghuaDefensive');

Page({
  data: {
    phone: '',
    code: '',
    countdown: 0,
    focusPhone: false,
    focusCode: false,
    sendingCode: false,
    submittingLogin: false
  },

  onShareAppMessage() {
    return {};
  },

  getSafeSystemInfo() {
    try {
      const shibinghuaInfo = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : null;
      return shibinghuaSafeObject(shibinghuaInfo);
    } catch (shibinghuaError) {
      console.warn('getSystemInfoSync failed', shibinghuaError);
      return {};
    }
  },

  normalizeSystemInfo(info) {
    const shibinghuaSource = shibinghuaSafeObject(info);
    return {
      model: typeof shibinghuaSource.model === 'string' ? shibinghuaSource.model : '',
      system: typeof shibinghuaSource.system === 'string' ? shibinghuaSource.system : '',
      version: typeof shibinghuaSource.version === 'string' ? shibinghuaSource.version : '',
      brand: typeof shibinghuaSource.brand === 'string' ? shibinghuaSource.brand : '',
      platform: typeof shibinghuaSource.platform === 'string' ? shibinghuaSource.platform : ''
    };
  },

  onUnload() {
    this.clearCountdownTimer();
  },

  onPhoneWrapperTap() {
    this.setData({ focusPhone: true });
  },

  onPhoneInput(e) {
    const shibinghuaPhone = shibinghuaSafeString(shibinghuaSafeEventDetail(e).value).replace(/\D/g, '').slice(0, 11);
    this.setData({ phone: shibinghuaPhone });
  },

  onCodeInput(e) {
    const shibinghuaCode = shibinghuaSafeString(shibinghuaSafeEventDetail(e).value).replace(/\D/g, '').slice(0, 6);
    this.setData({ code: shibinghuaCode });
  },

  isValidPhone(phone) {
    return PHONE_PATTERN.test(phone);
  },

  isValidCode(code) {
    return CODE_PATTERN.test(code);
  },

  clearCountdownTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  startCountdown(seconds = 60) {
    this.clearCountdownTimer();
    this.setData({ countdown: seconds });
    this._timer = setInterval(() => {
      const shibinghuaNextCountdown = Math.max(0, Number(this.data.countdown || 0) - 1);
      this.setData({ countdown: shibinghuaNextCountdown });
      if (shibinghuaNextCountdown <= 0) {
        this.clearCountdownTimer();
      }
    }, 1000);
  },

  onSendCode() {
    const shibinghuaPhone = shibinghuaSafeString(this.data.phone);
    if (this.data.countdown > 0 || this.data.sendingCode) return;

    if (!shibinghuaPhone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }
    if (!this.isValidPhone(shibinghuaPhone)) {
      wx.showToast({ title: '请输入11位有效手机号', icon: 'none' });
      return;
    }

    this.setData({ sendingCode: true });
    wx.showLoading({ title: '发送中...' });

    wx.cloud.callFunction({
      name: 'sendSms',
      data: { phone: shibinghuaPhone },
      success: (shibinghuaRes) => {
        wx.hideLoading();
        const shibinghuaResult = shibinghuaRes && shibinghuaRes.result;
        if (shibinghuaResult && shibinghuaResult.code === 0) {
          wx.showToast({ title: '验证码已发送', icon: 'none' });
          // staging 体验版调试：只在服务端严格门禁通过后返回并显示。
          if (shibinghuaResult.debug_code) {
             wx.showModal({
               title: '体验版调试验证码',
               content: '收到验证码：' + shibinghuaResult.debug_code,
               showCancel: false,
               confirmText: '填入',
               success: (shibinghuaModalRes) => {
                 if (shibinghuaModalRes && shibinghuaModalRes.confirm) {
                   this.setData({ code: shibinghuaResult.debug_code });
                 }
               }
             });
          }
          this.startCountdown(60);
          return;
        }
        wx.showToast({ title: (shibinghuaResult && shibinghuaResult.msg) || '发送失败', icon: 'none' });
      },
      fail: (shibinghuaErr) => {
        wx.hideLoading();
        console.error('sendSms调用失败', shibinghuaErr);
        wx.showToast({ title: '网络错误，请稍后重试', icon: 'none' });
      },
      complete: () => {
        this.setData({ sendingCode: false });
      }
    });
  },

  onSubmitLogin() {
    const shibinghuaApp = getApp();
    const shibinghuaPhone = shibinghuaSafeString(this.data.phone);
    const shibinghuaCode = shibinghuaSafeString(this.data.code);
    if (this.data.submittingLogin) return;

    if (!shibinghuaPhone && !shibinghuaCode) {
      wx.showToast({ title: '请输入手机号和验证码', icon: 'none' });
      return;
    }
    if (!shibinghuaPhone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }
    if (!this.isValidPhone(shibinghuaPhone)) {
      wx.showToast({ title: '请输入11位有效手机号', icon: 'none' });
      return;
    }
    if (!shibinghuaCode) {
      wx.showToast({ title: '请输入验证码', icon: 'none' });
      return;
    }
    if (!this.isValidCode(shibinghuaCode)) {
      wx.showToast({ title: '验证码格式不正确', icon: 'none' });
      return;
    }

    this.setData({ submittingLogin: true });
    wx.showLoading({ title: '登录中...' });

    // 获取设备信息
    const shibinghuaSystemInfo = this.getSafeSystemInfo();
    const shibinghuaDeviceInfo = this.normalizeSystemInfo(shibinghuaSystemInfo);

    wx.cloud.callFunction({
      name: 'loginWithPhone',
      data: { phone: shibinghuaPhone, code: shibinghuaCode, deviceInfo: shibinghuaDeviceInfo },
      success: (shibinghuaRes) => {
        wx.hideLoading();
        const shibinghuaResult = shibinghuaRes && shibinghuaRes.result;
        const shibinghuaResultData = shibinghuaSafeObject(shibinghuaResult && shibinghuaResult.data);
        if (!(shibinghuaResult && shibinghuaResult.code === 0 && shibinghuaResultData.token)) {
          wx.showToast({ title: (shibinghuaResult && shibinghuaResult.msg) || '登录失败', icon: 'none' });
          return;
        }

        if (shibinghuaResult.dbError) {
          console.error('登录成功但用户信息写入异常', shibinghuaResult.dbError);
        }

        wx.setStorageSync('token', shibinghuaResultData.token);
        // OpenID is a server/platform identity and must never be supplied from local storage.
        wx.removeStorageSync('openid');
        wx.removeStorageSync('openId');
        wx.setStorageSync('userInfo', shibinghuaResultData.userInfo || {});
        wx.setStorageSync('user_phone', shibinghuaPhone);
        wx.removeStorageSync('guest_token');
        if (shibinghuaApp && typeof shibinghuaApp.setLoggedIn === 'function') {
          shibinghuaApp.setLoggedIn(true, shibinghuaResultData.userInfo || {});
        }

        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/wode/wode' }) });
        }, 600);
      },
      fail: (shibinghuaErr) => {
        wx.hideLoading();
        console.error('loginWithPhone调用失败', shibinghuaErr);
        wx.showToast({ title: '登录请求失败，请稍后重试', icon: 'none' });
      },
      complete: () => {
        this.setData({ submittingLogin: false });
      }
    });
  },

  onQuickLogin() {
    const shibinghuaApp = getApp();
    wx.showLoading({ title: '微信登录中...' });

    wx.cloud.callFunction({
      name: 'wechatLogin',
      success: (shibinghuaRes) => {
        wx.hideLoading();
        const shibinghuaResult = shibinghuaRes && shibinghuaRes.result;
        const shibinghuaResultData = shibinghuaSafeObject(shibinghuaResult && shibinghuaResult.data);
        if (shibinghuaResult && shibinghuaResult.code === 0 && shibinghuaResultData.token) {
          wx.showToast({
            title: '仅供浏览，用车请先手机号登录',
            icon: 'none',
            duration: 2000
          });

          wx.setStorageSync('guest_token', shibinghuaResultData.token);
          wx.removeStorageSync('openid');
          wx.removeStorageSync('openId');
          // Keep guest credentials; only clear formal-login state.
          if (shibinghuaApp && shibinghuaApp.globalData) {
            shibinghuaApp.globalData.isLoggedIn = false;
            shibinghuaApp.globalData.userInfo = null;
          }
          wx.removeStorageSync('isLoggedIn');
          wx.removeStorageSync('loginTime');
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('user_phone');

          setTimeout(() => {
            wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/wode/wode' }) });
          }, 1500);
          return;
        }
        wx.showToast({ title: '微信登录失败', icon: 'none' });
      },
      fail: (shibinghuaErr) => {
        wx.hideLoading();
        console.error('wechatLogin调用失败', shibinghuaErr);
        wx.showToast({ title: '云函数调用失败', icon: 'none' });
      }
    });
  },

  onClick() {
    this.onSubmitLogin();
  },

  onClick_1() {
    this.onSubmitLogin();
  }
});
