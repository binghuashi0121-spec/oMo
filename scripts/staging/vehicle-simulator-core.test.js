const test = require('node:test');
const assert = require('node:assert/strict');
const { createVehicleSimulator } = require('./vehicle-simulator-core');

const id = 'OMO_STAGING_0001';
function command(messageNo, messageType, payload) {
  return { header: { messageNo, messageType, timestamp: 1000 }, payload: { ugvID: id, ...payload } };
}

test('simulator plans, drives and arrives with metre telemetry', () => {
  const simulator = createVehicleSimulator(id);
  const startBeforePlan = simulator.receive(command('early', 'autoDriving', { opt_mode: 2, max_speed: 2 }), 1000);
  assert.notEqual(startBeforePlan.payload.ret_code, 0);
  assert.equal(simulator.receive(command('mode', 'ugvSetMode', { mode: 2, speedMode: 2 }), 1000).payload.ret_code, 0);
  const plan = command('plan', 'autoDriving', { opt_mode: 1, latitude: 28.17324, longitude: 112.94170, upload: 0 });
  const planned = simulator.receive(plan, 1100);
  assert.equal(planned.payload.ret_code, 0);
  assert.ok(planned.payload.total_distance > 10);
  assert.deepEqual(simulator.receive(plan, 1200), planned);
  const before = simulator.getState().total_metre;
  assert.equal(simulator.receive(command('start', 'autoDriving', { opt_mode: 2, max_speed: 2 }), 2000).payload.ret_code, 0);
  simulator.tick(7000);
  simulator.tick(8000);
  const state = simulator.getState();
  assert.equal(state.autoStatus, 6);
  assert.equal(state.speed, 0);
  assert.ok(state.odom_metre > 10);
  assert.ok(state.total_metre > before);
  assert.equal(state.latitude, 28.17324);
  const telemetry = simulator.telemetry(9000);
  assert.equal(telemetry.header.messageType, 'ugvRealtimeInfo');
  assert.equal(telemetry.payload.ugvID, id);
  assert.equal(telemetry.payload.odom_metre, state.odom_metre);
  assert.equal(simulator.receive(command('exit', 'autoDriving', { opt_mode: 5 }), 10000).payload.ret_code, 0);
  assert.equal(simulator.getState().mode, 0);
});

test('simulator rejects invalid commands and applies two-second APP watchdog', () => {
  const simulator = createVehicleSimulator(id);
  assert.notEqual(simulator.receive(command('bad-id', 'ugvSetMode', { ugvID: 'OTHER', mode: 1, speedMode: 2 }), 1000).payload.ret_code, 0);
  assert.equal(simulator.receive(command('app', 'ugvSetMode', { mode: 1, speedMode: 2 }), 1000).payload.ret_code, 0);
  assert.notEqual(simulator.receive(command('fast', 'ugvSetMove', { speed: 2, angle: 0 }), 1100).payload.ret_code, 0);
  assert.equal(simulator.receive(command('move', 'ugvSetMove', { speed: 1, angle: 0 }), 1100).payload.ret_code, 0);
  simulator.tick(2000);
  assert.equal(simulator.getState().speed, 2);
  simulator.tick(3200);
  assert.equal(simulator.getState().speed, 0);
  assert.equal(simulator.getState().mode, 0);
});
