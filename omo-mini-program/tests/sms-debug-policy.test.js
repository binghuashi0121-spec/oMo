const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STAGING_ENV_ID,
  STAGING_APP_ID,
  canReturnDebugCode
} = require('../cloudfunctions/sendSms/debugPolicy');

const exactContext = { ENV: STAGING_ENV_ID, APPID: STAGING_APP_ID };
const exactEnvironment = {
  SMS_DEBUG_CODE_ENABLED: 'true',
  SMS_DEBUG_ENV_ID: STAGING_ENV_ID,
  SMS_DEBUG_APP_ID: STAGING_APP_ID
};

test('returns a debug SMS code only for the exact staging environment and AppID', () => {
  assert.equal(canReturnDebugCode(exactContext, exactEnvironment), true);
});

test('fails closed when the debug switch, environment or AppID differs', () => {
  assert.equal(canReturnDebugCode(exactContext, { ...exactEnvironment, SMS_DEBUG_CODE_ENABLED: 'false' }), false);
  assert.equal(canReturnDebugCode({ ...exactContext, ENV: 'omo-mqtt-prod-2g4zisao87d6ec54' }, exactEnvironment), false);
  assert.equal(canReturnDebugCode({ ...exactContext, APPID: 'wx840d0cae0a1be322' }, exactEnvironment), false);
  assert.equal(canReturnDebugCode(exactContext, { ...exactEnvironment, SMS_DEBUG_ENV_ID: 'other-staging' }), false);
  assert.equal(canReturnDebugCode(exactContext, { ...exactEnvironment, SMS_DEBUG_APP_ID: 'wx840d0cae0a1be322' }), false);
});
