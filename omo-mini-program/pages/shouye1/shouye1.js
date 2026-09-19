const { shibinghuaSafeObject } = require('../../utils/shibinghuaDefensive');

Page({
  data: { isLoggedIn: false, showLoginMask: false, loginLoading: false },

  onShareAppMessage() {
    return {};
  },

  onShow() {
    const shibinghuaApp = getApp();
    const shibinghuaIsLoggedIn = Boolean(shibinghuaApp && typeof shibinghuaApp.isLoggedIn === 'function' && shibinghuaApp.isLoggedIn());
    this.setData({ isLoggedIn: shibinghuaIsLoggedIn });
  },

  onRequireLoginTap() {
    const shibinghuaApp = getApp();
    const shibinghuaAppState = shibinghuaSafeObject(shibinghuaApp);
    const shibinghuaIsLoggedIn = typeof shibinghuaAppState.isLoggedIn === 'function' && shibinghuaAppState.isLoggedIn();
    if (shibinghuaIsLoggedIn) return;
    this.setData({ showLoginMask: true, loginLoading: true });
    wx.showLoading({ title: '正在进入登录...', mask: true });
    setTimeout(() => {
      wx.redirectTo({ url: '/pages/dengluyemian/dengluyemian' });
      wx.hideLoading();
    }, 1000);
  },

  onClick() {
    const shibinghuaApp = getApp();
    const shibinghuaIsLoggedIn = Boolean(shibinghuaApp && typeof shibinghuaApp.isLoggedIn === 'function' && shibinghuaApp.isLoggedIn());
    if (!shibinghuaIsLoggedIn) {
      this.setData({ showLoginMask: true, loginLoading: false });
      return;
    }
    this.onRequireLoginTap();
  },

  onClick_1() {
    const shibinghuaApp = getApp();
    const shibinghuaIsLoggedIn = Boolean(shibinghuaApp && typeof shibinghuaApp.isLoggedIn === 'function' && shibinghuaApp.isLoggedIn());
    if (!shibinghuaIsLoggedIn) {
      this.setData({ showLoginMask: true, loginLoading: false });
      return;
    }
    this.onRequireLoginTap();
  }
});
