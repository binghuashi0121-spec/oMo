const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PLATFORM_COMMAND_QOS,
  buildPlatformCommandEnvelope
} = require('../protocolEnvelope');

test('platform commands match the teacher reference envelope and QoS', () => {
  assert.equal(PLATFORM_COMMAND_QOS, 0);
  assert.deepEqual(
    buildPlatformCommandEnvelope('autoDriving', {
      ugvID: 'OMO_0008',
      opt_mode: 1,
      longitude: 112.944371997,
      latitude: 28.173997446,
      upload: 0,
      file_url: ''
    }, 1790095528858),
    {
      header: {
        messageNo: '001',
        messageType: 'autoDriving',
        timestamp: '1790095528858'
      },
      payload: {
        ugvID: 'OMO_0008',
        opt_mode: 1,
        longitude: 112.944371997,
        latitude: 28.173997446,
        upload: 0,
        file_url: ''
      }
    }
  );
});
