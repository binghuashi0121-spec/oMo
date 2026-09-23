Page({
  data: {},

  onShareAppMessage() {
    return {};
  },
  onClick() {
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 200);
  },
  onClick_1() {
    wx.navigateTo({ url: '/pages/shiyongxuzhi_2/shiyongxuzhi_2' });
  },
  onClick_2() {
    wx.navigateTo({ url: '/pages/yinsizhengce/yinsizhengce' });
  },
});