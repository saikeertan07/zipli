/**
 * ZIPLI PRO — Account & Privacy Page
 *
 * Implements:
 * 1. User profile and past order history.
 * 2. 1-Click reorder button.
 * 3. Saved addresses and dietary preferences.
 * 4. GDPR / DPDP compliance (Data Export JSON download & Right-to-Erasure).
 */

import { html } from '../utils/dom.js';
import { formatCurrency, formatDate } from '../utils/format.js';
import { store } from '../store.js';

export function renderAccountPage({ orders = [] }) {
  const state = store.getState();
  const { user } = state;

  if (!user) {
    return html`
      <div class="empty-state" style="padding:80px 20px;">
        <div class="empty-state-icon">👤</div>
        <div class="empty-state-title">Login to view account</div>
        <button class="btn btn-primary" data-action="open-auth-modal">Login / Sign Up</button>
      </div>
    `;
  }

  return html`
    <div class="account-page-container" style="max-width:1000px; margin:0 auto; padding:32px 20px;">
      <!-- Profile Header -->
      <div class="card" style="padding:24px; margin-bottom:28px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="width:56px; height:56px; border-radius:var(--radius-full); background:var(--color-brand); color:#fff; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:800;">
            ${user.name ? user.name[0].toUpperCase() : 'U'}
          </div>
          <div>
            <h1 style="font-family:var(--font-display); font-size:var(--text-xl); font-weight:800; margin:0;">
              ${user.name}
            </h1>
            <div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:2px;">
              ${user.email} • Member since ${formatDate(user.created_at || Date.now())}
            </div>
          </div>
        </div>

        <div style="display:flex; gap:10px;">
          ${user.role === 'admin'
            ? html`
                <a href="#admin" class="btn btn-secondary btn-sm" style="color:var(--color-brand); font-weight:700;">
                  Admin Dashboard →
                </a>
              `
            : ''}
          <button class="btn btn-danger btn-sm" data-action="logout">Log Out</button>
        </div>
      </div>

      <!-- 2-Column Sections -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:28px;">
        <!-- Left: Past Orders -->
        <div>
          <h2 style="font-family:var(--font-display); font-size:var(--text-base); font-weight:700; margin:0 0 16px;">
            Past Orders (${orders.length})
          </h2>

          ${orders.length === 0
            ? html`
                <div class="card" style="text-align:center; padding:32px 20px; color:var(--text-muted);">
                  <div style="font-size:32px; margin-bottom:8px;">📦</div>
                  <div style="font-size:var(--text-sm); font-weight:600;">No past orders found</div>
                  <a href="#home" class="btn btn-primary btn-sm" style="margin-top:12px;">Start Shopping</a>
                </div>
              `
            : html`
                <div style="display:flex; flex-direction:column; gap:14px;">
                  ${orders.map(
                    (ord) => html`
                      <div class="card" style="padding:16px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                          <div>
                            <span style="font-weight:700; font-size:var(--text-sm);">Order #${ord.id}</span>
                            <div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:2px;">
                              ${formatDate(ord.created_at)}
                            </div>
                          </div>
                          <span class="badge ${ord.status === 'DELIVERED' ? 'badge-success' : 'badge-brand'}">
                            ${ord.status}
                          </span>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:var(--text-sm); border-top:1px solid var(--border-subtle); padding-top:10px; margin-top:8px;">
                          <span style="font-weight:700; font-variant-numeric:tabular-nums;">
                            ${formatCurrency(ord.total_amount)}
                          </span>
                          <div style="display:flex; gap:8px;">
                            <a href="#track/${ord.id}" class="btn btn-secondary btn-sm" style="font-size:11px; padding:4px 10px;">
                              Track
                            </a>
                            <button
                              class="btn btn-primary btn-sm"
                              style="font-size:11px; padding:4px 10px;"
                              data-action="reorder"
                              data-order-id="${ord.id}"
                            >
                              ↻ Reorder
                            </button>
                          </div>
                        </div>
                      </div>
                    `
                  )}
                </div>
              `}
        </div>

        <!-- Right: Preferences & GDPR Compliance -->
        <div style="display:flex; flex-direction:column; gap:24px;">
          <!-- Dietary Preferences -->
          <div class="card" style="padding:20px;">
            <h2 style="font-size:var(--text-sm); font-weight:700; margin:0 0 12px;">
              Dietary & Shopping Preferences
            </h2>
            <div style="display:flex; flex-direction:column; gap:8px; font-size:var(--text-xs);">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="prefVegan" />
                <span>Show Vegan & Plant-Based badges</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="prefOrganic" checked />
                <span>Prioritize Farm-Fresh 100% Organic items</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="prefGluten" />
                <span>Filter out gluten allergens</span>
              </label>
            </div>
          </div>

          <!-- GDPR / DPDP Privacy Rights -->
          <div class="card" style="padding:20px; border-left:4px solid var(--color-brand);">
            <h2 style="font-size:var(--text-sm); font-weight:700; margin:0 0 8px;">
              Privacy, GDPR & DPDP Rights
            </h2>
            <p style="font-size:var(--text-xs); color:var(--text-secondary); line-height:1.5; margin-bottom:16px;">
              You have the legal right to download a copy of all personal data, order histories, and audit records, or permanently erase your account.
            </p>
            <div style="display:flex; flex-wrap:wrap; gap:10px;">
              <button class="btn btn-secondary btn-sm" data-action="export-privacy-data">
                📥 Export My Data (JSON)
              </button>
              <button class="btn btn-outline btn-sm" style="color:var(--color-danger); border-color:var(--color-danger);" data-action="delete-account">
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
