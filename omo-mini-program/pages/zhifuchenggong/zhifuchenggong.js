Page({
  data: {
    shibinghuaRedirecting: false
  },

  onShareAppMessage() {
    return {};
  },
  onClick() {
    if (this.data.shibinghuaRedirecting) return;
    this.setData({ shibinghuaRedirecting: true });
    wx.redirectTo({ url: '/pages/jinhangzhong/jinhangzhong' });
  },
});
