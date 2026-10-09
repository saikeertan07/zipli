/**
 * ZIPLI PRO — Stackable Toast Notifications
 *
 * Implements popover="manual" with progressive enhancement,
 * stack management, accessible live region, and auto-dismissal.
 */

import { escapeHtml } from '../utils/dom.js';

let container = null;

function getToastContainer() {
  if (!container) {
    container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(container);
    }
  }
  return container;
}

export function showToast(message, type = 'info', durationMs = 3500) {
  const cont = getToastContainer();

  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${type}`;
  toastEl.setAttribute('role', 'status');

  const icons = {
    success: '✓',
    error: '⚠️',
    warning: '⏳',
    info: 'ℹ️',
  };

  toastEl.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="font-weight:700;">${icons[type] || '•'}</span>
      <span>${escapeHtml(message)}</span>
    </div>
    <button style="background:transparent; border:none; color:inherit; cursor:pointer; font-size:14px; padding:0 4px;" aria-label="Dismiss">✕</button>
  `;

  toastEl.querySelector('button').addEventListener('click', () => dismiss());

  cont.appendChild(toastEl);

  function dismiss() {
    toastEl.style.transition = 'opacity 180ms ease, transform 180ms ease';
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateY(8px)';
    setTimeout(() => {
      if (toastEl.parentNode) toastEl.remove();
    }, 200);
  }

  if (durationMs > 0) {
    setTimeout(dismiss, durationMs);
  }

  return { dismiss };
}

export const toast = {
  success: (msg, dur) => showToast(msg, 'success', dur),
  error: (msg, dur) => showToast(msg, 'error', dur),
  warning: (msg, dur) => showToast(msg, 'warning', dur),
  info: (msg, dur) => showToast(msg, 'info', dur),
};
