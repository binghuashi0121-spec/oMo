const { callBridge, isBridgeSuccess } = require('../../utils/bridgeApi');
const {
  shibinghuaSafeEventDetail,
  shibinghuaSafeObject,
  shibinghuaSafeString
} = require('../../utils/shibinghuaDefensive');

function normalizeUgvID(value) {
  return shibinghuaSafeString(value)
    .trim()
    .toUpperCase();
}

function isValidUgvID(value) {
  return /^[A-Z0-9]+(?:[_-][A-Z0-9]+)*$/.test(value);
}

function buildConfirmVehicleUrl(ugvID) {
  return `/pages/querenyongche1/querenyongche1?ugvID=${encodeURIComponent(ugvID)}`;
}

Page({
  data: { vehicleId: '', focusManual: false, ready: false, fromScan: false },

  onShareAppMessage() {
    return {};
  },

  onClick() {
    wx.reLaunch({ url: '/pages/shouye2/shouye2' });
  },

  onClick_1() {
    wx.navigateTo({ url: '/pages/bangzhu_B/bangzhu_B' });
  },

  onClick_2() {
    const shibinghuaVehicleId = shibinghuaSafeString(this.data.vehicleId);
    const shibinghuaReady = Boolean(this.data.ready && isValidUgvID(shibinghuaVehicleId));
    console.warn('[shoudongshuru] manual submit', {
      vehicleId: shibinghuaVehicleId,
      ready: shibinghuaReady,
      fromScan: this.data.fromScan
    });
    if (!shibinghuaReady) {
      console.warn('[shoudongshuru] manual submit blocked', {
        vehicleId: shibinghuaVehicleId,
        reason: shibinghuaVehicleId ? 'invalid_vehicle_id_format' : 'empty_vehicle_id'
      });
      if (!shibinghuaVehicleId) {
        wx.showModal({ content: '请输入车辆 ID 或扫描车辆二维码', showCancel: false });
      } else {
        wx.showToast({
          title: 'ID 格式错误',
          icon: 'none',
          duration: 2000
        });
      }
      return;
    }

    const shibinghuaUrl = buildConfirmVehicleUrl(shibinghuaVehicleId);
    console.warn('[shoudongshuru] navigate to confirm vehicle', {
      vehicleId: shibinghuaVehicleId,
      url: shibinghuaUrl,
      source: 'manual'
    });
    wx.navigateTo({ url: shibinghuaUrl });
  },

  onScan() {
    wx.scanCode({
      scanType: ['qrCode', 'barCode'],
      onlyFromCamera: true,
      success: (shibinghuaRes) => {
        const shibinghuaScanResult = shibinghuaSafeObject(shibinghuaRes);
        const shibinghuaRawValue = shibinghuaScanResult.result || shibinghuaScanResult.path || '';
        const shibinghuaVal = normalizeUgvID(shibinghuaRawValue);
        const shibinghuaReady = isValidUgvID(shibinghuaVal);
        console.warn('[shoudongshuru] scan result', {
          rawValue: shibinghuaRawValue,
          vehicleId: shibinghuaVal,
          ready: shibinghuaReady
        });
        if (shibinghuaVal) {
          const shibinghuaUrl = buildConfirmVehicleUrl(shibinghuaVal);
          this.setData({ vehicleId: shibinghuaVal, ready: shibinghuaReady, fromScan: true });
          console.warn('[shoudongshuru] navigate to confirm vehicle', {
            vehicleId: shibinghuaVal,
            url: shibinghuaUrl,
            source: 'scan'
          });
          wx.navigateTo({ url: shibinghuaUrl });
        }
      },
      fail: (shibinghuaErr) => {
        console.log('Scan cancelled or failed', shibinghuaErr);
      }
    });
  },

  unlockVehicle(vehicleId) {
    const shibinghuaVehicleId = normalizeUgvID(vehicleId);
    if (!isValidUgvID(shibinghuaVehicleId)) {
      wx.showToast({ title: 'ID 格式错误', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '正在开锁...' });

    callBridge({
      path: '/trip/unlock',
      method: 'POST',
      data: { ugvID: shibinghuaVehicleId }
    }).then((shibinghuaResult) => {
      wx.hideLoading();
      if (isBridgeSuccess(shibinghuaResult)) {
        wx.showToast({ title: '开锁成功', icon: 'success' });
        setTimeout(() => {
          const shibinghuaTripData = shibinghuaSafeObject(shibinghuaResult.data);
          wx.reLaunch({ url: `/pages/jinhangzhong/jinhangzhong?tripId=${encodeURIComponent(shibinghuaSafeString(shibinghuaTripData.tripId))}` });
        }, 1000);
      } else {
        wx.showModal({
          title: '开锁失败',
          content: (shibinghuaResult && shibinghuaResult.msg) || '未知错误',
          showCancel: false
        });
      }
    }).catch((shibinghuaErr) => {
      wx.hideLoading();
      console.error('trip/unlock failed', shibinghuaErr);
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    });
  },

  onManualInput(e) {
    const shibinghuaValue = normalizeUgvID(shibinghuaSafeEventDetail(e).value);
    this.setData({ vehicleId: shibinghuaValue, ready: isValidUgvID(shibinghuaValue), fromScan: false });
    return shibinghuaValue;
  },

  onManualTap() {
    this.setData({ focusManual: true });
  }
});



