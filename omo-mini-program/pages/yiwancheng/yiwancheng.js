const { callBridge, isBridgeSuccess } = require('../../utils/bridgeApi');
const {
  shibinghuaSafeArray,
  shibinghuaSafeDataset,
  shibinghuaSafeObject
} = require('../../utils/shibinghuaDefensive');

function formatDateTime(value) {
  if (!value) return '-';

  const shibinghuaDate = new Date(value);
  if (Number.isNaN(shibinghuaDate.getTime())) return '-';

  const shibinghuaMonth = String(shibinghuaDate.getMonth() + 1).padStart(2, '0');
  const shibinghuaDay = String(shibinghuaDate.getDate()).padStart(2, '0');
  const shibinghuaHour = String(shibinghuaDate.getHours()).padStart(2, '0');
  const shibinghuaMinute = String(shibinghuaDate.getMinutes()).padStart(2, '0');
  return `${shibinghuaMonth}-${shibinghuaDay} ${shibinghuaHour}:${shibinghuaMinute}`;
}

function formatDuration(startTime, endTime) {
  const shibinghuaStart = new Date(startTime).getTime();
  const shibinghuaEnd = new Date(endTime).getTime();
  if (!Number.isFinite(shibinghuaStart) || !Number.isFinite(shibinghuaEnd) || shibinghuaEnd <= shibinghuaStart) {
    return '--';
  }

  const shibinghuaTotalSeconds = Math.floor((shibinghuaEnd - shibinghuaStart) / 1000);
  const shibinghuaHours = String(Math.floor(shibinghuaTotalSeconds / 3600)).padStart(2, '0');
  const shibinghuaMinutes = String(Math.floor((shibinghuaTotalSeconds % 3600) / 60)).padStart(2, '0');
  const shibinghuaSeconds = String(shibinghuaTotalSeconds % 60).padStart(2, '0');
  return `${shibinghuaHours}:${shibinghuaMinutes}:${shibinghuaSeconds}`;
}

function normalizeTripItem(trip) {
  const shibinghuaTrip = shibinghuaSafeObject(trip);
  return {
    tripId: shibinghuaTrip.tripId || shibinghuaTrip._id || '',
    vehicleId: shibinghuaTrip.vehicleId || '',
    ugvID: shibinghuaTrip.ugvID || shibinghuaTrip.vehicleId || '',
    vehicleModel: shibinghuaTrip.vehicleModel || 'oMo_Standard',
    costText: `￥${Number(shibinghuaTrip.cost || 0).toFixed(2)}`,
    distanceText: `${Number(shibinghuaTrip.distance || 0).toFixed(2)}km`,
    timeText: formatDateTime(shibinghuaTrip.endTime || shibinghuaTrip.updateTime || shibinghuaTrip.createTime),
    durationText: formatDuration(shibinghuaTrip.startTime, shibinghuaTrip.endTime),
    statusText: shibinghuaTrip.status === 'completed' ? '已完成' : (shibinghuaTrip.status || '未知')
  };
}

Page({
  data: {
    loading: true,
    trips: [],
    emptyText: '暂无已完成订单'
  },

  onShow() {
    this.fetchCompletedTrips();
  },

  onShareAppMessage() {
    return {};
  },

  async fetchCompletedTrips() {
    this.setData({ loading: true });

    try {
      const shibinghuaResult = await callBridge({
        path: '/trips/completed',
        method: 'GET',
        data: { limit: 100 }
      });

      if (!isBridgeSuccess(shibinghuaResult)) {
        wx.showToast({
          title: (shibinghuaResult && shibinghuaResult.msg) || '订单加载失败',
          icon: 'none'
        });
        this.setData({
          trips: [],
          loading: false
        });
        return;
      }

      const shibinghuaTrips = shibinghuaSafeArray(shibinghuaResult.data).map(normalizeTripItem);
      this.setData({
        trips: shibinghuaTrips,
        loading: false
      });
    } catch (shibinghuaErr) {
      console.error('listCompletedTrips failed', shibinghuaErr);
      wx.showToast({
        title: '订单加载失败',
        icon: 'none'
      });
      this.setData({
        trips: [],
        loading: false
      });
    }
  },

  onClick() {
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 200);
  },

  onClick_1() {
    wx.navigateTo({ url: '/pages/bangzhu_E/bangzhu_E' });
  },

  onTripDetailTap(e) {
    const shibinghuaTripId = shibinghuaSafeDataset(e).tripId;
    if (!shibinghuaTripId) {
      wx.showToast({ title: '缺少订单信息', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/mingxi/mingxi?tripId=${encodeURIComponent(shibinghuaTripId)}`
    });
  }
});
