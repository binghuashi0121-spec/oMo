const VEHICLE_UGV_ID = 'OMO_0008';
const VEHICLE_POLL_INTERVAL_MS = 5000;
const {
  buildModeCommand
} = require('../../utils/vehicleControl');
const { callBridge, isBridgeSuccess } = require('../../utils/bridgeApi');

const DEFAULT_CAPACITY_TEXT = '2人';
const DEFAULT_FULL_RANGE_KM = 30;
const DEPOSIT_AMOUNT = 200;

function formatRangeText(rangeValue, batteryValue) {
  if (typeof rangeValue === 'string' && rangeValue.trim()) {
    return rangeValue.trim();
  }

  if (Number.isFinite(Number(rangeValue))) {
    return `约${Math.max(0, Math.round(Number(rangeValue)))}km`;
  }

  const battery = Number(batteryValue);
  if (Number.isFinite(battery)) {
    const estimatedRangeKm = Math.max(0, Math.round((battery / 100) * DEFAULT_FULL_RANGE_KM));
    return `约${estimatedRangeKm}km`;
  }

  return '未知';
}

Page({
  data: {
    loaded: false,
    
    totalFee: '0.00',
    totalDistance: '0.00',
    tripDurationStr: '00:00:00',
    
    isTempParking: false,
    parkingStartTime: 0,
    parkingDurationStr: '00:00:00',
    parkingTimer: null,
    
    // Fee related fields
    baseTimeFee: 0,
    distanceFee: 0,
    accumulatedParkingFee: 0, // Accumulated parking fee (without current session)
    currentParkingSessionFee: 0, // Current parking session fee
    showEndTripModal: false,
    showSafetyPopup: false,
    isLoading: false,

    mapLatitude: 39.909187,
    mapLongitude: 116.397451,
    mapScale: 14,
    carMarkers: [],
    trackPoints: [],
    trackPolyline: [],
    travelDistanceMeters: 0,
    isTracking: false,
    lastUpdateTime: 0,
    locationErrorCount: 0,
    tripStartTime: 0,
    tripTimer: null,
    trackedUgvID: VEHICLE_UGV_ID,
    hasFollowedVehicle: false,
    currentVehicleLatitude: null,
    currentVehicleLongitude: null,
    vehicleSerialText: VEHICLE_UGV_ID,
    vehicleRangeText: '约30km',
    vehicleCapacityText: DEFAULT_CAPACITY_TEXT,
    batteryText: '--'
  },

  onLoad(options) {
    if (options && options.tripId) {
      this.setData({ tripId: options.tripId });
    } else {
      // Try to restore tripId from local storage
      const currentTrip = wx.getStorageSync('currentTripInfo');
      if (currentTrip && currentTrip.tripId) {
        this.setData({ tripId: currentTrip.tripId });
      }
    }
    
    const routeUgvID = options && options.ugvID ? options.ugvID : '';
    const routeStartTime = options && options.startTime ? Number(options.startTime) : 0;
    const currentTripInfo = wx.getStorageSync('currentTripInfo');
    const restoredUgvID = routeUgvID ||
      (currentTripInfo && (currentTripInfo.ugvID || currentTripInfo.vehicleId)
        ? (currentTripInfo.ugvID || currentTripInfo.vehicleId)
        : '');
    if (restoredUgvID) {
      this.setData({
        trackedUgvID: restoredUgvID,
        vehicleSerialText: restoredUgvID
      });
    }
    // Restore tripId when available
    if (!this.data.tripId) {
      this.fetchActiveTrip();
    } else {
      // Load runtimeId
      this.fetchTripRuntimeId();
    }

    setTimeout(() => {
      this.setData({ loaded: true });
    }, 100);

    this.restoreParkingState();

    this.initMap();

    const tripInfo = wx.getStorageSync('currentTripInfo');
    const now = Date.now();
    const tripStartTime = routeStartTime || ((tripInfo && tripInfo.startTime) ? Number(tripInfo.startTime) : 0) || now;
    this.setData({
      tripStartTime,
      tripDurationStr: '00:00:00'
    });
    this.startTripTimer();

    // Start periodic data sync timer (every 15s)
    this.startDataSyncTimer();

    // Put vehicle into manual driving mode for in-trip use.
    this.activateManualDrivingMode();
  },

  fetchActiveTrip() {
    console.log('Checking active trip...');
    callBridge({
      path: '/trip/active',
      method: 'GET'
    }).then((result) => {
      const trip = result && result.data ? result.data : null;
      if (trip) {
        const tripStatus = trip.status || 'active';
        if (tripStatus === 'waiting_pickup') {
          wx.reLaunch({
            url: `/pages/dengdaiquche/dengdaiquche?tripId=${trip.tripId}&ugvID=${trip.ugvID || trip.vehicleId || 'OMO_0008'}`
          });
          return;
        }
        this.setData({
          tripId: trip.tripId,
          runtimeId: trip.runtimeId
        });
        console.log('Active trip restored, tripId:', this.data.tripId, 'runtimeId:', this.data.runtimeId);
      }
    }).catch((err) => {
      console.error('checkActiveTrip failed', err);
    });
  },

  fetchTripRuntimeId() {
    if (!this.data.tripId) {
      return;
    }

    console.log('Loading runtimeId, tripId:', this.data.tripId);
    callBridge({
      path: '/trip/detail',
      method: 'GET',
      data: { tripId: this.data.tripId }
    }).then((result) => {
      if (!isBridgeSuccess(result)) {
        throw new Error((result && result.msg) || 'trip detail failed');
      }

      const payload = result && result.data ? result.data : {};
      const trip = payload.trip || {};
      const runtime = payload.runtime || null;
      const runtimeId = trip.runtimeId || '';
      if (!runtimeId) {
        console.warn('runtimeId not found in trips record');
        return;
      }

      const serverMeters = Number(runtime && runtime.distanceMetersRaw) || 0;
      this.setData({
        runtimeId,
        travelDistanceMeters: serverMeters,
        lastSyncedDistanceMeters: serverMeters,
        totalDistance: (serverMeters / 1000).toFixed(2)
      });
      console.log('runtimeId set:', runtimeId);
    }).catch((err) => {
      console.error('Failed to load trip detail:', err);
    });
  },

  startDataSyncTimer() {
    if (this._syncTimer) clearInterval(this._syncTimer);
    this._syncTimer = setInterval(() => {
        this.syncTripData();
    }, 15000);
  },

  syncTripData() {
    if (!this.data.runtimeId) {
      console.warn('syncTripData skipped: no runtimeId');
      if (this.data.tripId) this.fetchTripRuntimeId();
      return;
    }

    const location = {
      lat: this.data.currentVehicleLatitude ?? this.data.mapLatitude,
      lng: this.data.currentVehicleLongitude ?? this.data.mapLongitude
    };

    const currentMeters = this.data.travelDistanceMeters || 0;
    const lastSynced = this.data.lastSyncedDistanceMeters || 0;
    let distanceInc = currentMeters - lastSynced;
    if (distanceInc < 0) distanceInc = 0;

    console.log(`sync runtime data: runtimeId=${this.data.runtimeId}, inc=${distanceInc}, current=${currentMeters}`);

    callBridge({
      path: '/trip/runtime',
      method: 'POST',
      data: {
        runtimeId: this.data.runtimeId,
        distanceIncrement: distanceInc,
        location
      }
    }).then((result) => {
      if (!isBridgeSuccess(result)) {
        throw new Error((result && result.msg) || 'sync failed');
      }
      this.setData({
        lastSyncedDistanceMeters: currentMeters
      });
    }).catch((err) => {
      console.error('Data sync failed', err);
    });
  },

  onUnload() {
    if (this.data.parkingTimer) {
      clearInterval(this.data.parkingTimer);
    }
    if (this._locationTimer) {
      clearInterval(this._locationTimer);
      this._locationTimer = null;
    }
    if (this.data.tripTimer) {
      clearInterval(this.data.tripTimer);
    }
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }
    this._vehicleStatusRequesting = false;
  },

  onShow() {
    this.syncVehicleModeState();
    if (this.data.isTracking && !this._locationTimer) {
      this._locationTimer = setInterval(() => {
        this.updateLocation();
      }, VEHICLE_POLL_INTERVAL_MS);
      this.updateLocation();
    }
  },

  onHide() {
    if (this._locationTimer) {
      clearInterval(this._locationTimer);
      this._locationTimer = null;
    }
    this._vehicleStatusRequesting = false;
  },

  onShareAppMessage() {
    return {};
  },

  // Navigation Handlers
  onClick() {
    const currentTripInfo = wx.getStorageSync('currentTripInfo') || {};
    const tripId = this.data.tripId || currentTripInfo.tripId || '';
    const ugvID = this.data.trackedUgvID || currentTripInfo.ugvID || currentTripInfo.vehicleId || '';
    if (tripId) {
      wx.setStorageSync('currentTripInfo', {
        ...currentTripInfo,
        tripId,
        runtimeId: this.data.runtimeId || currentTripInfo.runtimeId || '',
        ugvID,
        vehicleId: ugvID || currentTripInfo.vehicleId || '',
        tripStatus: 'active',
        startTime: this.data.tripStartTime || currentTripInfo.startTime || Date.now()
      });
    }
    wx.reLaunch({ url: '/pages/shouye2/shouye2' });
  },
  onClick_1() {
    wx.navigateTo({ url: '/pages/bangzhu_F/bangzhu_F' });
  },
  onCallHelp() {
    wx.makePhoneCall({
      phoneNumber: '13962243668'
    });
  },

  restoreParkingState() {
    const parkingState = wx.getStorageSync('tempParkingState');
    if (parkingState && parkingState.isParking) {
      const now = Date.now();
      const startTime = parkingState.startTime;
      this.setData({
        isTempParking: true,
        parkingStartTime: startTime
      });
      this.startParkingTimer();
    }
  },

  onTempParkingChange(e) {
    const isParking = e.detail.value;
    const now = Date.now();

    if (isParking) {
      // Start Parking
      this.setData({
        isTempParking: true,
        parkingStartTime: now,
        currentParkingSessionFee: 0
      });
      wx.setStorageSync('tempParkingState', { isParking: true, startTime: now });
      this.startParkingTimer();

      this.enterParkingLockMode();
      this.reportParkingAction('start');

    } else {
      // Stop Parking
      const finishedSessionFee = this.data.currentParkingSessionFee;
      
      this.setData({ 
        isTempParking: false,
        accumulatedParkingFee: this.data.accumulatedParkingFee + finishedSessionFee,
        currentParkingSessionFee: 0
      });
      
      if (this.data.parkingTimer) {
        clearInterval(this.data.parkingTimer);
      }
      wx.removeStorageSync('tempParkingState');

      this.resumeManualDrivingMode();
      this.reportParkingAction('end');
    }
  },

  reportParkingAction(action) {
    if (!this.data.runtimeId) return;

    callBridge({
      path: '/trip/runtime',
      method: 'POST',
      data: {
        runtimeId: this.data.runtimeId,
        parkingAction: action
      }
    }).then((result) => {
      if (!isBridgeSuccess(result)) {
        throw new Error((result && result.msg) || 'parking action failed');
      }
      console.log(`Parking status update (${action}) success`);
    }).catch((err) => {
      console.error(`Parking status update (${action}) failed`, err);
    });
  },

  startParkingTimer() {
    if (this.data.parkingTimer) clearInterval(this.data.parkingTimer);

    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.floor((now - this.data.parkingStartTime) / 1000);
      
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      
      this.setData({ parkingDurationStr: `${h}:${m}:${s}` });
    };

    updateTimer(); // Immediate update
    const timer = setInterval(updateTimer, 1000);
    this.setData({ parkingTimer: timer });
  },

  startTripTimer() {
    if (this.data.tripTimer) clearInterval(this.data.tripTimer);

    const updateTrip = () => {
      const now = Date.now();
      const diff = Math.floor((now - this.data.tripStartTime) / 1000);

      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');

      this.setData({ tripDurationStr: `${h}:${m}:${s}` });
      
      // Recalculate fee in real time
      this.calculateTotalFee();
    };

    updateTrip();
    const timer = setInterval(updateTrip, 1000);
    this.setData({ tripTimer: timer });
  },

  calculateTotalFee() {
    // 1. Time fee (0.5 RMB per minute)
    const now = Date.now();
    const durationMs = now - this.data.tripStartTime;
    const durationMinutes = Math.ceil(durationMs / 1000 / 60);
    const timeFee = durationMinutes * 0.5;

    // 2. Distance fee: 10 RMB for first 1.5km, then 5 RMB per extra km
    const distanceKm = parseFloat(this.data.totalDistance) || 0;
    let distanceFee = 0;
    
    if (distanceKm <= 1.5) {
      distanceFee = 10;
    } else {
      // Distance beyond 1.5km
      const extraDistance = distanceKm - 1.5;
      // Round up
      const extraUnits = Math.ceil(extraDistance);
      distanceFee = 10 + (extraUnits * 5);
    }

    // 3. Parking fee: first 5 minutes free, then 8 RMB per 5 minutes
    let currentSessionFee = 0;
    if (this.data.isTempParking) {
      const parkingDurationMs = now - this.data.parkingStartTime;
      const parkingMinutes = Math.ceil(parkingDurationMs / 1000 / 60);
      
      if (parkingMinutes > 5) {
        // Charge 8 RMB per 5 minutes after free period
        currentSessionFee = Math.ceil((parkingMinutes - 5) / 5) * 8;
      }
    }

    const totalParkingFee = this.data.accumulatedParkingFee + currentSessionFee;
    let total = timeFee + distanceFee + totalParkingFee;
    
    this.setData({
      baseTimeFee: timeFee,
      distanceFee: distanceFee,
      currentParkingSessionFee: currentSessionFee,
      totalFee: total.toFixed(2) // Display realtime total
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

  buildContainerHeaders(header = {}) {
    const app = getApp();
    return app && typeof app.buildContainerHeaders === 'function'
      ? app.buildContainerHeaders(header)
      : { ...header };
  },

  sendVehicleCommand(messageType, command, onDone) {
    if (!this.data.trackedUgvID || !wx.cloud || !wx.cloud.callContainer) {
      if (typeof onDone === 'function') onDone(false);
      return;
    }

    wx.cloud.callContainer({
      config: { env: this.getContainerEnv() },
      path: this.buildContainerPath('/sendCommand'),
      method: 'POST',
      header: this.buildContainerHeaders({
        'content-type': 'application/json'
      }),
      data: {
        ugvID: this.data.trackedUgvID,
        messageType,
        command
      },
      success: () => {
        if (typeof onDone === 'function') onDone(true);
      },
      fail: (err) => {
        console.warn('[MQTT] send command failed', { messageType, command, err });
        if (typeof onDone === 'function') onDone(false);
      }
    });
  },

  enterParkingLockMode(onDone) {
    const ugvID = this.data.trackedUgvID;
    if (!ugvID) {
      if (typeof onDone === 'function') onDone(false);
      return;
    }

    this.sendVehicleCommand(
      'ugvSetMode',
      buildModeCommand(ugvID, 0),
      (modeOk) => {
        if (typeof onDone === 'function') onDone(!!modeOk);
      }
    );
  },

  resumeManualDrivingMode(onDone) {
    const ugvID = this.data.trackedUgvID;
    if (!ugvID) {
      if (typeof onDone === 'function') onDone(false);
      return;
    }

    this.sendVehicleCommand(
      'ugvSetMode',
      buildModeCommand(ugvID, 3),
      (modeOk) => {
        if (typeof onDone === 'function') onDone(!!modeOk);
      }
    );
  },

  activateManualDrivingMode() {
    if (this.data.isTempParking) {
      this.enterParkingLockMode();
      return;
    }

    this.resumeManualDrivingMode();
  },

  syncVehicleModeState() {
    if (this.data.isTempParking) {
      this.enterParkingLockMode();
      return;
    }
    this.resumeManualDrivingMode();
  },

  parseVehicleStatus(raw) {
    const payload = raw && raw.data ? raw.data : raw;
    if (!payload || typeof payload !== 'object') return null;

    const status =
      payload.statusInfo && typeof payload.statusInfo === 'object'
        ? payload.statusInfo
        : payload.status && typeof payload.status === 'object'
          ? payload.status
          : {};
    const nested = payload.latestPayload && payload.latestPayload.payload ? payload.latestPayload.payload : {};

    const latitude = Number(status.latitude ?? nested.latitude);
    const longitude = Number(status.longitude ?? nested.longitude);
    const speed = Number(status.speed ?? nested.speed ?? 0);
    const timestamp = Number(status.timestamp ?? nested.timestamp ?? payload.updatedAt ?? Date.now());
    const batteryValue = payload.battery ?? status.electiricQuantity ?? nested.electiricQuantity;
    const rangeValue = payload.range ?? status.remainingRange ?? nested.remainingRange;
    const battery = Number(batteryValue);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return {
      latitude,
      longitude,
      speed,
      timestamp,
      battery: Number.isFinite(battery) ? battery : null,
      batteryText: Number.isFinite(battery) ? `${Math.round(battery)}%` : '--',
      rangeText: formatRangeText(rangeValue, batteryValue),
      serialText: payload.ugvID || payload.vehicleId || nested.ugvID || this.data.trackedUgvID,
      capacityText: DEFAULT_CAPACITY_TEXT
    };
  },

  initMap() {
    this.startTripTracking(this.data.mapLatitude, this.data.mapLongitude);
  },

  startTripTracking(latitude, longitude) {
    if (this._locationTimer) {
      clearInterval(this._locationTimer);
    }

    const now = Date.now();

    this.setData({
      carMarkers: [],
      trackPoints: [],
      trackPolyline: [],
      isTracking: true,
      lastUpdateTime: now,
      locationErrorCount: 0,
      travelDistanceMeters: 0,
      lastSyncedDistanceMeters: 0,
      totalDistance: '0.00'
    });

    this.updateLocation();
    this._locationTimer = setInterval(() => {
      this.updateLocation();
    }, VEHICLE_POLL_INTERVAL_MS);
  },

  updateLocation() {
    if (!this.data.isTracking) {
      return;
    }

    if (!wx.cloud || !wx.cloud.callContainer) {
      return;
    }
    if (this._vehicleStatusRequesting) {
      return;
    }

    this._vehicleStatusRequesting = true;

    wx.cloud.callContainer({
      config: { env: this.getContainerEnv() },
      path: this.buildContainerPath('/vehicleStatus'),
      method: 'GET',
      header: this.buildContainerHeaders(),
      data: {
        ugvID: this.data.trackedUgvID
      },
      success: (res) => {
        const vehicle = this.parseVehicleStatus(res.data);
        if (!vehicle) {
          return;
        }

        const point = { latitude: vehicle.latitude, longitude: vehicle.longitude };
        const previousPoints = Array.isArray(this.data.trackPoints) ? this.data.trackPoints : [];
        const points = previousPoints.concat(point);
        const maxPoints = 1800;
        const trimmedPoints = points.length > maxPoints ? points.slice(points.length - maxPoints) : points;

        let addedDistance = 0;
        if (previousPoints.length > 0 && !this.data.isTempParking) {
          const lastPoint = previousPoints[previousPoints.length - 1];
          addedDistance = this.computeDistance(
            lastPoint.latitude,
            lastPoint.longitude,
            vehicle.latitude,
            vehicle.longitude
          );
        }

        const newTravelDistance = this.data.travelDistanceMeters + addedDistance;
        const totalDistanceKm = (newTravelDistance / 1000).toFixed(2);
        const nextTrackPolyline = trimmedPoints.length >= 2
          ? [{
            points: trimmedPoints,
            color: '#ef5b24',
            width: 4,
            dottedLine: false
          }]
          : [];

        const marker = {
          id: 1,
          latitude: vehicle.latitude,
          longitude: vehicle.longitude,
          iconPath: '/pictures/shouye/car.png',
          width: 32,
          height: 32
        };

        const updateData = {
          carMarkers: [marker],
          trackPoints: trimmedPoints,
          trackPolyline: nextTrackPolyline,
          lastUpdateTime: vehicle.timestamp,
          locationErrorCount: 0,
          travelDistanceMeters: newTravelDistance,
          totalDistance: totalDistanceKm,
          currentVehicleLatitude: vehicle.latitude,
          currentVehicleLongitude: vehicle.longitude,
          vehicleSerialText: vehicle.serialText || this.data.trackedUgvID,
          vehicleRangeText: vehicle.rangeText || this.data.vehicleRangeText,
          vehicleCapacityText: vehicle.capacityText || DEFAULT_CAPACITY_TEXT,
          batteryText: vehicle.batteryText || this.data.batteryText
        };

        if (!this.data.hasFollowedVehicle) {
          updateData.mapLatitude = vehicle.latitude;
          updateData.mapLongitude = vehicle.longitude;
          updateData.hasFollowedVehicle = true;
        }

        this.setData(updateData);
      },
      fail: (err) => {
        console.warn('[Realtime] fetch vehicle status failed', err);
        const count = this.data.locationErrorCount + 1;
        this.setData({ locationErrorCount: count });
      },
      complete: () => {
        this._vehicleStatusRequesting = false;
      }
    });
  },

  computeDistance(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => deg * Math.PI / 180;
    const radLat1 = toRad(lat1);
    const radLat2 = toRad(lat2);
    const deltaLat = radLat2 - radLat1;
    const deltaLng = toRad(lng2 - lng1);
    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(radLat1) * Math.cos(radLat2) *
      Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const earthRadius = 6371000;
    return earthRadius * c;
  },

  // End Trip Logic
  onEndTripTap() {
    // Network Check
    wx.getNetworkType({
      success: (res) => {
        if (res.networkType === 'none') {
          wx.showToast({
            title: '网络不可用，请检查连接',
            icon: 'none'
          });
          return;
        }
        this.setData({
          showSafetyPopup: true,
          showEndTripModal: false
        });
      }
    });
  },

  onCancelEndTrip() {
    this.setData({ showEndTripModal: false });
  },

  onConfirmEndTrip() {
    this.setData({ showEndTripModal: false, isLoading: true });

    const totalDistance = this.data.totalDistance;

    callBridge({
      path: '/trip/end',
      method: 'POST',
      data: {
        tripId: this.data.tripId,
        distance: totalDistance
      }
    }).then((result) => {
      this.setData({ isLoading: false });
      if (!isBridgeSuccess(result)) {
        wx.showModal({
          title: '结束失败',
          content: (result && result.msg) || '未知错误',
          showCancel: false
        });
        return;
      }

      const payload = result && result.data ? result.data : {};
      const settledTotalFee = Number(payload.totalFee != null ? payload.totalFee : this.data.totalFee);
      const safeTotalFee = Number.isFinite(settledTotalFee) ? settledTotalFee : 0;
      const routePoints = Array.isArray(this.data.trackPoints) ? this.data.trackPoints : [];
      const routeCenter = {
        latitude: this.data.currentVehicleLatitude ?? this.data.mapLatitude,
        longitude: this.data.currentVehicleLongitude ?? this.data.mapLongitude,
        scale: this.data.mapScale
      };

      wx.setStorageSync('tripResult', {
        tripId: this.data.tripId,
        settlement: {
          deposit: DEPOSIT_AMOUNT,
          refund: parseFloat(Math.max(0, DEPOSIT_AMOUNT - safeTotalFee).toFixed(2))
        },
        pricing: {
          totalFee: parseFloat(safeTotalFee.toFixed(2))
        }
      });
      wx.setStorageSync('lastRouteTrackPoints', routePoints);
      wx.setStorageSync('lastRouteMapCenter', routeCenter);

      this.sendVehicleCommand(
        'ugvSetMode',
        buildModeCommand(this.data.trackedUgvID, 0)
      );
      wx.showToast({ title: '用车结束', icon: 'success' });

      clearInterval(this.data.tripTimer);
      if (this.data.parkingTimer) clearInterval(this.data.parkingTimer);
      if (this._locationTimer) clearInterval(this._locationTimer);

      setTimeout(() => {
        wx.reLaunch({
          url: '/pages/tuikuan/tuikuan?tripId=' + this.data.tripId
        });
      }, 1500);
    }).catch((err) => {
      this.setData({ isLoading: false });
      console.error('trip/end call failed', err);
      wx.showModal({
        title: '网络错误',
        content: '请检查网络连接后重试',
        showCancel: false
      });
    });
  },

  performEndTripRequest() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate 90% success rate
        if (Math.random() > 0.1) {
          resolve();
        } else {
          reject(new Error('Network Error'));
        }
      }, 1500);
    });
  },

  onSafetyCheckConfirm() {
    this.setData({
      showSafetyPopup: false,
      showEndTripModal: true
    });
  }
});


























