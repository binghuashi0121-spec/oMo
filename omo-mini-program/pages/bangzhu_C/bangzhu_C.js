Page({
  data: { showFeedback: false },

  onShareAppMessage() {
    return {};
  },
  onClick() {
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 200);
  },
  onFeedbackTap() {
    this.setData({ showFeedback: true });
  },
  closeFeedback() {
    this.setData({ showFeedback: false });
  }
});
