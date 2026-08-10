const VEHICLE_POLL_INTERVAL_MS = 5000;
const PLAN_REFRESH_INTERVAL_MS = 30000;
const AUTO_ENTER_RADIUS_METERS = 30;
const WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const {
  buildModeCommand,
  buildMoveCommand,
  buildAutoDrivingCommand,
  convertGcj02ToWgs84,
  AUTO_DRIVING_OPT_PLAN,
  AUTO_DRIVING_OPT_START,
  AUTO_DRIVING_OPT_EXIT,
  AUTO_DRIVING_DEFAULT_MAX_SPEED
} = require('../../utils/vehicleControl');
const { callBridge, isBridgeSuccess } = require('../../utils/bridgeApi');


function shouldShowDevArrivalShortcut() {
  try {
    if (!wx.getAccountInfoSync) return false;
    const accountInfo = wx.getAccountInfoSync();
    const envVersion = accountInfo && accountInfo.miniProgram ? accountInfo.miniProgram.envVersion : '';
    return envVersion === 'develop' || envVersion === 'trial';
  } catch (error) {
    return false;
  }
}

function isValidPolylinePoint(point) {
  return (
    point &&
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude))
  );
}

function normalizePolylineList(polylines) {
  return (Array.isArray(polylines) ? polylines : [])
    .map((polyline) => {
      const points = (Array.isArray(polyline && polyline.points) ? polyline.points : [])
        .filter(isValidPolylinePoint)
        .map((point) => ({
          latitude: Number(point.latitude),
          longitude: Number(point.longitude)
        }));

      if (points.length < 2) {
        return null;
      }

      return {
        ...polyline,
        points
      };
    })
    .filter(Boolean);
}

function formatCoordinateText(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '--, --';
  }
  return lat.toFixed(6) + ', ' + lng.toFixed(6);
}

function buildTripPageUrl(trip) {
  if (!trip || !trip.tripId) {
    return '/pages/shouye2/shouye2';
  }

  const ugvID = trip.ugvID || trip.vehicleId || '';
  return trip.status === 'active'
    ? `/pages/jinhangzhong/jinhangzhong?tripId=${trip.tripId}&ugvID=${ugvID}`
    : `/pages/dengdaiquche/dengdaiquche?tripId=${trip.tripId}&ugvID=${ugvID}`;
}

