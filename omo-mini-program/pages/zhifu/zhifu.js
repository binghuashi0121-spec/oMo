const { buildModeCommand } = require('../../utils/vehicleControl');
const { callBridge, isBridgeSuccess } = require('../../utils/bridgeApi');
const { commandFailureFeedback } = require('../../utils/bridgeCommandFeedback');
const {
  shibinghuaSafeObject,
  shibinghuaSafeStorage,
  shibinghuaSafeString
} = require('../../utils/shibinghuaDefensive');

function buildTripPageUrl(trip) {
  const shibinghuaTrip = shibinghuaSafeObject(trip);
  if (!shibinghuaTrip.tripId) {
    return '';
  }

  const shibinghuaTripId = encodeURIComponent(shibinghuaSafeString(shibinghuaTrip.tripId));
  const shibinghuaUgvID = encodeURIComponent(shibinghuaSafeString(shibinghuaTrip.ugvID || shibinghuaTrip.vehicleId));
  const shibinghuaTripStatus = shibinghuaTrip.status || 'active';

  return shibinghuaTripStatus === 'waiting_pickup'
    ? `/pages/dengdaiquche/dengdaiquche?tripId=${shibinghuaTripId}&ugvID=${shibinghuaUgvID}`
    : `/pages/jinhangzhong/jinhangzhong?tripId=${shibinghuaTripId}&ugvID=${shibinghuaUgvID}`;
}

function getStoredTripInfo() {
  const shibinghuaTrip = shibinghuaSafeStorage('currentTripInfo', null);
  return shibinghuaTrip && shibinghuaTrip.tripId ? shibinghuaTrip : null;
}

