const {
  shibinghuaSafeObject,
  shibinghuaSafeStorage
} = require('../../utils/shibinghuaDefensive');

Page({
  data: {
    isLoggedIn: false,
    userInfo: null
  },

  onShareAppMessage() {
    return {};
  },

  onShow() {
    const shibinghuaApp = getApp();
    const shibinghuaIsLoggedIn = Boolean(
      shibinghuaApp &&
      typeof shibinghuaApp.isLoggedIn === 'function' &&
      shibinghuaApp.isLoggedIn()
    );

    this.setData({ isLoggedIn: shibinghuaIsLoggedIn });

    if (
      !shibinghuaIsLoggedIn &&
      shibinghuaApp &&
      typeof shibinghuaApp.consumeSessionExpiredNotice === 'function' &&
      shibinghuaApp.consumeSessionExpiredNotice()
    ) {
      wx.showToast({
        title: '登录状态已过期，请重新登录',
        icon: 'none'
      });
    }

    if (shibinghuaIsLoggedIn) {
      const shibinghuaGlobalData = shibinghuaSafeObject(shibinghuaApp && shibinghuaApp.globalData);
      const shibinghuaUserInfo = shibinghuaGlobalData.userInfo || shibinghuaSafeStorage('userInfo', null);
      this.setData({ userInfo: shibinghuaUserInfo });
    } else {
      this.setData({ userInfo: null });
    }
  },

  handleRestrictedAction(callback) {
    if (this.data.isLoggedIn && typeof callback === 'function') {
      callback();
      return;
    }

    const shibinghuaApp = getApp();
    const shibinghuaIsExpired = Boolean(
      shibinghuaApp &&
      typeof shibinghuaApp.wasSessionExpired === 'function' &&
      shibinghuaApp.wasSessionExpired()
    );

    wx.showModal({
      title: '提示',
      content: shibinghuaIsExpired
        ? '登录状态已过期，请重新登录后使用，是否前往登录？'
        : '该功能需要登录后使用，是否前往登录？',
      success: (shibinghuaRes) => {
        if (shibinghuaRes && shibinghuaRes.confirm) {
          wx.navigateTo({ url: '/pages/dengluyemian/dengluyemian' });
        }
      }
    });
  },

  onClick() {
    this.handleRestrictedAction(() => {
      wx.navigateTo({ url: '/pages/yiwancheng/yiwancheng' });
    });
  },

  onClick_1() {
    this.handleRestrictedAction(() => {
      wx.navigateTo({
        url: '/pages/wodexiaoxi/wodexiaoxi',
        fail: (err) => {
          console.error('navigate to messages failed', err);
          wx.showToast({
            title: '消息页打开失败',
            icon: 'none'
          });
        }
      });
    });
  },

  onClick_2() {
    wx.navigateTo({ url: '/pages/bangzhu_G/bangzhu_G' });
  },

  onClick_3() {
    wx.navigateTo({ url: '/pages/fatiao/fatiao' });
  },

  onClick_4() {
    wx.reLaunch({ url: '/pages/shouye2/shouye2' });
  },

  onLogoutTap() {
    const shibinghuaApp = getApp();

    wx.showModal({
      title: '确认退出',
      content: '确定要退出当前账号吗？',
      success: (shibinghuaRes) => {
        if (!(shibinghuaRes && shibinghuaRes.confirm)) return;

        if (shibinghuaApp && typeof shibinghuaApp.setLoggedIn === 'function') {
          shibinghuaApp.setLoggedIn(false);
        }
        this.setData({
          isLoggedIn: false,
          userInfo: null
        });
        wx.showToast({
          title: '已退出登录',
          icon: 'none'
        });
        wx.removeStorageSync('guest_token');
        wx.removeStorageSync('token');
        wx.removeStorageSync('userInfo');
      }
    });
  }
});
