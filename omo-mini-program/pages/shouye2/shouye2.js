const { callBridge, isBridgeSuccess } = require('../../utils/bridgeApi');
const VEHICLE_UGV_ID = 'AB101';
const VEHICLE_POLL_INTERVAL_MS = 5000;
const VEHICLE_POLL_MAX_BACKOFF_MS = 30000;
const REALTIME_ERROR_LOG_WINDOW_MS = 15000;
const VEHICLE_REPORT_STALE_MS = 60 * 1000;
const VEHICLE_REPORT_FUTURE_TOLERANCE_MS = 5 * 1000;

const LOW_BATTERY_THRESHOLD = 20;
const DEFAULT_VEHICLE_MODEL = 'oMo_Standard';
const DEFAULT_CAPACITY_TEXT = '2人';
const DEFAULT_FULL_RANGE_KM = 30;
const RESUMABLE_TRIP_STATUS_LABELS = {
  waiting_pickup: '等待接驾',
  active: '订单进行中'
};

function normalizeSuspendedTrip(rawTrip) {
  if (!rawTrip || !rawTrip.tripId) {
    return null;
  }

  const tripStatus = rawTrip.tripStatus || rawTrip.status || '';
  if (tripStatus !== 'waiting_pickup' && tripStatus !== 'active') {
    return null;
  }

  const ugvID = rawTrip.ugvID || rawTrip.vehicleId || '';
  return {
    tripId: String(rawTrip.tripId),
    ugvID: ugvID ? String(ugvID) : '',
    tripStatus
  };
}

function buildSuspendedTripUrl(trip) {
  const normalized = normalizeSuspendedTrip(trip);
  if (!normalized) {
    return '';
  }

  const tripIdPart = encodeURIComponent(normalized.tripId);
  const ugvPart = normalized.ugvID
    ? `&ugvID=${encodeURIComponent(normalized.ugvID)}`
    : '';

  return normalized.tripStatus === 'waiting_pickup'
    ? `/pages/dengdaiquche/dengdaiquche?tripId=${tripIdPart}${ugvPart}`
    : `/pages/jinhangzhong/jinhangzhong?tripId=${tripIdPart}${ugvPart}`;
}

function toFiniteNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeVehicleModel(rawModel) {
  return DEFAULT_VEHICLE_MODEL;
}

function formatRangeText(rangeValue, batteryValue) {
  if (typeof rangeValue === 'string' && rangeValue.trim()) {
    return rangeValue.trim();
  }

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

function getStatusInfo(source) {
  if (source && source.statusInfo && typeof source.statusInfo === 'object') {
    return source.statusInfo;
  }
  return source && source.status && typeof source.status === 'object'
    ? source.status
    : {};
}

function getLatestStatus(source) {
  const latestPayload =
    source && source.latestPayload && typeof source.latestPayload === 'object'
      ? source.latestPayload
      : {};

  return latestPayload && latestPayload.payload && typeof latestPayload.payload === 'object'
    ? latestPayload.payload
    : {};
}

function buildVehicleCardInfo(source, fallback = {}) {
  const statusInfo = getStatusInfo(source);
  const latestStatus = getLatestStatus(source);
  const battery = toFiniteNumber(
    (source && source.battery) ?? statusInfo.electiricQuantity ?? latestStatus.electiricQuantity
  );
  const rangeValue =
    (source && source.range) ?? statusInfo.remainingRange ?? latestStatus.remainingRange ?? fallback.range;

  return {
    model: normalizeVehicleModel(
      (source && source.model) ?? statusInfo.model ?? latestStatus.model ?? fallback.model
    ),
    range: formatRangeText(rangeValue, battery ?? fallback.battery),
    capacity: DEFAULT_CAPACITY_TEXT,
    battery
  };
}

function parseVehicleRealtimeStatus(raw, fallback = {}) {
  const payload = raw && raw.data ? raw.data : raw;
  if (!payload || typeof payload !== 'object') return null;

  const statusInfo = getStatusInfo(payload);
  const latestStatus = getLatestStatus(payload);
  const latitude = toFiniteNumber(payload.lat ?? payload.latitude ?? statusInfo.latitude ?? latestStatus.latitude);
  const longitude = toFiniteNumber(payload.lng ?? payload.longitude ?? statusInfo.longitude ?? latestStatus.longitude);
  const speed = toFiniteNumber(statusInfo.speed ?? latestStatus.speed ?? payload.speed) ?? 0;
  const timestamp = Number(statusInfo.timestamp ?? latestStatus.timestamp ?? payload.updatedAt ?? Date.now());

  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    latitude,
    longitude,
    speed,
    timestamp,
    ...buildVehicleCardInfo(payload, fallback)
  };
}

function computeDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => deg * Math.PI / 180;
  const radLat1 = toRad(lat1);
  const radLat2 = toRad(lat2);
  const deltaLat = radLat2 - radLat1;
  const deltaLng = toRad(lng2 - lng1);
  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
    + Math.cos(radLat1) * Math.cos(radLat2)
    * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371000 * c;
}

function getVehicleFreshness(vehicle) {
  const statusInfo = getStatusInfo(vehicle);
  const latestStatus = getLatestStatus(vehicle);
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

function getVehicleCoordinates(vehicle) {
  const statusInfo = getStatusInfo(vehicle);
  const latestStatus = getLatestStatus(vehicle);
  const latitude = toFiniteNumber(
    vehicle && (vehicle.lat ?? vehicle.latitude ?? statusInfo.latitude ?? latestStatus.latitude)
  );
  const longitude = toFiniteNumber(
    vehicle && (vehicle.lng ?? vehicle.longitude ?? statusInfo.longitude ?? latestStatus.longitude)
  );

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}

function normalizeHomepageVehicleDoc(vehicle) {
  const statusInfo = getStatusInfo(vehicle);
  const latestStatus = getLatestStatus(vehicle);
  const coordinates = getVehicleCoordinates(vehicle);
  const battery = toFiniteNumber(
    vehicle && (vehicle.battery ?? statusInfo.electiricQuantity ?? latestStatus.electiricQuantity)
  );
  const businessStatus = typeof vehicle?.status === 'string' ? vehicle.status : '';
  const telemetryStatus = statusInfo.status || latestStatus.status || '';
  const runtimeStatus = telemetryStatus || businessStatus;
  const availabilityStatus = businessStatus || runtimeStatus;

  return {
    raw: vehicle,
    ugvID: vehicle?.ugvID || vehicle?._id || '',
    latitude: coordinates ? coordinates.latitude : null,
    longitude: coordinates ? coordinates.longitude : null,
    battery,
    lowBattery: battery !== null && battery < LOW_BATTERY_THRESHOLD,
    runtimeStatus,
    availabilityStatus
  };
}

function isHomepageVehicleSelectable(vehicle) {
  if (!vehicle || !vehicle.ugvID) return false;
  if (!Number.isFinite(vehicle.latitude) || !Number.isFinite(vehicle.longitude)) return false;
  if (vehicle.lowBattery) return false;
  if (vehicle.runtimeStatus === 'faulty') return false;
  if (vehicle.runtimeStatus === 'maintenance') return false;
  if (vehicle.runtimeStatus === 'in_use') return false;
  if (vehicle.availabilityStatus === 'in_use') return false;
  return true;
}

function pickHomepageVehicle(vehicles, centerLat, centerLng, preferredUgvID) {
  if (!Array.isArray(vehicles) || vehicles.length === 0) {
    return null;
  }

  const now = Date.now();
  const normalizedVehicles = vehicles
    .map(normalizeHomepageVehicleDoc)
    .filter(isHomepageVehicleSelectable)
    .filter((vehicle) => isFreshVehicleDoc(vehicle.raw, VEHICLE_REPORT_STALE_MS, now));

  const exactVehicle = normalizedVehicles
    .filter((vehicle) => vehicle.ugvID === preferredUgvID)
    .sort((a, b) => getVehicleFreshness(b.raw) - getVehicleFreshness(a.raw))[0];
  if (exactVehicle) {
    return exactVehicle;
  }

  const sortedCandidates = normalizedVehicles
    .map((vehicle) => {
      return {
        ...vehicle,
        distance: computeDistanceMeters(centerLat, centerLng, vehicle.latitude, vehicle.longitude)
      };
    })
    .sort((a, b) => a.distance - b.distance);

  return sortedCandidates[0] || null;
}

Page({
  data: {
    isLoggedIn: false,
    showLoginMask: false,
    loginLoading: false,
    suspendedTrip: null,
    showSuspendedTripEntry: false,
    suspendedTripStatusText: '',
    mapLatitude: 39.909187,
    mapLongitude: 116.397451,
    mapScale: 14,
    carMarkers: [],
    selectedCar: null,
    carInfoMap: {
      1: { id: 1, ugvID: 'OMO_0008', model: DEFAULT_VEHICLE_MODEL, range: '约30km', capacity: DEFAULT_CAPACITY_TEXT }
    },
    trackedUgvID: 'OMO_0008',
    trackedMarkerId: null,
    hasFollowedVehicle: false
  },

  onShareAppMessage() {
    return {};
  },
  onLoad() {
    this.getUserLocation();
  },

  getUserLocation() {
    const that = this;
    wx.getLocation({
      type: 'gcj02',
      success(res) {
        const latitude = res.latitude;
        const longitude = res.longitude;
        that.setData({
          mapLatitude: latitude,
          mapLongitude: longitude
        });
        // Load nearby vehicles after location is ready.
        that.loadVehicles(latitude, longitude);
      },
      fail(err) {
        console.error('获取位置失败', err);
        wx.showToast({
          title: '定位失败，请检查权限',
          icon: 'none'
        });
        // Fallback to default map center.
        that.loadVehicles(that.data.mapLatitude, that.data.mapLongitude);
      }
    });
  },

  loadVehicles(lat, lng) {
    callBridge({
      path: '/vehicles/available',
      method: 'GET',
      timeout: 30000
    }).then((result) => {
      const list = Array.isArray(result && result.data) ? result.data : [];
      if (list.length > 0) {
        const homepageVehicle = pickHomepageVehicle(
          list,
          lat,
          lng,
          this.data.trackedUgvID
        );

        if (!homepageVehicle) {
          wx.showToast({
            title: '暂无可用车辆',
            icon: 'none'
          });
          this.setData({
            carMarkers: [],
            carInfoMap: {},
            selectedCar: null
          });
          return;
        }

        this.applyHomepageVehicle(
          homepageVehicle.raw,
          homepageVehicle.latitude,
          homepageVehicle.longitude
        );
        this.startBlinkTimer();
        return;
      }

      wx.showToast({
        title: '暂无可用车辆',
        icon: 'none'
      });
      this.setData({
        carMarkers: [],
        carInfoMap: {},
        selectedCar: null
      });
    }).catch((err) => {
      console.error('[Bridge] load vehicles failed', err);
      wx.showToast({
        title: '车辆服务超时，请重试',
        icon: 'none'
      });
      this.setData({
        carMarkers: [],
        carInfoMap: {},
        selectedCar: null
      });
    });
  },

  applyHomepageVehicle(rawVehicle, latitude, longitude) {
    const markerId = 1;
    const vehicleCardInfo = buildVehicleCardInfo(rawVehicle, {
      model: DEFAULT_VEHICLE_MODEL,
      range: '约30km'
    });
    const selectedCar = {
      id: markerId,
      _id: rawVehicle._id,
      ugvID: rawVehicle.ugvID || rawVehicle._id || this.data.trackedUgvID,
      model: vehicleCardInfo.model,
      range: vehicleCardInfo.range,
      capacity: vehicleCardInfo.capacity,
      battery: vehicleCardInfo.battery
    };

    this.setData({
      carMarkers: [{
        id: markerId,
        latitude,
        longitude,
        iconPath: '/pictures/shouye/car.png',
        width: 60,
        height: 60,
        label: {
          content: ' ',
          borderRadius: 4,
          padding: 4,
          bgColor: '#FF5A5F',
          display: 'ALWAYS',
          anchorX: -4,
          anchorY: 5
        },
        customCallout: { display: 'BYCLICK' }
      }],
      carInfoMap: { [markerId]: selectedCar },
      selectedCar,
      trackedMarkerId: markerId,
      trackedUgvID: selectedCar.ugvID,
      mapLatitude: latitude,
      mapLongitude: longitude
    });
  },

  getContainerEnv() {
    const app = getApp();
    return app && app.globalData ? app.globalData.cloudEnvId : undefined;
  },

  buildContainerPath(path) {
    const app = getApp();
    return app && typeof app.buildContainerPath === 'function'
      ? app.buildContainerPath(path)
      : path;
  },

  parseVehicleStatus(raw) {
    return parseVehicleRealtimeStatus(raw, {
      model: DEFAULT_VEHICLE_MODEL,
      range: '约30km'
    });
  },

  applyRealtimeVehicleStatus(vehicle) {
    if (!vehicle) return false;

    const markerId = this.data.trackedMarkerId || 101;
    const nextCarInfo = {
      ...(this.data.carInfoMap[markerId] || {}),
      id: markerId,
      ugvID: this.data.trackedUgvID,
      model: vehicle.model || (this.data.carInfoMap[markerId] && this.data.carInfoMap[markerId].model) || DEFAULT_VEHICLE_MODEL,
      range: vehicle.range || (this.data.carInfoMap[markerId] && this.data.carInfoMap[markerId].range) || '约30km',
      capacity: vehicle.capacity || DEFAULT_CAPACITY_TEXT,
      battery: vehicle.battery
    };
    const markers = [{
      id: markerId,
      latitude: vehicle.latitude,
      longitude: vehicle.longitude,
      iconPath: '/pictures/shouye/car.png',
      width: 40,
      height: 40,
      label: {
        content: ' ',
        borderRadius: 4,
        padding: 4,
        bgColor: '#FF5A5F',
        display: 'ALWAYS',
        anchorX: -4,
        anchorY: 5
      },
      customCallout: { display: 'BYCLICK' }
    }];

    const updateData = {
      carMarkers: markers,
      carInfoMap: {
        ...this.data.carInfoMap,
        [markerId]: nextCarInfo
      }
    };

    if (this.data.selectedCar && (this.data.selectedCar.id === markerId || this.data.selectedCar.ugvID === this.data.trackedUgvID)) {
      updateData.selectedCar = {
        ...this.data.selectedCar,
        ...nextCarInfo
      };
    }

    if (!this.data.hasFollowedVehicle) {
      updateData.mapLatitude = vehicle.latitude;
      updateData.mapLongitude = vehicle.longitude;
      updateData.hasFollowedVehicle = true;
    }

    this.setData(updateData);

    return true;
  },

  fetchRealtimeVehicleStatusFromDatabase() {
    return Promise.resolve(false);
  },
  startVehicleStatusPolling() {
    this.stopVehicleStatusPolling();
    this._vehiclePollingActive = true;
    this._vehicleStatusBackoffMs = VEHICLE_POLL_INTERVAL_MS;
    this._vehicleStatusConsecutiveTimeouts = 0;
    this.scheduleNextVehicleStatusPoll(0);
  },

  scheduleNextVehicleStatusPoll(delayMs = VEHICLE_POLL_INTERVAL_MS) {
    if (!this._vehiclePollingActive) {
      return;
    }
    if (this._vehicleStatusTimer) {
      clearTimeout(this._vehicleStatusTimer);
      this._vehicleStatusTimer = null;
    }
    this._vehicleStatusTimer = setTimeout(() => {
      this.fetchRealtimeVehicleStatus();
    }, Math.max(0, Number(delayMs) || VEHICLE_POLL_INTERVAL_MS));
  },

  stopVehicleStatusPolling() {
    this._vehiclePollingActive = false;
    if (this._vehicleStatusTimer) {
      clearTimeout(this._vehicleStatusTimer);
      this._vehicleStatusTimer = null;
    }
    this._vehicleStatusRequesting = false;
  },

  isVehicleStatusTimeoutError(err) {
    const message = String((err && (err.errMsg || err.message)) || '');
    const code = Number(err && (err.errCode || err.code));
    return code === 102002 || message.includes('102002') || message.includes('请求超时') || /timeout/i.test(message);
  },

  logRealtimeErrorWithThrottle(tag, err) {
    const now = Date.now();
    const key = String(tag || 'unknown');
    const lastMap = this._realtimeErrorLogAtMap || {};
    const lastAt = Number(lastMap[key] || 0);
    if (now - lastAt < REALTIME_ERROR_LOG_WINDOW_MS) {
      return;
    }
    this._realtimeErrorLogAtMap = {
      ...lastMap,
      [key]: now
    };
    console.warn(tag, err);
  },

  fetchRealtimeVehicleStatus() {
    if (this._vehicleStatusRequesting) {
      return;
    }

    this._vehicleStatusRequesting = true;

    callBridge({
      path: '/vehicleStatus',
      method: 'GET',
      data: {
        ugvID: this.data.trackedUgvID
      }
    }).then((result) => {
      const payload = result && result.data ? result.data : result;
      if (!isFreshVehicleDoc(payload)) {
        throw new Error('vehicle status stale');
      }
      const vehicle = this.parseVehicleStatus(payload);
      if (!vehicle || !isFreshVehicleTimestamp(Number(vehicle.timestamp))) {
        throw new Error('vehicle status stale');
      }
      this.applyRealtimeVehicleStatus(vehicle);
      this._vehicleStatusConsecutiveTimeouts = 0;
      this._vehicleStatusBackoffMs = VEHICLE_POLL_INTERVAL_MS;
    }).catch((err) => {
      const isTimeout = this.isVehicleStatusTimeoutError(err);
      if (isTimeout) {
        this._vehicleStatusConsecutiveTimeouts = Number(this._vehicleStatusConsecutiveTimeouts || 0) + 1;
        const retryScale = Math.pow(2, Math.min(this._vehicleStatusConsecutiveTimeouts, 4));
        this._vehicleStatusBackoffMs = Math.min(
          VEHICLE_POLL_INTERVAL_MS * retryScale,
          VEHICLE_POLL_MAX_BACKOFF_MS
        );
        this.logRealtimeErrorWithThrottle(
          `[Realtime] fetch vehicle status timeout, auto retry in ${this._vehicleStatusBackoffMs}ms`,
          err
        );
      } else {
        this._vehicleStatusConsecutiveTimeouts = 0;
        this._vehicleStatusBackoffMs = VEHICLE_POLL_INTERVAL_MS;
        this.logRealtimeErrorWithThrottle('[Realtime] fetch vehicle status failed', err);
      }

      this.setData({
        carMarkers: [],
        carInfoMap: {},
        selectedCar: null
      });
    }).finally(() => {
      this._vehicleStatusRequesting = false;
      this.scheduleNextVehicleStatusPoll(this._vehicleStatusBackoffMs || VEHICLE_POLL_INTERVAL_MS);
    });
  },

  generateMarkers(centerLat, centerLng) {
    const iconPath = '/pictures/shouye/car.png';
    const markerId = 1;
    const markers = [{
      id: markerId,
      latitude: centerLat,
      longitude: centerLng,
      iconPath,
      width: 60,
      height: 60,
      label: {
        content: ' ',
        borderRadius: 4,
        padding: 4,
        bgColor: '#FF5A5F',
        display: 'ALWAYS',
        anchorX: -4,
        anchorY: 5,
      },
      customCallout: { display: 'BYCLICK' }
    }];

    const selectedCar = {
      id: markerId,
      ugvID: this.data.trackedUgvID || 'OMO_0008',
      model: DEFAULT_VEHICLE_MODEL,
      range: '约30km',
      capacity: DEFAULT_CAPACITY_TEXT
    };

    this.setData({
      carMarkers: markers,
      carInfoMap: { [markerId]: selectedCar },
      selectedCar,
      trackedMarkerId: markerId,
      trackedUgvID: selectedCar.ugvID
    });
    this.startBlinkTimer();
  },

  onUnload() {
    if (this._blinkTimer) {
      clearInterval(this._blinkTimer);
    }
    this._vehicleStatusRequesting = false;
    this.stopVehicleStatusPolling();
  },

  onHide() {
    this._vehicleStatusRequesting = false;
    this.stopVehicleStatusPolling();
  },

  startBlinkTimer() {
    if (this._blinkTimer) {
      clearInterval(this._blinkTimer);
    }
    let isDim = false;
    this._blinkTimer = setInterval(() => {
      isDim = !isDim;
      const color = isDim ? '#FF5A5F66' : '#FF5A5F';
      const markers = this.data.carMarkers.map((m) => {
        return {
          ...m,
          label: {
            ...m.label,
            bgColor: color
          }
        };
      });
      this.setData({ carMarkers: markers });
    }, 600);
  },

  onMarkerTap(e) {
    this._lastTapFromMarker = true;
    const markerId = e.detail.markerId;
    const markers = this.data.carMarkers.map(m => {
      if (m.id === markerId) {
        return { ...m, width: 60, height: 60 };
      } else {
        return { ...m, width: 40, height: 40 };
      }
    });
    const carInfo = this.data.carInfoMap[markerId] || null;
    const nextTrackedUgvID = (carInfo && (carInfo.ugvID || carInfo._id)) || this.data.trackedUgvID;
    this.setData({
      carMarkers: markers,
      selectedCar: carInfo,
      trackedMarkerId: markerId,
      trackedUgvID: nextTrackedUgvID
    });
    this.fetchRealtimeVehicleStatus();
  },
  onMapTap() {
    if (this._lastTapFromMarker) {
      this._lastTapFromMarker = false;
      return;
    }
    const markers = this.data.carMarkers.map(m => {
      return { ...m, width: 40, height: 40 };
    });
    this.setData({ carMarkers: markers, selectedCar: null });
  },

  onScanCode() {
    const app = getApp();
    if (!app.isLoggedIn()) {
      this.setData({ showLoginMask: true });
      return;
    }
    
    // Navigate to manual input / scan page.
    wx.navigateTo({ url: '/pages/shoudongshuru/shoudongshuru' });
  },

  unlockVehicle(vehicleId) {
    wx.showLoading({ title: '正在开锁...' });

    callBridge({
      path: '/trip/unlock',
      method: 'POST',
      data: { ugvID: vehicleId }
    }).then((result) => {
      wx.hideLoading();
      if (isBridgeSuccess(result)) {
        wx.showToast({ title: '开锁成功', icon: 'success' });
        return;
      }

      wx.showModal({
        title: '开锁失败',
        content: (result && result.msg) || '未知错误',
      });
    }).catch((err) => {
      wx.hideLoading();
      console.error('trip/unlock failed', err);
      wx.showToast({ title: '网络异常', icon: 'none' });
    });
  },

  onShow() {
    const app = getApp();
    const isLoggedIn = app.isLoggedIn();
    this.setData({ isLoggedIn });

    this.startVehicleStatusPolling();

    if (!isLoggedIn) {
      this.clearSuspendedTripEntry();
      return;
    }

    this.refreshSuspendedTrip();
  },

  getStoredSuspendedTrip() {
    try {
      return normalizeSuspendedTrip(wx.getStorageSync('currentTripInfo'));
    } catch (error) {
      console.warn('read currentTripInfo failed', error);
      return null;
    }
  },

  syncSuspendedTripToStorage(trip) {
    const normalizedTrip = normalizeSuspendedTrip(trip);
    if (!normalizedTrip) {
      return;
    }

    try {
      const currentTripInfo = wx.getStorageSync('currentTripInfo') || {};
      wx.setStorageSync('currentTripInfo', {
        ...currentTripInfo,
        tripId: normalizedTrip.tripId,
        ugvID: normalizedTrip.ugvID || currentTripInfo.ugvID || currentTripInfo.vehicleId || '',
        vehicleId: normalizedTrip.ugvID || currentTripInfo.vehicleId || currentTripInfo.ugvID || '',
        tripStatus: normalizedTrip.tripStatus
      });
    } catch (error) {
      console.warn('sync currentTripInfo failed', error);
    }
  },

  setSuspendedTripEntry(trip, { syncStorage = false } = {}) {
    const normalizedTrip = normalizeSuspendedTrip(trip);
    if (!normalizedTrip) {
      this.clearSuspendedTripEntry();
      return;
    }

    if (syncStorage) {
      this.syncSuspendedTripToStorage(normalizedTrip);
    }

    this.setData({
      suspendedTrip: normalizedTrip,
      showSuspendedTripEntry: true,
      suspendedTripStatusText: RESUMABLE_TRIP_STATUS_LABELS[normalizedTrip.tripStatus] || '订单进行中'
    });
  },

  clearSuspendedTripEntry({ clearStorage = false } = {}) {
    this.setData({
      suspendedTrip: null,
      showSuspendedTripEntry: false,
      suspendedTripStatusText: ''
    });

    if (!clearStorage) {
      return;
    }

    try {
      wx.removeStorageSync('currentTripInfo');
    } catch (error) {
      console.warn('clear currentTripInfo failed', error);
    }
  },

  refreshSuspendedTrip() {
    callBridge({
      path: '/trip/active',
      method: 'GET'
    }).then((result) => {
      const serverTrip = normalizeSuspendedTrip(result && result.data ? result.data : null);
      if (serverTrip) {
        this.setSuspendedTripEntry(serverTrip, { syncStorage: true });
        return;
      }

      this.clearSuspendedTripEntry({ clearStorage: true });
    }).catch((err) => {
      console.warn('refresh suspended trip failed', err);
      const fallbackTrip = this.getStoredSuspendedTrip();
      if (fallbackTrip) {
        this.setSuspendedTripEntry(fallbackTrip);
        return;
      }
      this.clearSuspendedTripEntry();
    });
  },

  onResumeSuspendedTripTap() {
    const enterTrip = (trip) => {
      const url = buildSuspendedTripUrl(trip);
      if (!url) {
        return false;
      }
      wx.reLaunch({ url });
      return true;
    };

    if (enterTrip(this.data.suspendedTrip)) {
      return;
    }

    wx.showLoading({ title: '正在定位订单...' });
    callBridge({
      path: '/trip/active',
      method: 'GET'
    }).then((result) => {
      const serverTrip = normalizeSuspendedTrip(result && result.data ? result.data : null);
      if (serverTrip && enterTrip(serverTrip)) {
        this.setSuspendedTripEntry(serverTrip, { syncStorage: true });
        return;
      }

      this.clearSuspendedTripEntry({ clearStorage: true });
      wx.showToast({ title: '未找到进行中订单', icon: 'none' });
    }).catch((err) => {
      console.warn('resume suspended trip failed', err);
      const fallbackTrip = this.getStoredSuspendedTrip();
      if (fallbackTrip && enterTrip(fallbackTrip)) {
        this.setSuspendedTripEntry(fallbackTrip);
        return;
      }
      this.clearSuspendedTripEntry();
      wx.showToast({ title: '未找到进行中订单', icon: 'none' });
    }).finally(() => {
      wx.hideLoading();
    });
  },

  checkActiveTrip() {
    callBridge({
      path: '/trip/active',
      method: 'GET'
    }).then((result) => {
      const trip = result && result.data ? result.data : null;
      if (trip && trip.tripId) {
        const tripStatus = trip.status || 'active';
        const nextPage = tripStatus === 'waiting_pickup'
          ? `/pages/dengdaiquche/dengdaiquche?tripId=${trip.tripId}&ugvID=${trip.ugvID || trip.vehicleId || 'AB101'}`
          : `/pages/jinhangzhong/jinhangzhong?tripId=${trip.tripId}&ugvID=${trip.ugvID || trip.vehicleId || 'AB101'}`;
        if (tripStatus === 'waiting_pickup') {
          wx.showModal({
            title: '行程恢复',
            content: '您有待上车订单，可以继续等待，也可以直接取消订单。',
            showCancel: true,
            cancelText: '取消订单',
            confirmText: '继续等待',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.reLaunch({ url: nextPage });
                return;
              }

              if (modalRes.cancel) {
                this.cancelWaitingTripFromHome(trip);
              }
            }
          });
          return;
        }

        wx.showModal({
          title: '行程恢复',
          content: '您有正在进行的行程，是否继续？',
          showCancel: false,
          confirmText: '继续行程',
          success: () => {
            wx.reLaunch({ url: nextPage });
          }
        });
      }
    }).catch((err) => {
      console.error('check active trip failed', err);
    });
  },
  cancelWaitingTripFromHome(trip) {
    if (!trip || !trip.tripId) {
      wx.showToast({ title: '订单信息缺失', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在取消...', mask: true });
    callBridge({
      path: '/trip/cancel',
      method: 'POST',
      data: { tripId: trip.tripId }
    }).then((result) => {
      wx.hideLoading();
      if (!isBridgeSuccess(result)) {
        wx.showToast({
          title: (result && result.msg) || '取消失败',
          icon: 'none'
        });
        return;
      }

      wx.removeStorageSync('currentTripInfo');
      wx.showToast({
        title: '订单已取消',
        icon: 'success'
      });
    }).catch((err) => {
      wx.hideLoading();
      console.error('cancelWaitingTrip from home failed', err);
      wx.showToast({
        title: '取消失败，请重试',
        icon: 'none'
      });
    });
  },
  onFirstTapAnywhere() {
    const app = getApp();
    if (app.isLoggedIn()) return;
    if (this.data.showLoginMask) return;
    this.setData({ showLoginMask: true, loginLoading: false });
  },
  onRequireLoginTap() {
    const app = getApp();
    if (app.isLoggedIn()) return;
    if (this.data.loginLoading) return;
    this.setData({ loginLoading: true });
    wx.showLoading({ title: '正在进入登录...', mask: true });
    setTimeout(() => {
      wx.redirectTo({ url: '/pages/dengluyemian/dengluyemian' });
      wx.hideLoading();
    }, 1000);
  },
  onClick() {
    const app = getApp();
    if (!app.isLoggedIn()) {
      this.onFirstTapAnywhere();
      return;
    }
    wx.redirectTo({ url: '/pages/shoudongshuru/shoudongshuru' });
  },
  onClick_1() {
    const app = getApp();
    if (!app.isLoggedIn()) {
      this.onFirstTapAnywhere();
      return;
    }
    wx.redirectTo({ url: '/pages/jiaochejiemian/jiaochejiemian' });
  },
  onClick_2() {
    const app = getApp();
    if (!app.isLoggedIn()) {
      this.onFirstTapAnywhere();
      return;
    }
    wx.redirectTo({ url: '/pages/wode/wode' });
  }
});

























