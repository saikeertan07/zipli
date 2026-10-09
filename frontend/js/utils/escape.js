/**
 * Zipli - XSS sanitization utilities
 * Escapes unsafe HTML characters to prevent XSS when interpolating strings into innerHTML.
 */

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

const ESCAPE_REGEX = /[&<>"'`]/g;

/**
 * Escapes characters with special meaning in HTML.
 * @param {*} value - The input value to escape.
 * @returns {string} - HTML-escaped string.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(ESCAPE_REGEX, (char) => ESCAPE_MAP[char]);
}

/**
 * Alias for escapeHtml, ensuring string is safe for HTML insertion.
 * @param {*} value
 * @returns {string}
 */
function safeText(value) {
  return escapeHtml(value);
}

/**
 * Sanitizes URLs to prevent javascript:, data:, or vbscript: injection.
 * @param {*} url
 * @returns {string}
 */
function safeUrl(url) {
  if (!url) return '#';
  const clean = String(url).trim();
  if (/^(javascript|data|vbscript):/i.test(clean)) {
    return '#';
  }
  return clean;
}

class RawHtmlString {
  constructor(str) {
    this.value = String(str);
    this._isHtml = true;
  }
  toString() {
    return this.value;
  }
}

function rawHtml(str) {
  if (str instanceof RawHtmlString || (str && str._isHtml)) {
    return str;
  }
  return new RawHtmlString(str);
}

function html(strings, ...values) {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (val instanceof RawHtmlString || (val && val._isHtml)) {
        result += val.value;
      } else if (Array.isArray(val)) {
        result += val
          .map((item) =>
            item instanceof RawHtmlString || (item && item._isHtml)
              ? item.value
              : escapeHtml(item)
          )
          .join('');
      } else {
        result += escapeHtml(val);
      }
    }
  }
  return new RawHtmlString(result);
}

// Support both ES module exports and global browser script tags
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escapeHtml, safeText, safeUrl, RawHtmlString, rawHtml, html };
}
if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
  window.safeText = safeText;
  window.safeUrl = safeUrl;
  window.RawHtmlString = RawHtmlString;
  window.rawHtml = rawHtml;
  window.html = html;
}
