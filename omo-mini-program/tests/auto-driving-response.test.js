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
  assert.equal(matchesPendingResponse(reply('resp-plan-1', 'autoDriving', 1100), pending, new Set(), 1200), false);
  assert.equal(matchesPendingResponse(reply('resp-plan-1', 'autoDriving', 1100, 1), pending, new Set(), 1200), true);
});

test('waiting page advances mode, plan and start only after their own success replies', () => {
  let definition;
  const previousPage = global.Page;
  global.Page = (value) => { definition = value; };
  const pagePath = path.resolve(__dirname, '../pages/dengdaiquche/dengdaiquche.js');
  delete require.cache[pagePath];
  try { require(pagePath); }
  finally { if (previousPage === undefined) delete global.Page; else global.Page = previousPage; }
  let plans = 0; let starts = 0;
  const page = {
    ...definition,
    data: { ...definition.data },
    _autoDrivingStarting: true,
    _autoDrivingStage: 'mode_wait',
    _handledResponseKeys: new Set(),
    _autoDrivingPending: { stage: 'mode_wait', messageType: 'ugvSetMode', sentAt: 1000, commandMessageNo: 'mode-1' },
    setData(next) { Object.assign(this.data, next); },
    formatDistance(value) { return `${value}m`; },
    sendAutoDrivingPlan(done) {
      plans++;
      this._autoDrivingStage = 'plan_wait';
      this._autoDrivingPending = { stage: 'plan_wait', messageType: 'autoDriving', sentAt: 1150, commandMessageNo: '' };
      done(true, 'plan-1');
    },
    sendAutoDrivingStart(done) {
      starts++;
      this._autoDrivingStage = 'start_wait';
      this._autoDrivingPending = { stage: 'start_wait', messageType: 'autoDriving', sentAt: 1250, commandMessageNo: '' };
      done(true, 'start-1');
    },
  };
  page.applyVehicleResponse(reply('resp-old', 'ugvSetMode', 900));
  assert.equal(plans, 0);
  page.applyVehicleResponse(reply('resp-mode-1', 'ugvSetMode', 1100));
  assert.equal(plans, 1);
  page.applyVehicleResponse(reply('resp-mode-1', 'ugvSetMode', 1100));
  assert.equal(plans, 1);
  page.applyVehicleResponse(reply('resp-plan-1', 'autoDriving', 1200, 0, 100));
  assert.equal(starts, 1);
  page.applyVehicleResponse(reply('resp-plan-1', 'autoDriving', 1300, 0, 100));
  assert.equal(page._autoDrivingStage, 'start_wait');
  page.applyVehicleResponse(reply('resp-start-1', 'autoDriving', 1300));
  assert.equal(page._autoDrivingStage, 'running');
  assert.equal(page._autoDrivingStarted, true);
});

test('waiting page rejects a failed mode acknowledgement without sending a route', () => {
  let definition;
  const previousPage = global.Page;
  global.Page = (value) => { definition = value; };
  const pagePath = path.resolve(__dirname, '../pages/dengdaiquche/dengdaiquche.js');
  delete require.cache[pagePath];
  try { require(pagePath); }
  finally { if (previousPage === undefined) delete global.Page; else global.Page = previousPage; }
  let plans = 0;
  const page = {
    ...definition,
    data: { ...definition.data },
    _autoDrivingStarting: true,
    _autoDrivingStage: 'mode_wait',
    _handledResponseKeys: new Set(),
    _autoDrivingPending: { stage: 'mode_wait', messageType: 'ugvSetMode', sentAt: 1000, commandMessageNo: 'mode-2' },
    setData(next) { Object.assign(this.data, next); },
    sendAutoDrivingPlan() { plans++; },
  };
  page.applyVehicleResponse(reply('resp-mode-2', 'ugvSetMode', 1100, 1));
  assert.equal(plans, 0);
  assert.equal(page._autoDrivingStage, 'failed');
  assert.equal(page._autoDrivingPending, null);
  assert.equal(page._autoDrivingStarting, false);
});
