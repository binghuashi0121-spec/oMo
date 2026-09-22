const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('manual-driving page allows vertical document scrolling', () => {
  const stylesheet = fs.readFileSync(
    path.join(__dirname, '..', 'pages', 'jinhangzhong', 'jinhangzhong.wxss'),
    'utf8'
  );

  assert.match(stylesheet, /page\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(stylesheet, /\.page\s*\{[^}]*min-height:\s*100vh;[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s);
  assert.doesNotMatch(stylesheet, /\.page\s*\{[^}]*height:\s*100vh;[^}]*overflow:\s*hidden;/s);
});
