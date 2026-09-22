const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AUTO_DRIVING_OPT_PLAN,
  AUTO_DRIVING_OPT_START,
  AUTO_DRIVING_OPT_STOP,
  buildAutoDrivingCommand,
  buildModeCommand
} = require('../utils/vehicleControl');

const fs = require('node:fs');
const path = require('node:path');

test('planning command matches the vehicle reference payload shape', () => {
  assert.deepEqual(
    buildAutoDrivingCommand('OMO_0008', AUTO_DRIVING_OPT_PLAN, {
      longitude: 112.94422949366664,
      latitude: 28.173931993333333
    }),
    {
      ugvID: 'OMO_0008',
      opt_mode: 1,
      upload: 0,
      longitude: 112.94422949366664,
      latitude: 28.173931993333333,
      file_url: ''
    }
  );
});

test('start and stop commands include upload=0 like the reference client', () => {
  assert.deepEqual(
    buildAutoDrivingCommand('OMO_0008', AUTO_DRIVING_OPT_START, { max_speed: 2 }),
    { ugvID: 'OMO_0008', opt_mode: 2, upload: 0, max_speed: 2 }
  );
  assert.deepEqual(
    buildAutoDrivingCommand('OMO_0008', AUTO_DRIVING_OPT_STOP),
    { ugvID: 'OMO_0008', opt_mode: 3, upload: 0 }
  );
});

test('user-facing trip flow never sends lock mode and defaults to manual driving', () => {
  const tripPage = fs.readFileSync(
    path.join(__dirname, '..', 'pages', 'jinhangzhong', 'jinhangzhong.js'),
    'utf8'
  );
  const paymentPage = fs.readFileSync(
    path.join(__dirname, '..', 'pages', 'zhifu', 'zhifu.js'),
    'utf8'
  );

  assert.deepEqual(buildModeCommand('OMO_0008', 3), {
    ugvID: 'OMO_0008',
    mode: 3,
    speedMode: 2
  });
  assert.doesNotMatch(tripPage, /buildModeCommand\([^\n]*,\s*0\)/);
  assert.doesNotMatch(paymentPage, /buildModeCommand\([^\n]*,\s*[01]\)/);
  assert.match(paymentPage, /buildModeCommand\([^\n]*,\s*3\)/);
});
