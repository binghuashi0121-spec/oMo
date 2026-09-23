const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMapKey, createNpmInvocation } = require('./build-admin-web-cli');

test('validateMapKey accepts the Tencent Web Key shape', () => {
  assert.doesNotThrow(() => validateMapKey('ABCDE-12345-FGHIJ-67890-KLMNO-PQRST'));
});

test('validateMapKey rejects whitespace and malformed values', () => {
  for (const value of [
    '',
    'ABCDE-12345-FGHIJ-67890-KLMNO',
    'ABCDE-12345-FGHIJ-67890-KLMNO-PQRS',
    'ABCDE-12345-FGHIJ-67890-KLMNO-PQRS ',
    'abcde-12345-FGHIJ-67890-KLMNO-PQRST',
  ]) {
    assert.throws(() => validateMapKey(value), /格式无效/);
  }
});

test('createNpmInvocation runs npm through the current Node executable', () => {
  assert.deepEqual(
    createNpmInvocation({ execPath: 'C:/node/node.exe', npmExecPath: 'C:/node/node_modules/npm/bin/npm-cli.js' }),
    {
      command: 'C:/node/node.exe',
      args: ['C:/node/node_modules/npm/bin/npm-cli.js', 'run', 'build'],
    },
  );
});

test('createNpmInvocation refuses to guess an npm entry point', () => {
  assert.throws(
    () => createNpmInvocation({ execPath: 'C:/node/node.exe', npmExecPath: '' }),
    /无法定位 npm/,
  );
});
