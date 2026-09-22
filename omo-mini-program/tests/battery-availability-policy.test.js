const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.join(__dirname, '..', '..');

function source(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

test('reported battery does not gate vehicle selection or trip unlock', () => {
  const files = [
    'omo-mini-program/pages/shouye2/shouye2.js',
    'omo-mini-program/pages/jiaochejiemian/jiaochejiemian.js',
    'omo-mini-program/pages/querenyongche1/querenyongche1.js',
    'omo-mini-program/cloudfunctions/unlockVehicle/index.js',
    'omo-mqtt-bridge/tripGateway.js'
  ];

  for (const file of files) {
    const text = source(file);
    assert.doesNotMatch(text, /LOW_BATTERY_THRESHOLD|lowBattery|vehicle_low_battery|battery too low|电量过低/);
  }
});
