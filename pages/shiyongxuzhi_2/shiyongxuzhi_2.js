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
});