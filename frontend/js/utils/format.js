/**
 * ZIPLI — Formatting Utilities
 *
 * Tabular currency, time countdowns, units, and dates.
 */

/**
 * Formats a monetary number in Indian Rupees with tabular numerals.
 * @param {number|string} amount
 * @param {boolean} [showDecimals=false]
 * @returns {string}
 */
export function formatCurrency(amount, showDecimals = false) {
  const num = Number(amount) || 0;
  if (showDecimals) {
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return '₹' + Math.round(num).toLocaleString('en-IN');
}

/**
 * Formats seconds into MM:SS format for countdown holds.
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatCountdown(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Formats a date string into human-readable relative or short format.
 * @param {string|Date} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Computes discount percentage from price and MRP.
 * @param {number} price
 * @param {number} mrp
 * @returns {number}
 */
export function calculateDiscountPercent(price, mrp) {
  const p = Number(price);
  const m = Number(mrp);
  if (!m || m <= p) return 0;
  return Math.round(((m - p) / m) * 100);
}

/**
 * Converts integer paise into Rupee currency string representation.
 * @param {number|string} paise
 * @param {boolean} [showDecimals=false]
 * @returns {string}
 */
export function formatPaiseToRupees(paise, showDecimals = false) {
  const p = Number(paise) || 0;
  return formatCurrency(p / 100, showDecimals);
}
}
