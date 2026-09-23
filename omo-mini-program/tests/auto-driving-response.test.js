const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { matchesPendingResponse, responseKey } = require('../utils/autoDrivingResponse');

function reply(messageNo, messageType, responseAt, retCode = 0, totalDistance = null) {
  return { messageNo, messageType, responseAt, retCode, retMsg: retCode ? 'failed' : 'ok', totalDistance };
}

test('response matching rejects stale, duplicate, ambiguous and failed-shape replies', () => {
  const pending = { stage: 'plan_wait', messageType: 'autoDriving', sentAt: 1000, commandMessageNo: 'plan-1' };
  const handled = new Set();
  const valid = reply('resp-plan-1', 'autoDriving', 1100, 0, 100);
  assert.equal(matchesPendingResponse(valid, pending, handled, 1200), true);
  handled.add(responseKey(valid));
  assert.equal(matchesPendingResponse(valid, pending, handled, 1200), false);
  assert.equal(matchesPendingResponse(reply('resp-plan-1', 'autoDriving', 999, 0, 100), pending, new Set(), 1200), false);
  assert.equal(matchesPendingResponse({ ...reply('vendor-reply-2', 'autoDriving', 1100, 0, 100), correlationMessageNo: 'other' }, pending, new Set(), 1200), false);
  assert.equal(matchesPendingResponse(reply('vendor-reply-without-correlation', 'autoDriving', 1100, 0, 100), pending, new Set(), 1200), true);
  assert.equal(matchesPendingResponse(reply('plan-without-distance', 'autoDriving', 1100, 0), pending, new Set(), 1200), true);
  assert.equal(matchesPendingResponse({ ...reply('missing-code', 'autoDriving', 1100), retCode: null }, pending, new Set(), 1200), false);
  assert.equal(matchesPendingResponse(reply('resp-plan-1', 'autoDriving', 1100, 1), pending, new Set(), 1200), true);
});

test('waiting page advances from plan response to start without waiting for mode response', () => {
  let definition;
  const previousPage = global.Page;
  global.Page = (value) => { definition = value; };
  const pagePath = path.resolve(__dirname, '../pages/dengdaiquche/dengdaiquche.js');
  delete require.cache[pagePath];
  try { require(pagePath); }
  finally { if (previousPage === undefined) delete global.Page; else global.Page = previousPage; }
  let starts = 0;
  const page = {
    ...definition,
    data: { ...definition.data },
    _autoDrivingStarting: true,
    _autoDrivingStage: 'plan_wait',
    _handledResponseKeys: new Set(),
    _autoDrivingPending: { stage: 'plan_wait', messageType: 'autoDriving', sentAt: 1000, commandMessageNo: 'plan-1' },
    setData(next) { Object.assign(this.data, next); },
    formatDistance(value) { return `${value}m`; },
    sendAutoDrivingStart(done) {
      starts++;
      done(true, 'start-1');
    },
  };
  page.applyVehicleResponse(reply('resp-old', 'autoDriving', 900, 0, 100));
  assert.equal(starts, 0);
  page.applyVehicleResponse(reply('resp-plan-1', 'autoDriving', 1100, 0));
  assert.equal(starts, 1);
  assert.equal(page._autoDrivingStage, 'running');
  assert.equal(page._autoDrivingStarted, true);
});

test('waiting page rejects a failed plan acknowledgement without starting the vehicle', () => {
  let definition;
  const previousPage = global.Page;
  global.Page = (value) => { definition = value; };
  const pagePath = path.resolve(__dirname, '../pages/dengdaiquche/dengdaiquche.js');
  delete require.cache[pagePath];
  try { require(pagePath); }
  finally { if (previousPage === undefined) delete global.Page; else global.Page = previousPage; }
  let starts = 0;
  const page = {
    ...definition,
    data: { ...definition.data },
    _autoDrivingStarting: true,
    _autoDrivingStage: 'plan_wait',
    _handledResponseKeys: new Set(),
    _autoDrivingPending: { stage: 'plan_wait', messageType: 'autoDriving', sentAt: 1000, commandMessageNo: 'plan-2' },
    setData(next) { Object.assign(this.data, next); },
    sendAutoDrivingStart() { starts++; },
  };
  page.applyVehicleResponse(reply('resp-plan-2', 'autoDriving', 1100, 1));
  assert.equal(starts, 0);
  assert.equal(page._autoDrivingStage, 'failed');
  assert.equal(page._autoDrivingPending, null);
  assert.equal(page._autoDrivingStarting, false);
});

