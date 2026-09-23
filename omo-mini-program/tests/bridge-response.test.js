const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBridgeBody } = require('../utils/bridgeApi');

test('normalizes a JSON string returned by the CloudBase gateway', () => {
  assert.deepEqual(
    normalizeBridgeBody('{"code":0,"msg":"ok","data":[]}'),
    { code: 0, msg: 'ok', data: [] }
  );
});

test('reports a bounded preview for a non-JSON gateway response', () => {
  const result = normalizeBridgeBody('<html>Bad Gateway</html>');
  assert.equal(result.code, 500);
  assert.equal(result.msg, 'Invalid bridge response');
  assert.equal(result.data.responseType, 'string');
  assert.equal(result.data.responsePreview, '<html>Bad Gateway</html>');
});
