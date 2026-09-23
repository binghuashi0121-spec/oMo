const test = require('node:test');
const assert = require('node:assert/strict');
const { commandFailureFeedback } = require('../utils/bridgeCommandFeedback');

test('explains that staging vehicle control is disabled without claiming unlock success', () => {
  const feedback = commandFailureFeedback({ code: 'BRIDGE_COMMANDS_DISABLED' });
  assert.equal(feedback.title, '车辆控制未开放');
  assert.match(feedback.content, /车辆不会收到运动指令/);
  assert.equal(feedback.confirmText, '取消订单');
});

test('keeps a cancellable recovery path for other command failures', () => {
  const feedback = commandFailureFeedback({ code: 'BRIDGE_MQTT_OFFLINE', msg: 'MQTT unavailable' });
  assert.equal(feedback.title, '车辆指令发送失败');
  assert.match(feedback.content, /MQTT unavailable/);
  assert.equal(feedback.cancelText, '返回等待页');
});