Page({
  data: {
    deposit: '200.00',
    ugvID: ''
  },

  onLoad(options) {
    const shibinghuaOptions = shibinghuaSafeObject(options);
    const shibinghuaUgvID = shibinghuaOptions.ugvID || shibinghuaOptions.vehicleId
      ? decodeURIComponent(shibinghuaSafeString(shibinghuaOptions.ugvID || shibinghuaOptions.vehicleId)).trim()
      : '';

    if (shibinghuaUgvID) {
      this.setData({ ugvID: shibinghuaUgvID });
    }
  },

  onShareAppMessage() {
    return {};
  },

  onClick() {
    wx.showLoading({ title: '支付中...' });

    setTimeout(() => {
      if (this.data.ugvID) {
        this.unlockVehicle(this.data.ugvID);
      } else {
        wx.hideLoading();
        wx.showToast({ title: '参数错误：无车辆信息', icon: 'none' });
      }
    }, 1000);
  },

  enterExistingTrip(trip) {
    const shibinghuaUrl = buildTripPageUrl(trip);
    if (!shibinghuaUrl) {
      wx.showToast({ title: '未找到未结束行程', icon: 'none' });
      return;
    }

    wx.reLaunch({ url: shibinghuaUrl });
  },

  async navigateToExistingTrip(serverTrip) {
    const shibinghuaServerTrip = shibinghuaSafeObject(serverTrip);
    if (shibinghuaServerTrip.tripId) {
      this.enterExistingTrip(shibinghuaServerTrip);
      return;
    }

    const shibinghuaStoredTrip = getStoredTripInfo();
    if (shibinghuaStoredTrip && shibinghuaStoredTrip.tripId) {
      this.enterExistingTrip(shibinghuaStoredTrip);
      return;
    }

    wx.showLoading({ title: '正在定位行程...' });
    try {
      const shibinghuaResult = await callBridge({
        path: '/trip/active',
        method: 'GET'
      });
      wx.hideLoading();

      const shibinghuaTrip = shibinghuaSafeObject(shibinghuaResult && shibinghuaResult.data);
      if (!shibinghuaTrip.tripId) {
        wx.showToast({ title: '未找到未结束行程', icon: 'none' });
        return;
      }

      this.enterExistingTrip(shibinghuaTrip);
    } catch (shibinghuaErr) {
      wx.hideLoading();
      console.error('checkActiveTrip failed', shibinghuaErr);
      wx.showToast({ title: '获取行程失败，请重试', icon: 'none' });
    }
  },

  handleUnlockFailure(result) {
    const shibinghuaResult = shibinghuaSafeObject(result);
    const shibinghuaCode = shibinghuaResult.code;
    const shibinghuaMessage = shibinghuaResult.msg || '未知错误';
    const shibinghuaExistingTrip = shibinghuaResult.data ? shibinghuaResult.data : null;

    console.warn('[trip/unlock] failed', {
      code: shibinghuaCode,
      message: shibinghuaMessage,
      requestId: shibinghuaResult.requestId ? shibinghuaResult.requestId : '',
      data: shibinghuaResult.data ? shibinghuaResult.data : null
    });

    if (String(shibinghuaCode) === '1002') {
      wx.showModal({
        title: '开锁失败',
        content: '您有未结束的行程，请先处理。点击确定后将跳转到对应行程页面。',
        showCancel: false,
        confirmText: '去处理',
        success: () => {
          this.navigateToExistingTrip(shibinghuaExistingTrip);
        }
      });
      return;
    }

    wx.showModal({
      title: '开锁失败',
      content: shibinghuaMessage,
      showCancel: false
    });
  },

  async sendVehicleCommand(ugvID, messageType, command, onDone) {
    const shibinghuaUgvID = shibinghuaSafeString(ugvID).trim();
    if (!shibinghuaUgvID) {
      if (typeof onDone === 'function') onDone(false, { code: 'BRIDGE_INVALID_VEHICLE', msg: '无车辆信息' });
      return;
    }

    try {
      const shibinghuaResult = await callBridge({
        path: '/sendCommand',
        method: 'POST',
        data: {
          ugvID: shibinghuaUgvID,
          messageType,
          command
        }
      });
      if (typeof onDone === 'function') onDone(isBridgeSuccess(shibinghuaResult), shibinghuaResult);
    } catch (shibinghuaErr) {
      console.warn('[MQTT] send command failed', { ugvID: shibinghuaUgvID, messageType, err: shibinghuaErr });
      if (typeof onDone === 'function') {
        onDone(false, { code: 'BRIDGE_REQUEST_FAILED', msg: '车辆指令请求失败' });
      }
    }
  },

  openWaitingTrip(trip) {
    wx.reLaunch({
      url: `/pages/dengdaiquche/dengdaiquche?tripId=${encodeURIComponent(shibinghuaSafeString(trip.tripId))}&ugvID=${encodeURIComponent(shibinghuaSafeString(trip.ugvID))}`
    });
  },

  handleVehicleCommandFailure(result, trip) {
    const feedback = commandFailureFeedback(result);
    wx.showModal({
      ...feedback,
      success: (modalResult) => {
        if (!modalResult.confirm) {
          this.openWaitingTrip(trip);
          return;
        }

        wx.showLoading({ title: '正在取消...', mask: true });
        callBridge({
          path: '/trip/cancel',
          method: 'POST',
          data: { tripId: trip.tripId }
        }).then((cancelResult) => {
          wx.hideLoading();
          if (!isBridgeSuccess(cancelResult)) {
            wx.showToast({ title: (cancelResult && cancelResult.msg) || '取消失败', icon: 'none' });
            this.openWaitingTrip(trip);
            return;
          }
          wx.removeStorageSync('currentTripInfo');
          wx.showToast({ title: '测试订单已取消', icon: 'success' });
          setTimeout(() => wx.reLaunch({ url: '/pages/shouye2/shouye2' }), 800);
        }).catch((error) => {
          wx.hideLoading();
          console.error('cancel waiting trip after command failure', error);
          wx.showToast({ title: '取消失败，请在等待页重试', icon: 'none' });
          this.openWaitingTrip(trip);
        });
      }
    });
  },

  async unlockVehicle(ugvID) {
    const shibinghuaUgvID = shibinghuaSafeString(ugvID).trim();
    if (!shibinghuaUgvID) {
      wx.hideLoading();
      wx.showToast({ title: '参数错误：无车辆信息', icon: 'none' });
      return;
    }

    try {
      const shibinghuaResult = await callBridge({
        path: '/trip/unlock',
        method: 'POST',
        data: { ugvID: shibinghuaUgvID }
      });

      wx.hideLoading();

      if (!isBridgeSuccess(shibinghuaResult)) {
        this.handleUnlockFailure(shibinghuaResult);
        return;
      }

      const shibinghuaPayload = shibinghuaSafeObject(shibinghuaResult.data);
      const shibinghuaResolvedUgvID = shibinghuaPayload.ugvID || shibinghuaPayload.vehicleId || shibinghuaUgvID;

      wx.setStorageSync('currentTripInfo', {
        tripId: shibinghuaPayload.tripId,
        runtimeId: shibinghuaPayload.runtimeId,
        vehicleId: shibinghuaResolvedUgvID,
        ugvID: shibinghuaResolvedUgvID,
        startTime: null,
        waitStartTime: Date.now(),
        tripStatus: 'waiting_pickup'
      });

      this.sendVehicleCommand(
        shibinghuaResolvedUgvID,
        'ugvSetMode',
        buildModeCommand(shibinghuaResolvedUgvID, 1),
        (commandSucceeded, commandResult) => {
          const trip = {
            tripId: shibinghuaPayload.tripId,
            ugvID: shibinghuaResolvedUgvID
          };
          if (!commandSucceeded) {
            this.handleVehicleCommandFailure(commandResult, trip);
            return;
          }
          wx.showToast({ title: '开锁成功', icon: 'success' });
          setTimeout(() => {
            this.openWaitingTrip(trip);
          }, 1000);
        }
      );
    } catch (shibinghuaErr) {
      wx.hideLoading();
      console.error('trip/unlock failed', shibinghuaErr);
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    }
  },

  onClick_1() {
    wx.navigateBack();
  }
});
