function speedToKph(speed, unit) {
  if (typeof speed !== 'number' || !Number.isFinite(speed)) return null;
  if (unit === 'mps') return speed * 3.6;
  if (unit === 'kph') return speed;
  return null;
}

module.exports = { speedToKph };
