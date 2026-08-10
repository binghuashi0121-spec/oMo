const {
  ROUTE_NETWORK_POINTS,
  ROUTE_NETWORK_POLYLINE_GCJ02
} = require('../../utils/routeNetwork');

function toFiniteNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatCoordinateText(latitude, longitude) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function buildLocationName(prefix, latitude, longitude) {
  return `${prefix}（${formatCoordinateText(latitude, longitude)}）`;
}

function computeDistance(lat1, lng1, lat2, lng2) {
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

function isSamePoint(pointA, pointB) {
  if (!pointA || !pointB) return false;
  const latA = Number(pointA.latitude);
  const lngA = Number(pointA.longitude);
  const latB = Number(pointB.latitude);
  const lngB = Number(pointB.longitude);
  if (![latA, lngA, latB, lngB].every(Number.isFinite)) return false;
  return Math.abs(latA - latB) < 0.000001 && Math.abs(lngA - lngB) < 0.000001;
}

function normalizeLocationPoint(point) {
  const latitude = toFiniteNumber(point && point.latitude);
  const longitude = toFiniteNumber(point && point.longitude);
  if (latitude === null || longitude === null) {
    return null;
  }

  const normalizedPoint = {
    latitude,
    longitude,
    coordSystem: (point && point.coordSystem) || 'gcj02'
  };

  const wgs84Latitude = toFiniteNumber(point && point.wgs84Latitude);
  const wgs84Longitude = toFiniteNumber(point && point.wgs84Longitude);
  if (wgs84Latitude !== null && wgs84Longitude !== null) {
    normalizedPoint.wgs84Latitude = wgs84Latitude;
    normalizedPoint.wgs84Longitude = wgs84Longitude;
  }

  if (point && point.routeKey) {
    normalizedPoint.routeKey = point.routeKey;
  }

  if (point && point.source) {
    normalizedPoint.source = point.source;
  }

  return normalizedPoint;
}

function buildStoredPickupLocation(point, name) {
  const normalizedPoint = normalizeLocationPoint(point);
  if (!normalizedPoint) {
    return null;
  }

  return {
    name,
    ...normalizedPoint
  };
}

function buildRecommendedSpots(baseLatitude, baseLongitude, sourceType) {
  return ROUTE_NETWORK_POINTS
    .map((point) => ({
      ...point,
      distanceMeters: computeDistance(
        baseLatitude,
        baseLongitude,
        point.gcj02Latitude,
        point.gcj02Longitude
      )
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 4)
    .map((point, index) => {
      const distanceMeters = point.distanceMeters;
      const distanceText = distanceMeters < 1000
        ? `${Math.round(distanceMeters)}m`
        : `${(distanceMeters / 1000).toFixed(1)}km`;
      const walkingMinutes = Math.max(1, Math.round(distanceMeters / 80));

      return {
        id: index + 1,
        name: point.name,
        address: index === 0
          ? (sourceType === 'manual'
            ? `距选点最近，步行约${distanceText}`
            : `距当前位置最近，步行约${distanceText}`)
          : `距参考点约${distanceText}`,
        time: `${walkingMinutes}min`,
        distance: distanceText,
        tag: index === 0 ? '最近' : (index === 1 ? '推荐' : ''),
        latitude: point.gcj02Latitude,
        longitude: point.gcj02Longitude,
        wgs84Latitude: point.wgs84Latitude,
        wgs84Longitude: point.wgs84Longitude,
        routeKey: point.key,
        source: 'route_network',
        coordSystem: 'gcj02'
      };
    });
}

function buildMarker(id, location, title, bgColor, options = {}) {
  const marker = {
    id,
    latitude: location.latitude,
    longitude: location.longitude,
    iconPath: options.iconPath || '/pictures/tuijianshangchedian/location.png',
    width: options.width || 28,
    height: options.height || 36
  };

  if (options.anchor) {
    marker.anchor = options.anchor;
  }

  if (options.showCallout === false || !title) {
    return marker;
  }

  marker.callout = {
    content: title,
    display: 'ALWAYS',
    color: '#ffffff',
    bgColor,
    borderRadius: 10,
    padding: 6,
    fontSize: 11,
    textAlign: 'center'
  };

  return marker;
}

Page({
  data: {
    currentAddress: '正在获取当前位置...',
    referenceAddress: '等待设置推荐参考点',
    selectedIndex: 0,
    items: [],
    currentLocation: null,
    referenceLocation: null,
    selectedLocationName: '',
    selectedLocation: null,
    nearestDistanceText: '',
    locationStatus: 'loading',
    loadingSpots: false,
    previewLatitude: ROUTE_NETWORK_POINTS[0].gcj02Latitude,
    previewLongitude: ROUTE_NETWORK_POINTS[0].gcj02Longitude,
    previewScale: 16,
    previewMarkers: [],
    previewPolyline: [],
    previewRouteNodeCount: ROUTE_NETWORK_POINTS.length,
    currentSummaryText: '等待定位',
    referenceSummaryText: '等待设置',
    selectedSummaryText: '等待选择'
  },

  onLoad(options) {
    this._fromPage = (options && options.from) || '';
    this.refreshPreviewMap();
    this.initLocation();
  },

  onShareAppMessage() {
    return {};
  },

  initLocation() {
    wx.getSetting({
      success: (res) => {
        const hasAuth = res.authSetting['scope.userLocation'];
        if (hasAuth) {
          this.fetchCurrentLocation();
          return;
        }

        wx.showModal({
          title: '位置授权',
          content: '推荐上车点需要定位信息，请先授权当前位置。',
          success: (result) => {
            if (!result.confirm) {
              this.setData({
                locationStatus: 'denied',
                currentAddress: '未授权定位，请点击上方地图选点',
                currentSummaryText: '未授权定位',
                referenceAddress: '等待设置推荐参考点',
                referenceSummaryText: '未设置',
                selectedSummaryText: '未选择'
              });
              return;
            }

            wx.authorize({
              scope: 'scope.userLocation',
              success: () => this.fetchCurrentLocation(),
              fail: () => {
                this.setData({
                  locationStatus: 'denied',
                  currentAddress: '未授权定位，请点击上方地图选点',
                  currentSummaryText: '未授权定位',
                  referenceAddress: '等待设置推荐参考点',
                  referenceSummaryText: '未设置',
                  selectedSummaryText: '未选择'
                });
              }
            });
          }
        });
      },
      fail: () => {
        this.fetchCurrentLocation();
      }
    });
  },

  onClick() {
    wx.redirectTo({ url: '/pages/bangzhu_C/bangzhu_C' });
  },

  onConfirmTap() {
    const point = this.data.selectedLocation || this.data.referenceLocation || this.data.currentLocation;
    const name = this.data.selectedLocationName || this.data.referenceAddress || this.data.currentAddress || '上车点';
    const storedPickupLocation = buildStoredPickupLocation(point, name);

    if (storedPickupLocation) {
      wx.setStorageSync('lastPickupLocation', storedPickupLocation);
      wx.setStorageSync('lastPickupLocationName', name);
    }

    wx.navigateBack();
  },

  fetchCurrentLocation() {
    this.setData({ locationStatus: 'locating', loadingSpots: true });

    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 3000,
      success: (res) => {
        const currentLocation = normalizeLocationPoint({
          latitude: res.latitude,
          longitude: res.longitude,
          coordSystem: 'gcj02'
        });
        const currentAddress = buildLocationName('当前位置', res.latitude, res.longitude);

        this.setData({
          currentAddress,
          currentLocation,
          currentSummaryText: currentAddress,
          locationStatus: 'success'
        });

        this.updateRecommendedSpots(currentLocation, currentAddress, 'current');
      },
      fail: () => {
        this.setData({
          currentAddress: '定位失败，请点击上方地图选点',
          currentSummaryText: '定位失败',
          referenceAddress: '等待设置推荐参考点',
          referenceSummaryText: '未设置',
          selectedSummaryText: '未选择',
          locationStatus: 'failed',
          loadingSpots: false
        });
        this.refreshPreviewMap();
      }
    });
  },

  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        const referenceLocation = normalizeLocationPoint({
          latitude: res.latitude,
          longitude: res.longitude,
          coordSystem: 'gcj02'
        });
        const referenceAddress = res.name || res.address || buildLocationName('地图选点', res.latitude, res.longitude);

        this.updateRecommendedSpots(referenceLocation, referenceAddress, 'manual');
      },
      fail: (err) => {
        console.log('Map selection cancelled or failed', err);
      }
    });
  },

  updateRecommendedSpots(referenceLocation, referenceAddress, sourceType) {
    const items = buildRecommendedSpots(
      referenceLocation.latitude,
      referenceLocation.longitude,
      sourceType
    );
    const first = items[0] || null;

    this.setData({
      referenceLocation,
      referenceAddress,
      referenceSummaryText: referenceAddress,
      items,
      selectedIndex: 0,
      loadingSpots: false,
      nearestDistanceText: `推荐结果已根据“${referenceAddress}”更新`,
      selectedLocation: first ? normalizeLocationPoint(first) : normalizeLocationPoint(referenceLocation),
      selectedLocationName: first ? first.name : referenceAddress,
      selectedSummaryText: first ? first.name : referenceAddress
    });

    this.refreshPreviewMap();
  },

  onSelectSpot(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.items[index];
    if (!item) return;

    this.setData({
      selectedIndex: index,
      selectedLocationName: item.name,
      selectedLocation: normalizeLocationPoint(item),
      selectedSummaryText: item.name,
      nearestDistanceText: `已选择：${item.name}`
    });

    this.refreshPreviewMap();
  },

  refreshPreviewMap() {
    const currentLocation = this.data.currentLocation;
    const referenceLocation = this.data.referenceLocation;
    const selectedLocation = this.data.selectedLocation;

    const previewMarkers = [];
    let markerId = 1;

    ROUTE_NETWORK_POINTS.forEach((point) => {
      previewMarkers.push(buildMarker(
        markerId++,
        { latitude: point.gcj02Latitude, longitude: point.gcj02Longitude },
        '',
        '',
        {
          showCallout: false,
          width: 18,
          height: 18,
          anchor: { x: 0.5, y: 0.5 }
        }
      ));
    });

    this.data.items.forEach((item) => {
      previewMarkers.push(buildMarker(
        markerId++,
        { latitude: item.latitude, longitude: item.longitude },
        item.name,
        item.tag === '推荐' ? '#ff9f43' : '#ef5b24'
      ));
    });

    if (currentLocation) {
      previewMarkers.push(buildMarker(markerId++, currentLocation, '当前位置', '#4b7bec'));
    }

    if (referenceLocation) {
      const title = currentLocation && isSamePoint(currentLocation, referenceLocation)
        ? '参考点（当前位置）'
        : '推荐参考点';
      previewMarkers.push(buildMarker(markerId++, referenceLocation, title, '#ff9f43'));
    }

    if (selectedLocation) {
      const selectedTitle = referenceLocation && isSamePoint(referenceLocation, selectedLocation)
        ? '当前推荐点（与参考点一致）'
        : '当前推荐点';
      previewMarkers.push(buildMarker(markerId++, selectedLocation, selectedTitle, '#ef5b24'));
    }

    const previewPolyline = ROUTE_NETWORK_POLYLINE_GCJ02.length > 1
      ? [{
        points: ROUTE_NETWORK_POLYLINE_GCJ02,
        color: '#7e8c8d88',
        width: 4,
        dottedLine: false
      }]
      : [];

    if (referenceLocation && selectedLocation && !isSamePoint(referenceLocation, selectedLocation)) {
      previewPolyline.push({
        points: [
          { latitude: referenceLocation.latitude, longitude: referenceLocation.longitude },
          { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude }
        ],
        color: '#ef5b24',
        width: 4,
        dottedLine: true
      });
    }

    const focusPoint = selectedLocation || referenceLocation || currentLocation || {
      latitude: this.data.previewLatitude,
      longitude: this.data.previewLongitude
    };

    this.setData({
      previewLatitude: focusPoint.latitude,
      previewLongitude: focusPoint.longitude,
      previewScale: selectedLocation || referenceLocation ? 17 : 16,
      previewMarkers,
      previewPolyline
    });
  }
});
