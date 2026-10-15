const assert = require('node:assert/strict');
const { escapeHtml, safeText } = require('../../../frontend/js/utils/escape.js');

describe('XSS Escape Utility', () => {
  it('escapes dangerous HTML characters', () => {
    const malicious = '<script>alert("XSS & attack")</script>\'test`';
    const escaped = escapeHtml(malicious);
    assert.strictEqual(
      escaped,
      '&lt;script&gt;alert(&quot;XSS &amp; attack&quot;)&lt;/script&gt;&#39;test&#96;'
    );
  });

  it('handles null, undefined, and non-strings safely', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
    assert.strictEqual(escapeHtml(12345), '12345');
    assert.strictEqual(escapeHtml(0), '0');
    assert.strictEqual(escapeHtml(false), 'false');
  });

  it('safeText aliases escapeHtml', () => {
    assert.strictEqual(safeText('<b>bold</b>'), '&lt;b&gt;bold&lt;/b&gt;');
  });
});
