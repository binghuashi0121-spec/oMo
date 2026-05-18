const {
  shibinghuaSafeArray,
  shibinghuaSafeObject,
  shibinghuaSafeStorage,
  shibinghuaSafeString
} = require('../../utils/shibinghuaDefensive');

Page({
  data: {
    routeSnapshotUrl: '',
    mapLatitude: 39.909187,
    mapLongitude: 116.397451,
    mapScale: 14,
    trackPolyline: [],
    hasRoute: false,
    tripId: '',
    paymentId: '',
    deposit: '0.00',
    totalFee: '0.00',
    refund: '0.00'
  },

  onLoad(options) {
    const shibinghuaOptions = shibinghuaSafeObject(options);
    const shibinghuaTripResult = shibinghuaSafeStorage('tripResult', null);
    const shibinghuaFallbackTripId = shibinghuaOptions.tripId ? shibinghuaSafeString(shibinghuaOptions.tripId) : '';

    if (shibinghuaTripResult) {
      const shibinghuaSettlement = shibinghuaSafeObject(shibinghuaTripResult.settlement);
      const shibinghuaPricing = shibinghuaSafeObject(shibinghuaTripResult.pricing);
      this.setData({
        deposit: Number(shibinghuaSettlement.deposit || 0).toFixed(2),
        totalFee: Number(shibinghuaPricing.totalFee || 0).toFixed(2),
        refund: Number(shibinghuaSettlement.refund || 0).toFixed(2),
        tripId: shibinghuaTripResult.tripId || shibinghuaFallbackTripId,
        paymentId: 'PAY_' + Date.now() + Math.floor(Math.random() * 1000)
      });
    } else if (shibinghuaFallbackTripId) {
      this.setData({
        tripId: shibinghuaFallbackTripId,
        paymentId: 'PAY_' + Date.now() + Math.floor(Math.random() * 1000)
      });
    }

    const shibinghuaStoredPoints = shibinghuaSafeArray(shibinghuaSafeStorage('lastRouteTrackPoints', []));
    const shibinghuaStoredCenter = shibinghuaSafeStorage('lastRouteMapCenter', null);

    if (shibinghuaStoredPoints.length > 1) {
      const shibinghuaCenter =
        shibinghuaStoredCenter || shibinghuaStoredPoints[Math.floor(shibinghuaStoredPoints.length / 2)];
      const shibinghuaSafeCenter = shibinghuaSafeObject(shibinghuaCenter);

      this.setData({
        trackPolyline: [
          {
            points: shibinghuaStoredPoints,
            color: '#007AFF',
            width: 4,
            dottedLine: false
          }
        ],
        mapLatitude: Number(shibinghuaSafeCenter.latitude) || this.data.mapLatitude,
        mapLongitude: Number(shibinghuaSafeCenter.longitude) || this.data.mapLongitude,
        mapScale: Number(shibinghuaSafeCenter.scale) || this.data.mapScale,
        hasRoute: true
      });
    } else {
      this.setData({ hasRoute: false });
    }
  },

  onShareAppMessage() {
    return {};
  },

  onClick() {
    if (this.data.tripId) {
      wx.reLaunch({ url: '/pages/mingxi/mingxi?tripId=' + encodeURIComponent(shibinghuaSafeString(this.data.tripId)) });
      return;
    }

    wx.reLaunch({ url: '/pages/wode/wode' });
  }
});
