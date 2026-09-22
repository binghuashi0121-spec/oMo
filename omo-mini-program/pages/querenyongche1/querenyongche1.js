const { callBridge, isBridgeSuccess } = require('../../utils/bridgeApi');
const DEFAULT_CAPACITY_TEXT = '2人';
const DEFAULT_FULL_RANGE_KM = 30;

function isObjectIdLike(value) {
  return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value.trim());
}

function formatRangeText(rangeValue, batteryValue) {
  if (typeof rangeValue === 'string' && rangeValue.trim()) {
    return rangeValue.trim();
  }

  const numericRange = Number(rangeValue);
  if (Number.isFinite(numericRange)) {
    return `约${Math.max(0, Math.round(numericRange))}km`;
  }

  const battery = Number(batteryValue);
  if (Number.isFinite(battery)) {
    const estimatedRangeKm = Math.max(0, Math.round((battery / 100) * DEFAULT_FULL_RANGE_KM));
    return `约${estimatedRangeKm}km`;
  }

  return '未知';
}

function getVehicleStatusInfo(vehicle) {
  if (vehicle && vehicle.statusInfo && typeof vehicle.statusInfo === 'object') {
    return vehicle.statusInfo;
  }

  return vehicle && vehicle.status && typeof vehicle.status === 'object'
    ? vehicle.status
    : {};
}

function getVehicleLatestStatus(vehicle) {
  const latestPayload =
    vehicle && vehicle.latestPayload && typeof vehicle.latestPayload === 'object'
      ? vehicle.latestPayload
      : {};

  return latestPayload && latestPayload.payload && typeof latestPayload.payload === 'object'
    ? latestPayload.payload
    : {};
}

function getVehicleAvailabilityStatus(businessStatus, runtimeStatus) {
  if (runtimeStatus === 'available' || runtimeStatus === 'online') return 'available';
  if (runtimeStatus === 'faulty' || runtimeStatus === 'maintenance' || runtimeStatus === 'in_use') {
    return runtimeStatus;
  }
  if (runtimeStatus === 'offline') return 'offline';
  if (businessStatus) return businessStatus;
  return 'available';
}

Page({
  data: {
    vehicleId: '',
    vehicleDocId: '',
    ugvID: '',
    serialText: '',
    capacityText: DEFAULT_CAPACITY_TEXT,
    rangeText: '计算中...',
    modelText: '智能漫步车'
  },

  getVehicleIdentity(options) {
    const raw = options && (options.ugvID || options.vehicleId || options.id);
    return raw ? decodeURIComponent(String(raw)).trim() : '';
  },

  exitUnavailableVehicle() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({ url: '/pages/jiaochejiemian/jiaochejiemian' });
      }
    });
  },

  applyVehicleInfo(vehicle, requestedUgvID) {
    const statusInfo = getVehicleStatusInfo(vehicle);
    const latestStatus = getVehicleLatestStatus(vehicle);
    const businessStatus = typeof vehicle.status === 'string' ? vehicle.status : '';
    const telemetryStatus = statusInfo.status || latestStatus.status || '';
    const batteryValue =
      vehicle.battery ?? statusInfo.electiricQuantity ?? latestStatus.electiricQuantity;
    const battery = Number(batteryValue);
    const runtimeStatus = telemetryStatus || businessStatus;
    const availabilityStatus = getVehicleAvailabilityStatus(businessStatus, runtimeStatus);
    const rangeValue =
      vehicle.range ?? statusInfo.remainingRange ?? latestStatus.remainingRange;
    const model = vehicle.model ?? statusInfo.model ?? latestStatus.model ?? '智能漫步车';
    const resolvedUgvID = vehicle.ugvID || requestedUgvID;

    if (runtimeStatus === 'faulty' || runtimeStatus === 'maintenance' || vehicle.faultCode) {
      wx.showModal({
        title: '车辆不可用',
        content: '车辆故障或维护中，暂不可用。',
        showCancel: false,
        success: () => this.exitUnavailableVehicle()
      });
      return;
    }

    if (availabilityStatus === 'in_use') {
      wx.showModal({
        title: '车辆不可用',
        content: '车辆正在使用中，请选择其他车辆。',
        showCancel: false,
        success: () => this.exitUnavailableVehicle()
      });
      return;
    }

    this.setData({
      vehicleId: resolvedUgvID,
      vehicleDocId: vehicle._id || '',
      ugvID: resolvedUgvID,
      serialText: resolvedUgvID,
      capacityText: DEFAULT_CAPACITY_TEXT,
      rangeText: formatRangeText(rangeValue, batteryValue),
      modelText: model
    });
  },

  onLoad(options) {
    const ugvID = this.getVehicleIdentity(options);

    if (!ugvID) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }

    this.setData({
      vehicleId: ugvID,
      ugvID,
      serialText: ugvID,
      capacityText: DEFAULT_CAPACITY_TEXT,
      rangeText: '计算中...'
    });

    this.fetchVehicleInfo(ugvID);
  },

  async fetchVehicleInfo(ugvID) {
    try {
      const result = await callBridge({
        path: '/vehicles/available',
        method: 'GET'
      });

      const vehicles = isBridgeSuccess(result) && Array.isArray(result.data) ? result.data : [];
      const vehicle = vehicles.find((item) => item && (item.ugvID === ugvID || item._id === ugvID));
      if (!vehicle) {
        console.warn('[querenyongche1] selected vehicle is no longer available', {
          ugvID,
          code: result && result.code,
          availableUgvIds: vehicles.map((item) => item && item.ugvID).filter(Boolean)
        });
        wx.showModal({
          title: '车辆暂不可用',
          content: '车辆状态已变化，请返回重新选择。',
          showCancel: false,
          success: () => this.exitUnavailableVehicle()
        });
        return;
      }

      console.log('获取车辆信息成功', vehicle);
      this.applyVehicleInfo(vehicle, ugvID);
    } catch (err) {
      console.error('获取车辆信息失败', err);
      wx.showModal({
        title: '车辆信息获取失败',
        content: '车辆服务暂时不可用，请稍后重试。',
        showCancel: false
      });

      this.setData({
        vehicleDocId: '',
        serialText: ugvID,
        capacityText: DEFAULT_CAPACITY_TEXT,
        rangeText: '未知',
        modelText: '获取失败'
      });
    }
  },

  onShareAppMessage() {
    return {};
  },

  onClick() {
    this.exitUnavailableVehicle();
  },

  onClick_1() {
    wx.navigateTo({ url: '/pages/bangzhu_D/bangzhu_D' });
  },

  onClick_2() {
    if (!this.data.ugvID) {
      wx.showToast({ title: '未获取到车辆信息', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/shiyongxuzhi_1/shiyongxuzhi_1?ugvID=${encodeURIComponent(this.data.ugvID)}`
    });
  }
});


