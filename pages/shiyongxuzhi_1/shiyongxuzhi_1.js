Page({
  data: {
    ugvID: ''
  },

  onLoad(options) {
    const ugvID = options && (options.ugvID || options.vehicleId)
      ? decodeURIComponent(String(options.ugvID || options.vehicleId)).trim()
      : '';

    if (ugvID) {
      this.setData({ ugvID });
    }
  },

  onShareAppMessage() {
    return {};
  },

  onClick() {
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 200);
  },

  onClick_1() {
    if (this.data.ugvID) {
      wx.navigateTo({
        url: `/pages/zhifu/zhifu?ugvID=${encodeURIComponent(this.data.ugvID)}`
      });
      return;
    }

    wx.navigateTo({ url: '/pages/zhifu/zhifu' });
  }
});
