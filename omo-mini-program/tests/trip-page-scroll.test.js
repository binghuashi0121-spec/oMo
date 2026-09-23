const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('waiting and manual-driving pages allow vertical document scrolling', () => {
  const pageNames = ['dengdaiquche', 'jinhangzhong'];

  for (const pageName of pageNames) {
    const stylesheet = fs.readFileSync(
      path.join(__dirname, '..', 'pages', pageName, `${pageName}.wxss`),
      'utf8'
    );

    assert.match(stylesheet, /page\s*\{[^}]*overflow-y:\s*auto;/s);
    assert.match(stylesheet, /\.page\s*\{[^}]*min-height:\s*100vh;[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s);
    assert.doesNotMatch(stylesheet, /\.page\s*\{[^}]*height:\s*100vh;[^}]*overflow:\s*hidden;/s);
  }
});
