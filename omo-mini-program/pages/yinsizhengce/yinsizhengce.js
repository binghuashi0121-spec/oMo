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
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 200);
  },
});