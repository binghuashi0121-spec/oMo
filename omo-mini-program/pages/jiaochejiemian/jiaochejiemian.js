const { callBridge, isBridgeSuccess } = require('../../utils/bridgeApi');

const LOW_BATTERY_THRESHOLD = 20;
const VEHICLE_REPORT_STALE_MS = 60 * 1000;
const VEHICLE_REPORT_FUTURE_TOLERANCE_MS = 5 * 1000;
const DEFAULT_VEHICLE_MODEL = 'oMo_Standard';
const DEFAULT_CAPACITY_TEXT = '2人';
const DEFAULT_FULL_RANGE_KM = 30;
const DEFAULT_PICKUP_TEXT = '选择上车点';
const DEFAULT_PICKUP_COORDINATE_TEXT = '--, --';

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatRangeText(rangeValue, batteryValue) {
  if (typeof rangeValue === 'string' && rangeValue.trim()) return rangeValue.trim();

  const numericRange = toFiniteNumber(rangeValue);
  if (numericRange !== null) {
    return `约${Math.max(0, Math.round(numericRange))}km`;
  }

  const battery = toFiniteNumber(batteryValue);
  if (battery !== null) {
    const estimatedRangeKm = Math.max(0, Math.round((battery / 100) * DEFAULT_FULL_RANGE_KM));
    return `约${estimatedRangeKm}km`;
  }

  return '未知';
}

