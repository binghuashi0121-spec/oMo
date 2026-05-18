const PAGE_SIZE = 10;
const STORAGE_KEY = 'messages';
const {
  shibinghuaSafeArray,
  shibinghuaSafeDataset,
  shibinghuaSafeStorage
} = require('../../utils/shibinghuaDefensive');

function isValidMessage(item) {
  const shibinghuaItem = item && typeof item === 'object' ? item : {};
  return !!(
    typeof shibinghuaItem.id === 'string' &&
    shibinghuaItem.id.trim() &&
    !shibinghuaItem.id.startsWith('demo_') &&
    typeof shibinghuaItem.sender === 'string' &&
    shibinghuaItem.sender.trim() &&
    typeof shibinghuaItem.content === 'string' &&
    shibinghuaItem.content.trim() &&
    ['system', 'interaction'].includes(shibinghuaItem.type) &&
    Number.isFinite(Number(shibinghuaItem.time))
  );
}

Page({
  data: {
    allMessages: [],
    displayMessages: [],
    filters: [
      { key: 'all', label: '全部' },
      { key: 'unread', label: '未读' },
      { key: 'system', label: '系统' },
      { key: 'interaction', label: '互动' }
    ],
    currentFilter: 'all',
    page: 1,
    hasMore: true,
    isLoading: false,
    isRefresherOpen: false,
    isBatchMode: false,
    selectedIds: [],
    showSkeleton: true
  },

  onLoad() {
    this.initData();
  },

  initData() {
    const shibinghuaStoredMessages = shibinghuaSafeStorage(STORAGE_KEY, []);
    const shibinghuaAllMessages = shibinghuaSafeArray(shibinghuaStoredMessages).filter(isValidMessage);

    setTimeout(() => {
      this.setData({
        allMessages: shibinghuaAllMessages,
        showSkeleton: false
      });

      if (shibinghuaAllMessages.length > 0) {
        this.saveToStorage();
      } else {
        wx.removeStorageSync(STORAGE_KEY);
      }

      this.refreshList();
    }, 300);
  },

  saveToStorage() {
    wx.setStorageSync(STORAGE_KEY, this.data.allMessages);
  },

  getFilteredMessages() {
    const shibinghuaAllMessages = shibinghuaSafeArray(this.data.allMessages);
    const shibinghuaCurrentFilter = this.data.currentFilter || 'all';

    if (shibinghuaCurrentFilter === 'unread') {
      return shibinghuaAllMessages.filter((shibinghuaItem) => !shibinghuaItem.isRead);
    }

    if (shibinghuaCurrentFilter === 'all') {
      return shibinghuaAllMessages;
    }

    return shibinghuaAllMessages.filter((shibinghuaItem) => shibinghuaItem.type === shibinghuaCurrentFilter);
  },

  refreshList() {
    this.setData({
      page: 1,
      hasMore: true,
      isBatchMode: false,
      selectedIds: []
    });
    this.loadMessages();
  },

  loadMessages() {
    if (this.data.isLoading) return;

    this.setData({ isLoading: true });

    const shibinghuaFilteredMessages = this.getFilteredMessages();
    const shibinghuaPage = Math.max(1, Number(this.data.page || 1));
    const shibinghuaEnd = shibinghuaPage * PAGE_SIZE;
    const shibinghuaPagedMessages = shibinghuaFilteredMessages.slice(0, shibinghuaEnd).map((shibinghuaItem) => ({
      ...shibinghuaItem,
      timeStr: this.formatTime(shibinghuaItem.time)
    }));

    this.setData({
      displayMessages: shibinghuaPagedMessages,
      hasMore: shibinghuaEnd < shibinghuaFilteredMessages.length,
      isLoading: false,
      isRefresherOpen: false
    });
  },

  loadMore() {
    if (!this.data.hasMore || this.data.isLoading) return;

    this.setData({
      page: this.data.page + 1
    });
    this.loadMessages();
  },

  onRefresherRefresh() {
    this.setData({ isRefresherOpen: true });
    setTimeout(() => {
      wx.showToast({ title: '已刷新', icon: 'none' });
      this.refreshList();
    }, 500);
  },

  onFilterSelect(e) {
    const shibinghuaKey = shibinghuaSafeDataset(e).key;
    if (!shibinghuaKey || shibinghuaKey === this.data.currentFilter) return;

    this.setData({ currentFilter: shibinghuaKey });
    this.refreshList();
  },

  onCardTap(e) {
    const shibinghuaId = shibinghuaSafeDataset(e).id;
    if (!shibinghuaId) return;

    if (this.data.isBatchMode) {
      this.toggleSelection(shibinghuaId);
      return;
    }

    const shibinghuaUpdatedAll = shibinghuaSafeArray(this.data.allMessages).map((shibinghuaItem) =>
      shibinghuaItem.id === shibinghuaId ? { ...shibinghuaItem, isRead: true } : shibinghuaItem
    );

    this.setData({ allMessages: shibinghuaUpdatedAll });
    this.saveToStorage();
    this.loadMessages();

    wx.showToast({
      title: '消息详情暂未开放',
      icon: 'none'
    });
  },

  onCardLongPress(e) {
    const shibinghuaId = shibinghuaSafeDataset(e).id;
    if (!shibinghuaId || this.data.isBatchMode) return;

    this.setData({
      isBatchMode: true,
      selectedIds: [shibinghuaId]
    });
  },

  toggleSelection(id) {
    const shibinghuaSelectedIds = shibinghuaSafeArray(this.data.selectedIds).slice();
    const shibinghuaIndex = shibinghuaSelectedIds.indexOf(id);

    if (shibinghuaIndex > -1) {
      shibinghuaSelectedIds.splice(shibinghuaIndex, 1);
    } else {
      shibinghuaSelectedIds.push(id);
    }

    this.setData({ selectedIds: shibinghuaSelectedIds });
  },

  exitBatchMode() {
    this.setData({
      isBatchMode: false,
      selectedIds: []
    });
  },

  selectAll() {
    this.setData({
      selectedIds: shibinghuaSafeArray(this.data.displayMessages).map((shibinghuaItem) => shibinghuaItem.id)
    });
  },

  batchMarkRead() {
    if (this.data.selectedIds.length === 0) return;

    const shibinghuaSelectedIds = shibinghuaSafeArray(this.data.selectedIds);
    const shibinghuaUpdatedAll = shibinghuaSafeArray(this.data.allMessages).map((shibinghuaItem) =>
      shibinghuaSelectedIds.includes(shibinghuaItem.id) ? { ...shibinghuaItem, isRead: true } : shibinghuaItem
    );

    this.setData({
      allMessages: shibinghuaUpdatedAll,
      isBatchMode: false,
      selectedIds: []
    });
    this.saveToStorage();
    this.loadMessages();
    wx.showToast({ title: '已标记已读', icon: 'none' });
  },

  batchDelete() {
    if (this.data.selectedIds.length === 0) return;

    wx.showModal({
      title: '确认删除',
      content: `确定删除选中的 ${this.data.selectedIds.length} 条消息吗？`,
      confirmColor: '#FF5A5F',
      success: (shibinghuaRes) => {
        if (!(shibinghuaRes && shibinghuaRes.confirm)) return;

        const shibinghuaSelectedIds = shibinghuaSafeArray(this.data.selectedIds);
        const shibinghuaUpdatedAll = shibinghuaSafeArray(this.data.allMessages).filter(
          (shibinghuaItem) => !shibinghuaSelectedIds.includes(shibinghuaItem.id)
        );

        this.setData({
          allMessages: shibinghuaUpdatedAll,
          isBatchMode: false,
          selectedIds: []
        });
        this.saveToStorage();
        this.loadMessages();
        wx.showToast({ title: '删除成功', icon: 'none' });
      }
    });
  },

  formatTime(timestamp) {
    const shibinghuaDate = new Date(timestamp);
    const shibinghuaNow = new Date();

    if (Number.isNaN(shibinghuaDate.getTime())) {
      return '';
    }

    if (shibinghuaDate.toDateString() === shibinghuaNow.toDateString()) {
      return `${String(shibinghuaDate.getHours()).padStart(2, '0')}:${String(shibinghuaDate.getMinutes()).padStart(2, '0')}`;
    }

    return `${shibinghuaDate.getMonth() + 1}/${shibinghuaDate.getDate()}`;
  },

  onShareAppMessage() {
    return {};
  },

  onClick() {
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 200);
  }
});
