/**
 * ZIPLI — Native Accessible Modal Dialog
 *
 * Implements HTML5 <dialog closedby="any"> with light-dismiss fallback
 * per modern-web-guidance specifications.
 */

import { html } from '../utils/dom.js';

export class Modal {
  constructor(id, title = '') {
    this.id = id;
    this.title = title;
    this.dialog = null;
    this._ensureDialog();
  }

  _ensureDialog() {
    this.dialog = document.getElementById(this.id);
    if (!this.dialog) {
      this.dialog = document.createElement('dialog');
      this.dialog.id = this.id;
      this.dialog.className = 'modal';
      this.dialog.setAttribute('closedby', 'any');
      this.dialog.setAttribute('aria-labelledby', `${this.id}Title`);
      document.body.appendChild(this.dialog);

      // Light-dismiss fallback for browsers without native closedby support
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        this.dialog.addEventListener('click', (event) => {
          if (event.target !== this.dialog) return;
          const rect = this.dialog.getBoundingClientRect();
          const isInContent = (
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.left + rect.width
          );
          if (!isInContent) {
            this.close();
          }
        });
      }
    }
  }

  setContent(title, bodyHtml) {
    this._ensureDialog();
    this.dialog.innerHTML = html`
      <div class="modal-box">
        <div class="modal-head">
          <h3 class="modal-title" id="${this.id}Title">${title}</h3>
          <button class="icon-btn" data-action="close-modal" aria-label="Close dialog">✕</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    `;

    const closeBtn = this.dialog.querySelector('[data-action="close-modal"]');
    if (closeBtn) {
      closeBtn.onclick = () => this.close();
    }
  }

  open() {
    this._ensureDialog();
    if (!this.dialog.open) {
      this.dialog.showModal();
    }
  }

  close() {
    if (this.dialog && this.dialog.open) {
      this.dialog.close();
    }
  }
}

export const authModal = new Modal('authDialog', 'Welcome to Zipli');
export const addressModal = new Modal('addressDialog', 'Add Delivery Address');
export const otpModal = new Modal('otpDialog', 'Verify Mobile Number');
