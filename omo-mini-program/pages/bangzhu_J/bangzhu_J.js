Page({
  data: { showFeedback: false },

  onShareAppMessage() {
    return {};
  },
  onClick() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: '/pages/shouye2/shouye2' });
  },
  onFeedbackTap() {
    this.setData({ showFeedback: true });
  },
  closeFeedback() {
    this.setData({ showFeedback: false });
  }
});