function normalizeVehicleModel() {
  return DEFAULT_VEHICLE_MODEL;
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

function formatCoordinateText(latitude, longitude) {
  const lat = toFiniteNumber(latitude);
  const lng = toFiniteNumber(longitude);
  if (lat === null || lng === null) return DEFAULT_PICKUP_COORDINATE_TEXT;
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function getVehicleFreshness(vehicle) {
  const statusInfo =
    vehicle && vehicle.statusInfo && typeof vehicle.statusInfo === 'object'
      ? vehicle.statusInfo
      : vehicle && vehicle.status && typeof vehicle.status === 'object'
        ? vehicle.status
        : {};

  const latestPayload =
    vehicle && vehicle.latestPayload && typeof vehicle.latestPayload === 'object'
      ? vehicle.latestPayload
      : {};

  const latestStatus =
    latestPayload && latestPayload.payload && typeof latestPayload.payload === 'object'
      ? latestPayload.payload
      : {};

  const timestamp = Number(
    vehicle?.lastReportAt ??
    statusInfo.timestamp ??
    latestStatus.timestamp ??
    vehicle?.updatedAt ??
    0
  );

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isFreshVehicleTimestamp(timestamp, maxAgeMs = VEHICLE_REPORT_STALE_MS, now = Date.now()) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  const ageMs = now - timestamp;
  return ageMs >= -VEHICLE_REPORT_FUTURE_TOLERANCE_MS && ageMs <= maxAgeMs;
}

function isFreshVehicleDoc(vehicle, maxAgeMs = VEHICLE_REPORT_STALE_MS, now = Date.now()) {
  return isFreshVehicleTimestamp(getVehicleFreshness(vehicle), maxAgeMs, now);
}

function normalizeVehicleDoc(vehicle, markerId) {
  const statusInfo =
    vehicle && vehicle.statusInfo && typeof vehicle.statusInfo === 'object'
      ? vehicle.statusInfo
      : vehicle && vehicle.status && typeof vehicle.status === 'object'
        ? vehicle.status
        : {};

  const latestPayload =
    vehicle && vehicle.latestPayload && typeof vehicle.latestPayload === 'object'
      ? vehicle.latestPayload
      : {};

  const latestStatus =
    latestPayload && latestPayload.payload && typeof latestPayload.payload === 'object'
      ? latestPayload.payload
      : {};

  const ugvID = vehicle.ugvID || vehicle._id || '';
  const latitude = Number(vehicle.lat ?? vehicle.latitude ?? statusInfo.latitude ?? latestStatus.latitude);
  const longitude = Number(vehicle.lng ?? vehicle.longitude ?? statusInfo.longitude ?? latestStatus.longitude);
  const battery = toFiniteNumber(vehicle.battery ?? statusInfo.electiricQuantity ?? latestStatus.electiricQuantity);
  const capacity = vehicle.capacity ?? statusInfo.capacity ?? latestStatus.capacity;
  const range = vehicle.range ?? statusInfo.remainingRange ?? latestStatus.remainingRange;

  const businessStatus = typeof vehicle.status === 'string' ? vehicle.status : '';
  const telemetryStatus = statusInfo.status || latestStatus.status || '';
  const runtimeStatus = telemetryStatus || businessStatus;
  const availabilityStatus = getVehicleAvailabilityStatus(businessStatus, runtimeStatus);

  return {
    id: markerId,
    _id: vehicle._id || '',
    ugvID,
    model: normalizeVehicleModel(vehicle.model || statusInfo.model || latestStatus.model),
    range: formatRangeText(range, battery),
    capacity: capacity || DEFAULT_CAPACITY_TEXT,
    runtimeStatus,
    availabilityStatus,
    latitude,
    longitude,
    battery,
    lowBattery: battery !== null && battery < LOW_BATTERY_THRESHOLD
  };
}

function isVehicleSelectable(vehicle) {
  if (!vehicle.ugvID) return false;
  if (!Number.isFinite(vehicle.latitude) || !Number.isFinite(vehicle.longitude)) return false;
  if (vehicle.lowBattery) return false;
  if (vehicle.runtimeStatus === 'faulty') return false;
  if (vehicle.runtimeStatus === 'maintenance') return false;
  if (vehicle.runtimeStatus === 'in_use') return false;
  if (vehicle.availabilityStatus === 'in_use') return false;
  return true;
}

function isVehicleRenderable(vehicle) {
  return Boolean(
    vehicle &&
    vehicle.ugvID &&
    Number.isFinite(vehicle.latitude) &&
    Number.isFinite(vehicle.longitude)
  );
}

Page({
  data: {
    leaving: false,
    mapLatitude: 39.909187,
    mapLongitude: 116.397451,
    mapScale: 14,
    carMarkers: [],
    selectedCar: null,
    carInfoMap: {},
    pickupDisplayText: DEFAULT_PICKUP_TEXT,
    pickupCoordinateText: DEFAULT_PICKUP_COORDINATE_TEXT
  },

  onShareAppMessage() {
    return {};
  },

  onLoad(options) {
    this.initPickupLocation(options);
    this.getUserLocation();
  },

  onShow() {
    this.refreshPickupLocation();
  },

  getUserLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          mapLatitude: res.latitude,
          mapLongitude: res.longitude
        });
        this.loadVehicles();
      },
      fail: () => {
        this.loadVehicles();
      }
    });
  },

  async loadVehicles() {
    const requestOnce = () => callBridge({
      path: '/vehicles/available',
      method: 'GET',
      timeout: 30000
    });

    try {
      let result;
      try {
        result = await requestOnce();
      } catch (firstErr) {
        const message = String((firstErr && (firstErr.errMsg || firstErr.message)) || '');
        if (/timeout/i.test(message)) {
          result = await requestOnce();
        } else {
          throw firstErr;
        }
      }

      console.log('[jiaochejiemian] vehicles/available result:', JSON.stringify(result, null, 2));
      if (!isBridgeSuccess(result)) {
        const message = (result && result.msg) ? `${result.msg}` : 'NOT FOUND';
        console.error('[jiaochejiemian] vehicles/available failed - code:', result?.code, 'msg:', result?.msg);
        wx.showToast({ title: message, icon: 'none', duration: 2500 });
        this.setData({ carMarkers: [], carInfoMap: {}, selectedCar: null });
        return;
      }

      const now = Date.now();
      const normalizedVehicles = (result.data || [])
        .filter((vehicle) => isFreshVehicleDoc(vehicle, VEHICLE_REPORT_STALE_MS, now))
        .map((vehicle, index) => normalizeVehicleDoc(vehicle, index + 1));
      const selectableVehicles = normalizedVehicles.filter(isVehicleSelectable);
      const vehicles = selectableVehicles.length > 0
        ? selectableVehicles
        : normalizedVehicles.filter(isVehicleRenderable);

      if (selectableVehicles.length === 0 && vehicles.length > 0) {
        console.warn('[call-car] server returned vehicles but local filter removed all; fallback to renderable list', normalizedVehicles);
      }

      if (vehicles.length === 0) {
        wx.showToast({ title: '暂无可用车辆', icon: 'none' });
        this.setData({ carMarkers: [], carInfoMap: {}, selectedCar: null });
        return;
      }

      const carInfoMap = vehicles.reduce((acc, vehicle) => {
        acc[vehicle.id] = vehicle;
        return acc;
      }, {});

      const carMarkers = vehicles.map((vehicle) => ({
        id: vehicle.id,
        latitude: vehicle.latitude,
        longitude: vehicle.longitude,
        iconPath: '/pictures/shouye/car.png',
        width: 40,
        height: 40
      }));

      const firstVehicle = vehicles[0];
      this.setData({
        carMarkers,
        carInfoMap,
        selectedCar: firstVehicle,
        mapLatitude: firstVehicle.latitude,
        mapLongitude: firstVehicle.longitude
      });
    } catch (err) {
      console.error('loadVehicles failed', err);
      wx.showToast({
        title: 'NOT FOUND',
        icon: 'none'
      });
      this.setData({ carMarkers: [], carInfoMap: {}, selectedCar: null });
    }
  },

  onMarkerTap(e) {
    this._lastTapFromMarker = true;
    const markerId = e.detail.markerId;
    const markers = this.data.carMarkers.map((marker) => ({
      ...marker,
      width: marker.id === markerId ? 60 : 40,
      height: marker.id === markerId ? 60 : 40
    }));
    const carInfo = this.data.carInfoMap[markerId] || null;
    this.setData({ carMarkers: markers, selectedCar: carInfo });
  },

  onMapTap() {
    if (this._lastTapFromMarker) {
      this._lastTapFromMarker = false;
      return;
    }
    const markers = this.data.carMarkers.map((marker) => ({
      ...marker,
      width: 40,
      height: 40
    }));
    this.setData({ carMarkers: markers, selectedCar: null });
  },

  leaveAndNavigate(url, method = 'redirectTo') {
    if (this.data.leaving) return;
    this.setData({ leaving: true });
    setTimeout(() => {
      if (method === 'reLaunch') {
        wx.reLaunch({ url });
      } else if (method === 'navigateTo') {
        wx.navigateTo({ url });
      } else {
        wx.redirectTo({ url });
      }
    }, 280);
  },

  onClick() {
    this.leaveAndNavigate('/pages/shouye2/shouye2', 'reLaunch');
  },

  onClick_1() {
    this.leaveAndNavigate('/pages/bangzhu_A/bangzhu_A', 'redirectTo');
  },

  onClick_2() {
    const selectedCar = this.data.selectedCar || {};
    const ugvID = selectedCar.ugvID || '';

    if (!ugvID) {
      wx.showToast({ title: '请先选择有效车辆', icon: 'none' });
      return;
    }

    if (selectedCar.lowBattery) {
      wx.showToast({ title: '车辆电量过低', icon: 'none' });
      return;
    }

    this.leaveAndNavigate(
      `/pages/querenyongche1/querenyongche1?ugvID=${encodeURIComponent(ugvID)}`,
      'redirectTo'
    );
  },

  onLocationTap() {
    wx.navigateTo({ url: '/pages/tuijianshangchedian/tuijianshangchedian?from=jiaochejiemian' });
  },

  initPickupLocation(options) {
    const nameFromRoute = options && options.pickupName ? decodeURIComponent(options.pickupName) : '';
    const storedName = wx.getStorageSync('lastPickupLocationName') || '';
    const storedPoint = wx.getStorageSync('lastPickupLocation') || null;
    const finalText = nameFromRoute || storedName || DEFAULT_PICKUP_TEXT;

    if (nameFromRoute) {
      wx.setStorageSync('lastPickupLocationName', nameFromRoute);
    }

    this.setData({
      pickupDisplayText: finalText,
      pickupCoordinateText: formatCoordinateText(
        storedPoint && storedPoint.latitude,
        storedPoint && storedPoint.longitude
      )
    });
  },

  refreshPickupLocation() {
    const storedName = wx.getStorageSync('lastPickupLocationName') || '';
    const storedPoint = wx.getStorageSync('lastPickupLocation') || null;
    const nextData = {
      pickupCoordinateText: formatCoordinateText(
        storedPoint && storedPoint.latitude,
        storedPoint && storedPoint.longitude
      )
    };

    if (storedName && storedName !== this.data.pickupDisplayText) {
      nextData.pickupDisplayText = storedName;
    }

    this.setData(nextData);
  },

  resetPickupLocation() {
    wx.removeStorageSync('lastPickupLocationName');
    wx.removeStorageSync('lastPickupLocation');
    this.setData({
      pickupDisplayText: DEFAULT_PICKUP_TEXT,
      pickupCoordinateText: DEFAULT_PICKUP_COORDINATE_TEXT
    });
  }
});