test('waiting page publishes mode switch before route planning without waiting for mode reply', () => {
  let definition;
  const previousPage = global.Page;
  global.Page = (value) => { definition = value; };
  const pagePath = path.resolve(__dirname, '../pages/dengdaiquche/dengdaiquche.js');
  delete require.cache[pagePath];
  try { require(pagePath); }
  finally { if (previousPage === undefined) delete global.Page; else global.Page = previousPage; }

  const calls = [];
  const page = {
    ...definition,
    data: {
      ...definition.data,
      trackedUgvID: 'OMO_0008',
      pickupLat: 28.17,
      pickupLng: 112.94
    },
    setData(next) { Object.assign(this.data, next); },
    sendAutoDrivingMode(done) {
      calls.push('mode');
      done(true, 'mode-1');
    },
    sendAutoDrivingPlan(done) {
      calls.push('plan');
      this._autoDrivingStage = 'plan_wait';
      this._autoDrivingPending = { stage: 'plan_wait', commandMessageNo: '' };
      done(true, 'plan-1');
    }
  };

  page.ensureAutoDrivingStarted();
  assert.deepEqual(calls, ['mode', 'plan']);
  assert.equal(page._autoDrivingPending.commandMessageNo, 'plan-1');
});

test('waiting page cannot report arrival before auto driving has started', () => {
  let definition;
  const previousPage = global.Page;
  global.Page = (value) => { definition = value; };
  const pagePath = path.resolve(__dirname, '../pages/dengdaiquche/dengdaiquche.js');
  delete require.cache[pagePath];
  try { require(pagePath); }
  finally { if (previousPage === undefined) delete global.Page; else global.Page = previousPage; }

  let stopCalls = 0;
  const page = {
    ...definition,
    data: { ...definition.data, tripId: 'trip-1', trackedUgvID: 'OMO_0008' },
    _autoDrivingStarted: false,
    _autoDrivingStage: 'plan_wait',
    setData(next) { Object.assign(this.data, next); },
    stopAutoDriving() { stopCalls++; }
  };

  page.tryAutoEnterTrip(0);
  assert.equal(page.data.showBoardingConfirm, false);
  assert.equal(stopCalls, 0);

  page._autoDrivingStarted = true;
  page._autoDrivingStage = 'running';
  const previousWx = global.wx;
  global.wx = { showToast() {} };
  try { page.tryAutoEnterTrip(5); }
  finally { if (previousWx === undefined) delete global.wx; else global.wx = previousWx; }

  assert.equal(page.data.showBoardingConfirm, true);
  assert.equal(stopCalls, 1);

  page.data.showBoardingConfirm = false;
  page.tryAutoEnterTrip(10);
  assert.equal(page.data.showBoardingConfirm, false);
  assert.equal(stopCalls, 1);
});

test('development emergency stop cancels the auto-driving flow and sends stop option', () => {
  let definition;
  const previousPage = global.Page;
  global.Page = (value) => { definition = value; };
  const pagePath = path.resolve(__dirname, '../pages/dengdaiquche/dengdaiquche.js');
  delete require.cache[pagePath];
  try { require(pagePath); }
  finally { if (previousPage === undefined) delete global.Page; else global.Page = previousPage; }

  let sentCommand = null;
  let heartbeatStops = 0;
  const page = {
    ...definition,
    data: {
      ...definition.data,
      showDevControls: true,
      trackedUgvID: 'OMO_0008'
    },
    _autoDrivingStarted: true,
    _autoDrivingStarting: true,
    _autoDrivingStage: 'running',
    _autoDrivingPending: { stage: 'start_wait' },
    setData(next) { Object.assign(this.data, next); },
    stopMoveHeartbeat() { heartbeatStops++; },
    sendVehicleCommand(messageType, command, done) {
      sentCommand = { messageType, command };
      done(true);
    }
  };

  const previousWx = global.wx;
  global.wx = { showToast() {} };
  try { page.onDevEmergencyStop(); }
  finally { if (previousWx === undefined) delete global.wx; else global.wx = previousWx; }

  assert.equal(page._emergencyStopped, true);
  assert.equal(page._autoDrivingStarted, false);
  assert.equal(page._autoDrivingStage, 'emergency_stopped');
  assert.equal(page._autoDrivingPending, null);
  assert.equal(heartbeatStops, 1);
  assert.equal(sentCommand.messageType, 'autoDriving');
  assert.equal(sentCommand.command.opt_mode, 3);
  assert.equal(page.data.emergencyStopSending, false);
});
