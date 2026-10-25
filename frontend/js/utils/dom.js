/**
 * ZIPLI — DOM Utilities & Safe HTML Template Tag
 *
 * Implements:
 * 1. `html` tagged template with automatic escaping to guarantee zero XSS.
 * 2. `on` event delegation helper to avoid inline onclick/oninput handlers.
 * 3. Query selectors `$` and `$$`.
 */

/**
 * Escapes characters that are dangerous in HTML contexts.
 * @param {*} val
 * @returns {string}
 */
export function escapeHtml(val) {
  if (val == null) return '';
  const str = String(val);
  return str.replace(/[&<>"'`]/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      case '`': return '&#96;';
      default: return c;
    }
  });
}

/**
 * Safe HTML template literal tag that automatically escapes interpolated values.
 * Values marked with `rawHtml(str)` will be inserted unescaped.
 */
export class RawHtmlString {
  constructor(str) {
    this.value = String(str);
    this._isHtml = true;
  }

  toString() {
    return this.value;
  }
}

export function rawHtml(str) {
  if (str instanceof RawHtmlString || (str && str._isHtml)) {
    return str;
  }
  return new RawHtmlString(str);
}

export function html(strings, ...values) {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (val instanceof RawHtmlString || (val && val._isHtml)) {
        result += val.value;
      } else if (Array.isArray(val)) {
        result += val
          .map((item) => (item instanceof RawHtmlString || (item && item._isHtml) ? item.value : escapeHtml(item)))
          .join('');
      } else {
        result += escapeHtml(val);
      }
    }
  }
  return new RawHtmlString(result);
}

/**
 * Event delegation utility: listens to events on a root element
 * and delegates to child matching a selector or data-action.
 *
 * @param {Element|Document} root
 * @param {string} eventName
 * @param {string} selector - CSS selector e.g. '[data-action]' or '.btn'
 * @param {Function} handler - (event, matchingTarget) => void
 * @returns {Function} Unsubscribe function
 */
export function on(root, eventName, selector, handler) {
  const listener = (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) {
      handler(event, target);
    }
  };
  root.addEventListener(eventName, listener);
  return () => root.removeEventListener(eventName, listener);
}

/**
 * Shorthand query selector.
 * @param {string} selector
 * @param {Element|Document} [context=document]
 * @returns {Element|null}
 */
export function $(selector, context = document) {
  return context.querySelector(selector);
}

/**
 * Shorthand query selector all.
 * @param {string} selector
 * @param {Element|Document} [context=document]
 * @returns {Element[]}
 */
export function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}
