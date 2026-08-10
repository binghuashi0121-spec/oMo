Page({
  data: { showFeedback: false },

  onShareAppMessage() {
    return {};
  },
  onClick() {
    wx.redirectTo({ url: '/pages/jiaochejiemian/jiaochejiemian' });
  },
  onFeedbackTap() {
    this.setData({ showFeedback: true });
  },
  closeFeedback() {
    this.setData({ showFeedback: false });
  }
});
