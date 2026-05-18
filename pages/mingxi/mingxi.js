const { callBridge, isBridgeSuccess } = require('../../utils/bridgeApi');

function getSafeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatMoney(value) {
  return `${getSafeNumber(value).toFixed(2)}元`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hour}:${minute}`;
}

function formatDuration(startTime, endTime) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return '-';
  }

  const totalSeconds = Math.floor((end - start) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  }

  return `${minutes}分钟`;
}

function buildRefundTimeText(settlement) {
  if (!settlement) {
    return '-';
  }

  const refundAmount = getSafeNumber(settlement.refundAmount, 0);
  if (refundAmount <= 0) {
    return '无需退款';
  }

  if (settlement.refundTime) {
    return formatDateTime(settlement.refundTime);
  }

  if (settlement.refundedAt) {
    return formatDateTime(settlement.refundedAt);
  }

  if (settlement.settlementStatus === 'refunded' || settlement.settlementStatus === 'completed') {
    return formatDateTime(settlement.updateTime || settlement.createTime);
  }

  if (settlement.updateTime || settlement.createTime) {
    return formatDateTime(settlement.updateTime || settlement.createTime);
  }

  return '处理中';
}

Page({
  data: {
    trip: null,
    settlement: null,
    loading: true
  },

  onShareAppMessage() {
    return {};
  },

  onLoad(options) {
    if (options.tripId) {
      this.fetchTripDetails(options.tripId);
    } else {
      wx.showToast({ title: '缺少订单 ID', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  async fetchTripDetails(tripId) {
    try {
      const result = await callBridge({
        path: '/trip/detail',
        method: 'GET',
        data: { tripId }
      });

      if (!isBridgeSuccess(result)) {
        wx.showToast({ title: (result && result.msg) || '获取订单失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const payload = result && result.data ? result.data : {};
      const trip = payload.trip || null;
      const settlement = payload.settlement || null;

      if (!trip) {
        wx.showToast({ title: '订单不存在', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const displayTrip = {
        ...trip,
        displayVehicleId: trip.ugvID || trip.vehicleId || '-',
        displayVehicleModel: trip.vehicleModel || '默认服务区车型',
        orderStatusText: trip.status === 'completed' ? '已完成' : (trip.status || '未知'),
        depositText: settlement ? formatMoney(settlement.depositAmount) : '200.00元',
        estimatedCostText: formatMoney(trip.cost),
        paidCostText: formatMoney(trip.cost),
        formattedPaymentTime: formatDateTime((settlement && settlement.createTime) || trip.endTime || trip.updateTime),
        formattedStartTime: formatDateTime(trip.startTime),
        formattedEndTime: formatDateTime(trip.endTime),
        refundTimeText: buildRefundTimeText(settlement),
        formattedDuration: formatDuration(trip.startTime, trip.endTime)
      };

      this.setData({
        trip: displayTrip,
        settlement,
        loading: false
      });
    } catch (err) {
      console.error('fetch trip detail failed', err);
      wx.showToast({ title: '获取订单失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onClick() {
    setTimeout(() => {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
      if (Array.isArray(pages) && pages.length > 1) {
        wx.navigateBack({ delta: 1 });
        return;
      }

      wx.reLaunch({ url: '/pages/shouye2/shouye2' });
    }, 200);
  },

  onClick_1() {
    wx.navigateTo({ url: '/pages/bangzhu_I/bangzhu_I' });
  },

  onClick_2() {
    wx.navigateTo({ url: '/pages/guzhangbaoxiu/guzhangbaoxiu' });
  },

  onClick_3() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    if (Array.isArray(pages) && pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }

    wx.reLaunch({ url: '/pages/shouye2/shouye2' });
  }
});