Page({
  data: {
    loaded: false,
    tripId: '',
    trackedUgvID: '',
    mapLatitude: 39.909187,
    mapLongitude: 116.397451,
    mapScale: 14,
    carMarkers: [],
    plannedPolyline: [],
    actualPolyline: [],
    combinedPolyline: [],
    waitSeconds: 0,
    waitDurationText: '00:00',
    etaText: '--',
    distanceText: '--',
    statusText: '车辆正在赶来',
    pickupName: '上车点',
    pickupLat: null,
    pickupLng: null,
    pickupWgs84Lat: null,
    pickupWgs84Lng: null,
    pickupCoordinateText: '--, --',
    userLat: null,
    userLng: null,
    liveDistanceText: '--',
    latestResponseText: '',
    showDevArrivalShortcut: false,
    showBoardingConfirm: false,
    manualModeConfirming: false
  },

  onLoad(options) {
    const tripId = (options && options.tripId) || '';
    const trackedUgvID = (options && (options.ugvID || options.vehicleId)) || 'OMO_0008';
    this._autoDrivingFlowStartedAt = 0;
    this._autoDrivingPlanSentAt = 0;
    this._autoDrivingStartSentAt = 0;
    this._handledResponseKey = '';
    this._pageBootstrapped = false;
    this._tripValidationRedirecting = false;
    this.setData({
      tripId,
      trackedUgvID,
      showDevArrivalShortcut: shouldShowDevArrivalShortcut()
    });
    this.logTripContext('onLoad');
    this.validateWaitingTripOwnership().then((valid) => {
      if (!valid) {
        return;
      }
      this.bootstrapWaitingPage();
    }).catch((err) => {
      console.warn('[waiting-trip] validate ownership failed, continue with current page state', {
        tripId,
        trackedUgvID,
        err
      });
      this.bootstrapWaitingPage();
    });
  },

  onUnload() {
    this.clearAllTimers();
  },

  onHide() {
    this.stopMoveHeartbeat();
    this.stopVehiclePolling();
  },

  onShow() {
    if (this._tripValidationRedirecting || !this._pageBootstrapped) {
      return;
    }
    if (!this.data.showBoardingConfirm) {
      this.ensureAutoDrivingStarted();
    }
    if (!this._vehicleTimer) {
      this.startVehiclePolling();
      this.fetchRealtimeVehicleStatus();
    }
  },

  onShareAppMessage() {
    return {};
  },

  logTripContext(stage, extra = {}) {
    let currentTripInfo = null;
    try {
      currentTripInfo = wx.getStorageSync('currentTripInfo') || null;
    } catch (error) {
      currentTripInfo = { readError: error && error.message ? error.message : String(error || '') };
    }

    console.warn('[waiting-trip] context', {
      stage,
      tripId: this.data.tripId,
      trackedUgvID: this.data.trackedUgvID,
      currentTripInfo,
      ...extra
    });
  },

  bootstrapWaitingPage() {
    if (this._pageBootstrapped) return;
    this._pageBootstrapped = true;

    this.restorePickupLocation();
    this.restoreUserLocation();
    this.initMapCenter();
    this.buildInitialMarkers();
    this.activateVehicleControl();

    this.fetchRealtimeVehicleStatus();
    this.startWaitTimer();
    this.startVehiclePolling();
    this.startPlanRefresh();

    setTimeout(() => this.setData({ loaded: true }), 80);
  },

  validateWaitingTripOwnership() {
    const tripId = String(this.data.tripId || '').trim();
    if (!tripId) {
      this.handleTripOwnershipMismatch({
        reason: 'missing_trip_id',
        message: '订单信息缺失，请返回首页重新进入。'
      });
      return Promise.resolve(false);
    }

    return callBridge({
      path: '/trip/active',
      method: 'GET'
    }).then((result) => {
      if (!isBridgeSuccess(result)) {
        throw new Error((result && result.msg) || 'checkActiveTrip failed');
      }

      const serverTrip = result && result.data ? result.data : null;
      const serverTripId = serverTrip && serverTrip.tripId ? String(serverTrip.tripId).trim() : '';
      const serverTripStatus = serverTrip && serverTrip.status ? String(serverTrip.status).trim() : '';
      const serverUgvID = serverTrip ? String(serverTrip.ugvID || serverTrip.vehicleId || '').trim() : '';

      this.logTripContext('validateWaitingTripOwnership', {
        serverTripId,
        serverTripStatus,
        serverUgvID
      });

      if (!serverTripId) {
        this.handleTripOwnershipMismatch({
          reason: 'no_server_trip',
          message: '未找到当前账号下的待上车订单，请返回首页重新进入。'
        });
        return false;
      }

      if (serverTripStatus === 'active') {
        this.handleTripOwnershipMismatch({
          reason: 'trip_already_active',
          message: '当前订单已进入行程，正在为您恢复到行程页。',
          serverTrip
        });
        return false;
      }

      if (serverTripId !== tripId) {
        this.handleTripOwnershipMismatch({
          reason: 'trip_id_mismatch',
          message: '当前等待页订单与账号下订单不一致，请重新进入。',
          serverTrip
        });
        return false;
      }

      return true;
    });
  },

  handleTripOwnershipMismatch({ reason, message, serverTrip } = {}) {
    if (this._tripValidationRedirecting) {
      return;
    }

    this._tripValidationRedirecting = true;
    this.clearAllTimers();
    this.logTripContext('handleTripOwnershipMismatch', {
      reason: reason || '',
      message: message || '',
      serverTripId: serverTrip && serverTrip.tripId ? serverTrip.tripId : '',
      serverTripStatus: serverTrip && serverTrip.status ? serverTrip.status : '',
      serverUgvID: serverTrip ? (serverTrip.ugvID || serverTrip.vehicleId || '') : ''
    });

    try {
      wx.removeStorageSync('currentTripInfo');
    } catch (error) {
      console.warn('[waiting-trip] clear currentTripInfo failed', error);
    }

    wx.showModal({
      title: '订单校验失败',
      content: message || '当前订单信息已失效，请返回首页重新进入。',
      showCancel: false,
      success: () => {
        wx.reLaunch({ url: buildTripPageUrl(serverTrip) });
      }
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

  stopMoveHeartbeat() {
    this._moveHeartbeatSending = false;
  },

  sendAutoDrivingPlan(onDone) {
    if (
      !this.data.trackedUgvID ||
      !Number.isFinite(this.data.pickupLat) ||
      !Number.isFinite(this.data.pickupLng)
    ) {
      if (typeof onDone === 'function') onDone(false);
      return;
    }

    const storedWgs84Lat = Number(this.data.pickupWgs84Lat);
    const storedWgs84Lng = Number(this.data.pickupWgs84Lng);
    const wgs84Point = Number.isFinite(storedWgs84Lat) && Number.isFinite(storedWgs84Lng)
      ? {
        latitude: storedWgs84Lat,
        longitude: storedWgs84Lng
      }
      : convertGcj02ToWgs84(this.data.pickupLat, this.data.pickupLng);

    if (!wgs84Point) {
      if (typeof onDone === 'function') onDone(false);
      return;
    }

    this._autoDrivingPlanSentAt = Date.now();
    this.sendVehicleCommand(
      'autoDriving',
      buildAutoDrivingCommand(this.data.trackedUgvID, AUTO_DRIVING_OPT_PLAN, {
        longitude: wgs84Point.longitude,
        latitude: wgs84Point.latitude,
        upload: 0
      }),
      onDone
    );
  },

  sendAutoDrivingStart(onDone) {
    if (!this.data.trackedUgvID) {
      if (typeof onDone === 'function') onDone(false);
      return;
    }

    this._autoDrivingStartSentAt = Date.now();
    this.sendVehicleCommand(
      'autoDriving',
      buildAutoDrivingCommand(this.data.trackedUgvID, AUTO_DRIVING_OPT_START, {
        max_speed: AUTO_DRIVING_DEFAULT_MAX_SPEED
      }),
      onDone
    );
  },

  stopAutoDriving(onDone) {
    if (!this.data.trackedUgvID) {
      if (typeof onDone === 'function') onDone(false);
      return;
    }

    this.sendVehicleCommand(
      'autoDriving',
      buildAutoDrivingCommand(this.data.trackedUgvID, AUTO_DRIVING_OPT_EXIT),
      onDone
    );
  },

  ensureAutoDrivingStarted() {
    if (
      this._autoDrivingStarted ||
      this._autoDrivingStarting ||
      !this.data.trackedUgvID ||
      !Number.isFinite(this.data.pickupLat) ||
      !Number.isFinite(this.data.pickupLng)
    ) {
      return;
    }

    this._autoDrivingStarting = true;
    this._autoDrivingStarted = false;
    this._autoDrivingStage = 'mode_sending';
    this._autoDrivingFlowStartedAt = Date.now();
    this._autoDrivingPlanSentAt = 0;
    this._autoDrivingStartSentAt = 0;
    this._handledResponseKey = '';
    this.setData({ statusText: '正在请求车辆进入自动驾驶模式...' });

    this.sendVehicleCommand(
      'ugvSetMode',
      buildModeCommand(this.data.trackedUgvID, 2),
      (modeOk) => {
        if (!modeOk) {
          this.setData({
            statusText: '自动驾驶模式切换指令发送失败，请重试',
          });
          this._autoDrivingStarting = false;
          this._autoDrivingStage = '';
          return;
        }

        this.setData({
          statusText: '已发送自动驾驶模式切换，等待车辆响应...',
          latestResponseText: ''
        });
        this._autoDrivingStage = 'plan_wait';

        this.sendAutoDrivingPlan((planOk) => {
          if (!planOk) {
            this.setData({
              statusText: '路径规划请求发送失败，请重试',
            });
            this._autoDrivingStarting = false;
            this._autoDrivingStage = '';
            return;
          }

          this.setData({
            statusText: '已发送路径规划请求，等待车辆响应...'
          });

          return;
          setTimeout(() => {
            this.sendAutoDrivingStart((startOk) => {
              this._autoDrivingStarting = false;
              this._autoDrivingStarted = !!startOk;
              if (!startOk) {
                this.setData({
                  statusText: '自动驾驶启动指令发送失败，请重试',
                });
                return;
              }

              this.setData({
                statusText: '已发送自动驾驶启动请求，等待车辆响应...'
              });
            });
          }, 300);
        });
      }
    );
  },

  activateVehicleControl() {
    this.ensureAutoDrivingStarted();
  },

  restorePickupLocation() {
    const pickup = wx.getStorageSync('lastPickupLocation') || null;
    const fallbackName = wx.getStorageSync('lastPickupLocationName') || '上车点';
    if (pickup && Number.isFinite(pickup.latitude) && Number.isFinite(pickup.longitude)) {
      const pickupWgs84Lat = Number(pickup.wgs84Latitude);
      const pickupWgs84Lng = Number(pickup.wgs84Longitude);
      this.setData({
        pickupName: pickup.name || fallbackName,
        pickupLat: pickup.latitude,
        pickupLng: pickup.longitude,
        pickupWgs84Lat: Number.isFinite(pickupWgs84Lat) ? pickupWgs84Lat : null,
        pickupWgs84Lng: Number.isFinite(pickupWgs84Lng) ? pickupWgs84Lng : null,
        pickupCoordinateText: formatCoordinateText(pickup.latitude, pickup.longitude)
      });
      this.ensureAutoDrivingStarted();
      return;
    }
    this.setData({
      pickupName: fallbackName,
      pickupWgs84Lat: null,
      pickupWgs84Lng: null,
      pickupCoordinateText: '--, --'
    });
  },

  restoreUserLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const next = {
          userLat: res.latitude,
          userLng: res.longitude
        };
        if (!Number.isFinite(this.data.pickupLat) || !Number.isFinite(this.data.pickupLng)) {
          next.pickupLat = res.latitude;
          next.pickupLng = res.longitude;
          next.pickupWgs84Lat = null;
          next.pickupWgs84Lng = null;
          next.pickupCoordinateText = formatCoordinateText(res.latitude, res.longitude);
        }
        this.setData(next);
        this.initMapCenter();
        this.buildInitialMarkers();
        this.ensureAutoDrivingStarted();
      }
    });
  },

  initMapCenter() {
    const latitude = this.data.pickupLat || this.data.userLat || this.data.mapLatitude;
    const longitude = this.data.pickupLng || this.data.userLng || this.data.mapLongitude;
    this.setData({
      mapLatitude: latitude,
      mapLongitude: longitude
    });
  },

  buildInitialMarkers(vehiclePoint) {
    const markers = [];
    if (vehiclePoint && Number.isFinite(vehiclePoint.latitude) && Number.isFinite(vehiclePoint.longitude)) {
      markers.push({
        id: 1,
        latitude: vehiclePoint.latitude,
        longitude: vehiclePoint.longitude,
        iconPath: '/pictures/dengdaiquche/car.png',
        width: 36,
        height: 36
      });
    }
    if (Number.isFinite(this.data.pickupLat) && Number.isFinite(this.data.pickupLng)) {
      markers.push({
        id: 2,
        latitude: this.data.pickupLat,
        longitude: this.data.pickupLng,
        iconPath: '/pictures/dengdaiquche/pickup_location.png',
        width: 32,
        height: 32
      });
    }
    if (Number.isFinite(this.data.userLat) && Number.isFinite(this.data.userLng)) {
      markers.push({
        id: 3,
        latitude: this.data.userLat,
        longitude: this.data.userLng,
        iconPath: '/pictures/dengdaiquche/user_location.png',
        width: 28,
        height: 28
      });
    }
    this.setData({ carMarkers: markers });
  },

  startWaitTimer() {
    if (this._waitTimer) clearInterval(this._waitTimer);
    this._startTimestamp = Date.now();
    this._waitTimer = setInterval(() => {
      const waitSeconds = Math.floor((Date.now() - this._startTimestamp) / 1000);
      this.setData({
        waitSeconds,
        waitDurationText: this.formatWaitDuration(waitSeconds)
      });

      if (waitSeconds * 1000 >= WAIT_TIMEOUT_MS) {
        this.handleWaitTimeout();
      }
    }, 1000);
  },

  startVehiclePolling() {
    this.stopVehiclePolling();
    this._vehicleTimer = setInterval(() => {
      this.fetchRealtimeVehicleStatus();
    }, VEHICLE_POLL_INTERVAL_MS);
  },

  stopVehiclePolling() {
    if (this._vehicleTimer) {
      clearInterval(this._vehicleTimer);
      this._vehicleTimer = null;
    }
  },

  startPlanRefresh() {
    if (this._planTimer) clearInterval(this._planTimer);
    this._planTimer = setInterval(() => {
      this.refreshPlanLine();
    }, PLAN_REFRESH_INTERVAL_MS);
  },

  clearAllTimers() {
    this.stopMoveHeartbeat();
    if (this._waitTimer) clearInterval(this._waitTimer);
    if (this._vehicleTimer) clearInterval(this._vehicleTimer);
    if (this._planTimer) clearInterval(this._planTimer);
    this._waitTimer = null;
    this._vehicleTimer = null;
    this._planTimer = null;
    this._vehicleStatusRequesting = false;
  },

  parseVehicleStatus(raw) {
    const payload = raw && raw.data ? raw.data : raw;
    if (!payload || typeof payload !== 'object') return null;

    const status = payload.statusInfo || {};
    const nested = payload.latestPayload && payload.latestPayload.payload ? payload.latestPayload.payload : {};

    const latitude = Number(
      status.latitude ??
      nested.latitude ??
      payload.latitude ??
      payload.lat
    );
    const longitude = Number(
      status.longitude ??
      nested.longitude ??
      payload.longitude ??
      payload.lng
    );
    const speed = Number(status.speed ?? nested.speed ?? payload.speed ?? 0);
    const timestamp = Number(
      status.timestamp ??
      nested.timestamp ??
      payload.lastReportAt ??
      payload.updatedAt ??
      Date.now()
    );

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude, speed, timestamp };
  },

  parseVehicleResponse(raw) {
    const payload = raw && raw.data ? raw.data : raw;
    if (!payload || typeof payload !== 'object') return null;

    const latestResponse =
      payload.latestResponse && typeof payload.latestResponse === 'object'
        ? payload.latestResponse
        : null;
    if (!latestResponse) return null;

    const header =
      latestResponse.header && typeof latestResponse.header === 'object'
        ? latestResponse.header
        : {};
    const responsePayload =
      latestResponse.payload && typeof latestResponse.payload === 'object'
        ? latestResponse.payload
        : {};
    const responseAt = Number(
      payload.latestResponseAt ??
      header.timestamp ??
      responsePayload.timestamp ??
      0
    );
    const retCode = Number(responsePayload.ret_code);
    const totalDistance = Number(responsePayload.total_distance);

    return {
      messageNo: header.messageNo ? String(header.messageNo) : '',
      messageType: header.messageType ? String(header.messageType) : '',
      responseAt: Number.isFinite(responseAt) ? responseAt : 0,
      retCode: Number.isFinite(retCode) ? retCode : null,
      retMsg:
        typeof responsePayload.ret_msg === 'string'
          ? responsePayload.ret_msg
          : '',
      totalDistance: Number.isFinite(totalDistance) ? totalDistance : null,
      routeUrl:
        typeof responsePayload.url === 'string' && responsePayload.url
          ? responsePayload.url
          : '',
      payload: responsePayload
    };
  },

  getVehicleResponseKey(response) {
    if (!response) return '';

    return [
      response.messageType || '',
      response.messageNo || '',
      response.responseAt || '',
      response.retCode === null ? '' : response.retCode,
      response.retMsg || ''
    ].join('|');
  },

  buildResponseStatusText(response) {
    if (!response) return '';

    const hasFailure = response.retCode !== null && response.retCode !== 0;
    const rawReason =
      typeof response.retMsg === 'string'
        ? response.retMsg.trim()
        : '';
    const reason = /^(success|ok)$/i.test(rawReason) ? '' : rawReason;

    if (hasFailure) {
      if (reason) {
        return '车辆响应失败：' + reason;
      }
      return '车辆响应失败：' + response.retCode;
    }

    if (response.messageType === 'ugvSetMode') {
      return reason || '车辆已切换到自动驾驶模式';
    }

    if (response.messageType === 'autoDriving') {
      if (this._autoDrivingStage === 'plan_wait') {
        return reason || '路径规划成功，准备启动自动驾驶';
      }

      if (this._autoDrivingStage === 'start_wait') {
        return reason || '自动驾驶已启动，车辆正在赶来';
      }
      if (response.routeUrl || response.totalDistance) {
        return '路径规划成功，车辆正在自动驾驶赶来';
      }

      return reason || '车辆已响应自动驾驶请求，正在赶来';
    }

    return reason || '车辆已响应控制指令';
  },

  applyVehicleResponse(response) {
    const responseKey = this.getVehicleResponseKey(response);
    if (!responseKey || responseKey === this._handledResponseKey) {
      return;
    }

    const responseAt = Number(response && response.responseAt);
    const flowStartedAt = Number(this._autoDrivingFlowStartedAt || 0);
    const planSentAt = Number(this._autoDrivingPlanSentAt || 0);
    const startSentAt = Number(this._autoDrivingStartSentAt || 0);

    if (
      this._autoDrivingStarting &&
      Number.isFinite(responseAt) &&
      responseAt > 0 &&
      flowStartedAt > 0 &&
      responseAt < flowStartedAt
    ) {
      return;
    }

    if (
      response &&
      response.messageType === 'autoDriving' &&
      this._autoDrivingStage === 'plan_wait' &&
      Number.isFinite(responseAt) &&
      responseAt > 0 &&
      planSentAt > 0 &&
      responseAt < planSentAt
    ) {
      return;
    }

    if (
      response &&
      response.messageType === 'autoDriving' &&
      this._autoDrivingStage === 'start_wait' &&
      Number.isFinite(responseAt) &&
      responseAt > 0 &&
      startSentAt > 0 &&
      responseAt < startSentAt
    ) {
      return;
    }

    this._handledResponseKey = responseKey;

    const statusText = this.buildResponseStatusText(response);
    const nextData = {
      latestResponseText: statusText
    };

    if (statusText) {
      nextData.statusText = statusText;
    }

    if (
      Number.isFinite(response && response.totalDistance) &&
      response.totalDistance > 0
    ) {
      nextData.distanceText = this.formatDistance(response.totalDistance);
      nextData.liveDistanceText = this.formatDistance(response.totalDistance);
    }

    this.setData(nextData);

    if (response.retCode !== null && response.retCode !== 0) {
      if (this._autoDrivingStarting) {
        this._autoDrivingStarting = false;
        this._autoDrivingStage = '';
      }
      return;
    }

    if (response.messageType === 'ugvSetMode' && this._autoDrivingStage === '__ignore_ugv_set_mode_response__') {
      this._autoDrivingStage = 'plan_wait';
      this.sendAutoDrivingPlan((planOk) => {
        if (!planOk) {
          this._autoDrivingStarting = false;
          this._autoDrivingStage = '';
          this.setData({
            statusText: '路径规划请求发送失败，请重试',
          });
          return;
        }

        this.setData({
          statusText: '已发送路径规划请求，等待车辆响应...'
        });
      });
      return;
    }

    if (response.messageType === 'autoDriving' && this._autoDrivingStage === 'plan_wait') {
      this._autoDrivingStage = 'start_wait';
      this.sendAutoDrivingStart((startOk) => {
        if (!startOk) {
          this._autoDrivingStarting = false;
          this._autoDrivingStage = '';
          this.setData({
            statusText: '自动驾驶启动指令发送失败，请重试',
          });
          return;
        }

        this.setData({
          statusText: '已发送自动驾驶启动请求，等待车辆响应...'
        });
      });
      return;
    }

    if (response.messageType === 'autoDriving' && this._autoDrivingStage === 'start_wait') {
      this._autoDrivingStarting = false;
      this._autoDrivingStarted = true;
      this._autoDrivingStage = 'running';
    }
  },

  fetchRealtimeVehicleStatus() {
    if (!wx.cloud || !wx.cloud.callContainer || !this.data.trackedUgvID) return;
    if (this._vehicleStatusRequesting) return;

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
        const latestResponse = this.parseVehicleResponse(res.data);
        this.applyVehicleResponse(latestResponse);

        const vehicle = this.parseVehicleStatus(res.data);
        if (!vehicle) return;

        const actualPoints = (this.data.actualPolyline[0] && this.data.actualPolyline[0].points) || [];
        const nextPoints = actualPoints.concat({
          latitude: vehicle.latitude,
          longitude: vehicle.longitude
        });
        const trimmed = nextPoints.length > 900 ? nextPoints.slice(nextPoints.length - 900) : nextPoints;

        const distanceMeters = this.getDistanceToPickup(vehicle.latitude, vehicle.longitude);
        const etaSeconds = this.computeEtaSeconds(distanceMeters, vehicle.speed);
        const nextActualPolyline = normalizePolylineList([
          {
            points: trimmed,
            color: '#ef5b24',
            width: 5,
            dottedLine: false
          }
        ]);

        this.setData({
          etaText: this.formatEta(etaSeconds),
          distanceText: this.formatDistance(distanceMeters),
          liveDistanceText: this.formatDistance(distanceMeters),
          actualPolyline: nextActualPolyline
        });

        this.refreshPlanLine(vehicle);
        this.refreshCombinedPolyline();
        this.buildInitialMarkers(vehicle);
        this.tryAutoEnterTrip(distanceMeters);
      },
      fail: (err) => {
        console.warn('[Realtime] fetch vehicle status failed', err);
      },
      complete: () => {
        this._vehicleStatusRequesting = false;
      }
    });
  },

  refreshPlanLine(vehicle) {
    const source = vehicle || this.getLatestVehiclePoint();
    if (!source) return;
    if (!Number.isFinite(this.data.pickupLat) || !Number.isFinite(this.data.pickupLng)) return;

    const nextPlannedPolyline = normalizePolylineList([
      {
        points: [
          { latitude: source.latitude, longitude: source.longitude },
          { latitude: this.data.pickupLat, longitude: this.data.pickupLng }
        ],
        color: '#1890FFAA',
        width: 4,
        dottedLine: true
      }
    ]);

    this.setData({
      plannedPolyline: nextPlannedPolyline
    });
    this.refreshCombinedPolyline();
  },

  refreshCombinedPolyline() {
    this.setData({
      combinedPolyline: normalizePolylineList([
        ...this.data.plannedPolyline,
        ...this.data.actualPolyline
      ])
    });
  },

  getLatestVehiclePoint() {
    const actual = this.data.actualPolyline[0];
    if (!actual || !actual.points || actual.points.length === 0) return null;
    return actual.points[actual.points.length - 1];
  },

  getDistanceToPickup(lat, lng) {
    if (!Number.isFinite(this.data.pickupLat) || !Number.isFinite(this.data.pickupLng)) return Infinity;
    return this.computeDistance(lat, lng, this.data.pickupLat, this.data.pickupLng);
  },

  computeEtaSeconds(distanceMeters, speedMetersPerSec) {
    if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return 0;
    const fallbackSpeed = 2.2;
    const speed = Number.isFinite(speedMetersPerSec) && speedMetersPerSec > 0 ? speedMetersPerSec : fallbackSpeed;
    return Math.ceil(distanceMeters / speed);
  },

  formatEta(seconds) {
    if (!Number.isFinite(seconds)) return '--';
    if (seconds <= 60) return '1分钟内';
    return Math.ceil(seconds / 60) + '分钟';
  },

  formatDistance(distanceMeters) {
    if (!Number.isFinite(distanceMeters)) return '--';
    if (distanceMeters < 1000) return Math.round(distanceMeters) + 'm';
    return (distanceMeters / 1000).toFixed(1) + 'km';
  },

  formatWaitDuration(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return m + ':' + s;
  },

  tryAutoEnterTrip(distanceMeters) {
    if (this._entering) return;
    if (!Number.isFinite(distanceMeters) || distanceMeters > AUTO_ENTER_RADIUS_METERS) return;
    if (this.data.showBoardingConfirm) return;

    this.stopAutoDriving();
    this.setData({
      showBoardingConfirm: true,
      statusText: '车辆已到达上车点，请乘客上车后点击确认切换手动驾驶。'
    });
    wx.showToast({ title: '车辆已到达上车点', icon: 'success' });
  },

  onDevArriveNow() {
    if (this._entering) return;

    wx.showModal({
      title: '测试到达',
      content: '仅用于联调：模拟车辆已到达并展示上车确认。',
      success: (res) => {
        if (!res.confirm) return;
        this.tryAutoEnterTrip(0);
      }
    });
  },

  onConfirmBoarding() {
    if (this._entering || this.data.manualModeConfirming) return;

    this._entering = true;
    this.setData({
      manualModeConfirming: true,
      statusText: '正在切换为手动驾驶并进入行程...'
    });
    this.startTripAndEnter();
  },

  logStartTripPrecheck() {
    const tripId = String(this.data.tripId || '').trim();
    this.logTripContext('startTripAndEnter.beforeStart');

    return callBridge({
      path: '/trip/active',
      method: 'GET'
    }).then((result) => {
      const serverTrip = result && result.data ? result.data : null;
      console.warn('[waiting-trip] startTrip precheck active trip', {
        tripId,
        code: result && result.code,
        msg: result && result.msg,
        serverTripId: serverTrip && serverTrip.tripId ? serverTrip.tripId : '',
        serverTripStatus: serverTrip && serverTrip.status ? serverTrip.status : '',
        serverUgvID: serverTrip ? (serverTrip.ugvID || serverTrip.vehicleId || '') : ''
      });
    }).catch((err) => {
      console.warn('[waiting-trip] startTrip precheck active trip failed', {
        tripId,
        err
      });
    });
  },

  startTripAndEnter() {
    this.logStartTripPrecheck().then(() => {
      this.stopMoveHeartbeat();
      this.stopAutoDriving();
      return callBridge({
        path: '/trip/start',
        method: 'POST',
        data: { tripId: this.data.tripId }
      });
    }).then((result) => {
      if (!isBridgeSuccess(result)) {
        throw new Error((result && result.msg) || 'startTrip failed');
      }

      const payload = result && result.data ? result.data : {};
      const startTime = payload.startTime ? Number(payload.startTime) : Date.now();

      const currentTripInfo = wx.getStorageSync('currentTripInfo') || {};
      wx.setStorageSync('currentTripInfo', {
        ...currentTripInfo,
        tripId: this.data.tripId,
        ugvID: this.data.trackedUgvID,
        vehicleId: this.data.trackedUgvID,
        startTime,
        tripStatus: 'active'
      });

      this.sendVehicleCommand(
        'ugvSetMode',
        buildModeCommand(this.data.trackedUgvID, 3),
        (modeOk) => {
          wx.showToast({
            title: modeOk ? '已切换为手动模式' : '已进入行程，请检查手动模式',
            icon: modeOk ? 'success' : 'none'
          });

          setTimeout(() => {
            wx.reLaunch({
              url: '/pages/jinhangzhong/jinhangzhong?tripId=' + this.data.tripId + '&ugvID=' + this.data.trackedUgvID + '&startTime=' + startTime
            });
          }, 700);
        }
      );
    }).catch((err) => {
      console.error('startTrip failed', err);
      wx.showModal({
        title: '进入行程失败',
        content: '请稍后重试',
        showCancel: false
      });

      this.setData({
        manualModeConfirming: false,
        statusText: this.data.showBoardingConfirm
          ? '车辆已到达上车点，请乘客上车后重新确认。'
          : '车辆正在赶来'
      });
      this._entering = false;
    });
  },

  handleWaitTimeout() {
    if (this._timeoutHandled) return;
    this._timeoutHandled = true;
    this.clearAllTimers();
    this.cancelWaitingTrip({
      silent: true,
      onDone: () => {
        wx.showModal({
          title: '等待超时',
          content: '车辆暂未到达，请重新叫车。',
          showCancel: false,
          success: () => {
            wx.reLaunch({ url: '/pages/shouye2/shouye2' });
          }
        });
      }
    });
  },

  onCancelWait() {
    wx.showModal({
      title: '取消等待',
      content: '确认取消本次叫车等待？',
      success: (res) => {
        if (!res.confirm) return;
        this.clearAllTimers();
        this.cancelWaitingTrip({
          silent: false,
          onDone: () => {
            wx.reLaunch({ url: '/pages/shouye2/shouye2' });
          }
        });
      }
    });
  },

  cancelWaitingTrip({ silent = false, onDone } = {}) {
    this.stopAutoDriving();
    if (!this.data.tripId) {
      wx.removeStorageSync('currentTripInfo');
      if (typeof onDone === 'function') onDone();
      return;
    }

    callBridge({
      path: '/trip/cancel',
      method: 'POST',
      data: { tripId: this.data.tripId }
    }).then((result) => {
      if (!silent && !isBridgeSuccess(result)) {
        wx.showToast({ title: (result && result.msg) || '取消失败', icon: 'none' });
        return;
      }
      wx.removeStorageSync('currentTripInfo');
      if (typeof onDone === 'function') onDone();
    }).catch((err) => {
      console.error('cancelWaitingTrip failed', err);
      if (silent) {
        wx.showModal({
          title: '取消等待失败',
          content: '等待超时后自动取消失败，请稍后重试。',
          showCancel: false
        });
        return;
      }
      wx.showToast({ title: '取消失败，请重试', icon: 'none' });
    });
  },

  onClick() {
    const currentTripInfo = wx.getStorageSync('currentTripInfo') || {};
    const tripId = this.data.tripId || currentTripInfo.tripId || '';
    const ugvID = this.data.trackedUgvID || currentTripInfo.ugvID || currentTripInfo.vehicleId || '';
    if (tripId) {
      wx.setStorageSync('currentTripInfo', {
        ...currentTripInfo,
        tripId,
        ugvID,
        vehicleId: ugvID || currentTripInfo.vehicleId || '',
        tripStatus: 'waiting_pickup',
        waitStartTime: currentTripInfo.waitStartTime || Date.now()
      });
    }
    wx.reLaunch({ url: '/pages/shouye2/shouye2' });
  },

  onClick_1() {
    wx.navigateTo({ url: '/pages/bangzhu_J/bangzhu_J' });
  },

  computeDistance(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => deg * Math.PI / 180;
    const radLat1 = toRad(lat1);
    const radLat2 = toRad(lat2);
    const deltaLat = radLat2 - radLat1;
    const deltaLng = toRad(lng2 - lng1);
    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(radLat1) * Math.cos(radLat2) *
      Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return 6371000 * c;
  }
});



