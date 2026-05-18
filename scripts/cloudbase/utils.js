const fs = require('fs');
const path = require('path');

function readJsonFlexible(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.data)) return parsed.data;
    return [parsed];
  } catch (e) {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const data = [];
    for (const line of lines) {
      data.push(JSON.parse(line));
    }
    return data;
  }
}

function resolveProjectPath(...segments) {
  return path.resolve(__dirname, '..', '..', ...segments);
}

function loadCollectionFromBackup(backupDir, collectionName) {
  const filePath = path.join(backupDir, `${collectionName}.json`);
  if (!fs.existsSync(filePath)) return null;
  return readJsonFlexible(filePath);
}

function safeKeys(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj);
}

module.exports = {
  readJsonFlexible,
  resolveProjectPath,
  loadCollectionFromBackup,
  safeKeys
};

