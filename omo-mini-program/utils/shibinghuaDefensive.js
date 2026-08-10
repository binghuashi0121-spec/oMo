function shibinghuaSafeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function shibinghuaSafeEventDetail(event) {
  return shibinghuaSafeObject(shibinghuaSafeObject(event).detail);
}

function shibinghuaSafeDataset(event) {
  return shibinghuaSafeObject(shibinghuaSafeObject(shibinghuaSafeObject(event).currentTarget).dataset);
}

function shibinghuaSafeString(value) {
  return value == null ? '' : String(value);
}

function shibinghuaSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function shibinghuaSafeStorage(key, fallbackValue) {
  try {
    const shibinghuaStoredValue = wx.getStorageSync(key);
    return shibinghuaStoredValue == null ? fallbackValue : shibinghuaStoredValue;
  } catch (shibinghuaStorageError) {
    console.warn('[shibinghuaDefensive] storage read failed', key, shibinghuaStorageError);
    return fallbackValue;
  }
}

module.exports = {
  shibinghuaSafeArray,
  shibinghuaSafeDataset,
  shibinghuaSafeEventDetail,
  shibinghuaSafeObject,
  shibinghuaSafeStorage,
  shibinghuaSafeString
};
