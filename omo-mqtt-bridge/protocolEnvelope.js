const PLATFORM_COMMAND_QOS = 0;

function buildPlatformCommandEnvelope(messageType, command, now = Date.now()) {
  return {
    header: {
      messageNo: '001',
      messageType,
      timestamp: String(now)
    },
    payload: command
  };
}

module.exports = {
  PLATFORM_COMMAND_QOS,
  buildPlatformCommandEnvelope
};
