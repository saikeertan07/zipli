/**
 * ZIPLI PRO — Styleguide Interactive Script
 * Phase 11 Premium Frontend
 *
 * External ES Module complying with strict Helmet Content Security Policy (no inline scripts).
 */

import { escapeHtml } from './utils/dom.js';

const root = document.documentElement;
const themeBtn = document.getElementById('themeToggleBtn');
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    const current = root.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem('zipli_theme', next);
    } catch {}
  });
}

// Dialog handling with light-dismiss fallback
const dialog = document.getElementById('demoDialog');
const openModalBtn = document.getElementById('openModalBtn');
const closeDialogBtn = document.getElementById('closeDialogBtn');
const cancelDialogBtn = document.getElementById('cancelDialogBtn');
const confirmDialogBtn = document.getElementById('confirmDialogBtn');

if (dialog && openModalBtn) {
  openModalBtn.addEventListener('click', () => dialog.showModal());
}
if (dialog && closeDialogBtn) {
  closeDialogBtn.addEventListener('click', () => dialog.close());
}
if (dialog && cancelDialogBtn) {
  cancelDialogBtn.addEventListener('click', () => dialog.close());
}
if (dialog && confirmDialogBtn) {
  confirmDialogBtn.addEventListener('click', () => dialog.close());
}

// Light-dismiss fallback for browsers without native closedby support
if (dialog && !('closedBy' in HTMLDialogElement.prototype)) {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const isInContent = (
      rect.top <= event.clientY && event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX && event.clientX <= rect.left + rect.width
    );
    if (!isInContent) dialog.close();
  });
}

// Toast triggers
const toastContainer = document.getElementById('toastContainer');
function showToast(message, type = 'success') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span><button style="background:transparent;border:none;color:inherit;cursor:pointer;">✕</button>`;
  const closeBtn = toast.querySelector('button');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => toast.remove());
  }
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

const showToastSuccess = document.getElementById('showToastSuccess');
if (showToastSuccess) {
  showToastSuccess.addEventListener('click', () => {
    showToast('Item added to cart with Knapsack threshold match!', 'success');
  });
}

const showToastError = document.getElementById('showToastError');
if (showToastError) {
  showToastError.addEventListener('click', () => {
    showToast('Delivery slot capacity temporarily exhausted.', 'error');
  });
}
