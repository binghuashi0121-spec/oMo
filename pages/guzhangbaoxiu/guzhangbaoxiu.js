Page({
  data: {
    vehicleId: '', // 车辆编号
    selectedFault: '', // 故障类型
    faultDescription: '', // 故障详情
    tempFilePaths: [] // 图片路径
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
    wx.redirectTo({ url: '/pages/bangzhu_H/bangzhu_H' });
  },

  // 车辆编号输入
  onIdInput(e) {
    this.setData({
      vehicleId: e.detail.value
    });
  },

  // 扫码功能
  onScanTap() {
    wx.scanCode({
      success: (res) => {
        // 假设扫码结果直接是车辆编号，或者从结果中提取
        // 这里简单处理，直接设置 result
        this.setData({
          vehicleId: res.result
        });
        wx.showToast({
          title: '扫码成功',
          icon: 'success'
        });
      },
      fail: () => {
        wx.showToast({
          title: '扫码失败',
          icon: 'none'
        });
      }
    });
  },

  onSelectFault(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      selectedFault: type
    });
  },

  onDescriptionInput(e) {
    this.setData({
      faultDescription: e.detail.value
    });
  },

  onCameraTap() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          tempFilePaths: res.tempFiles
        });
        wx.showToast({
          title: '已选择图片',
          icon: 'success'
        });
      }
    });
  },

  onSubmit() {
    if (!this.data.vehicleId) {
      wx.showToast({
        title: '请输入车辆编号',
        icon: 'none'
      });
      return;
    }
    if (!this.data.selectedFault) {
      wx.showToast({
        title: '请选择故障部位',
        icon: 'none'
      });
      return;
    }
    
    // Simulate submission delay
    wx.showLoading({
      title: '提交中...',
    });

    setTimeout(() => {
      wx.hideLoading();
      wx.navigateTo({
        url: '/pages/yiwancheng/yiwancheng'
      });
    }, 500);
  }
});
