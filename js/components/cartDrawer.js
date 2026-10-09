/**
 * ZIPLI PRO — Cart Drawer Component
 *
 * Implements:
 * 1. Slide-out cart drawer with delivery guarantee badge.
 * 2. Knapsack free-delivery progress bar and filler suggestions.
 * 3. Stepper quantity adjustments and item deletion.
 * 4. Coupon input with live server-side validation.
 * 5. Transparent bill breakdown with item total, delivery fee, and savings.
 * 6. Proceed to Checkout button with stock hold trigger.
 */

import { html } from '../utils/dom.js';
import { formatCurrency, formatCountdown } from '../utils/format.js';
import { generateProductSvgFallback } from './productCard.js';

const FREE_DELIVERY_THRESHOLD = 199;

export function renderCartDrawer(cartState, activeReservation = null, basketSuggestions = []) {
  const items = cartState.items || [];
  const itemCount = cartState.itemCount || 0;
  const itemTotal = Number(cartState.itemTotal || 0);
  const deliveryFee = Number(cartState.deliveryFee || 0);
  const discountAmount = Number(cartState.discountAmount || 0);
  const grandTotal = Number(cartState.grandTotal || 0);

  // Free delivery calculations
  const gap = Math.max(0, FREE_DELIVERY_THRESHOLD - itemTotal);
  const progressPercent = Math.min(100, Math.round((itemTotal / FREE_DELIVERY_THRESHOLD) * 100));

  return html`
    <div class="drawer-overlay" id="cartOverlay" data-action="close-cart"></div>
    <aside class="drawer" id="cartDrawer" aria-label="Shopping Cart Drawer">
      <!-- Drawer Head -->
      <div class="drawer-head">
        <div>
          <h2 style="font-size:var(--text-lg); margin:0; font-family:var(--font-display);">🛒 My Cart</h2>
          <div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:2px;">
            ${itemCount} ${itemCount === 1 ? 'item' : 'items'}
          </div>
        </div>
        <button class="icon-btn" data-action="close-cart" aria-label="Close cart">✕</button>
      </div>

      <!-- Express Guarantee Banner -->
      <div style="background:var(--color-brand-subtle); padding:10px 18px; display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--border-subtle); font-size:var(--text-xs);">
        <span style="font-size:18px;">⚡</span>
        <div>Delivery in <strong>10-15 minutes</strong> — Zipli Dark Store Express</div>
      </div>

      <!-- Stock Reservation Hold Indicator (if active) -->
      ${activeReservation && activeReservation.remainingSeconds > 0
        ? html`
            <div style="background:#fef3c7; color:#78350f; padding:8px 18px; font-size:var(--text-xs); display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #fde68a;">
              <span>⏳ Stock hold reserved for checkout</span>
              <strong id="reservationCountdown" style="font-variant-numeric:tabular-nums;">
                ${formatCountdown(activeReservation.remainingSeconds)}
              </strong>
            </div>
          `
        : ''}

      <!-- Free Delivery Progress Bar -->
      <div style="padding:14px 18px; border-bottom:1px solid var(--border-subtle); background:var(--surface-bg);">
        <div style="display:flex; justify-content:space-between; font-size:var(--text-xs); font-weight:600; margin-bottom:6px;">
          <span>
            ${gap === 0
              ? '🎉 You unlocked FREE delivery!'
              : `Add ${formatCurrency(gap)} more for FREE delivery`}
          </span>
          <span style="color:var(--text-muted);">${formatCurrency(itemTotal)} / ${formatCurrency(FREE_DELIVERY_THRESHOLD)}</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
        </div>
      </div>

      <!-- Drawer Body: Items or Empty State -->
      <div class="drawer-body">
        ${items.length === 0
          ? html`
              <div class="empty-state">
                <div class="empty-state-icon">🛒</div>
                <div class="empty-state-title">Your Cart is Empty</div>
                <div class="empty-state-desc">Explore daily fresh fruits, vegetables, and pantry essentials.</div>
                <button class="btn btn-primary btn-sm" data-action="close-cart">Browse Products</button>
              </div>
            `
          : html`
              <!-- Items List -->
              <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
                ${items.map(
                  (item) => html`
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid var(--border-subtle);">
                      <img
                        src="${item.imageUrl || item.image_url || item.img || (item.productId ? `/images/products/${item.productId}.jpg` : '/images/placeholder.jpg')}"
                        alt="${item.name || item.productName}"
                        width="52"
                        height="52"
                        style="border-radius:var(--radius-sm); object-fit:cover; background:var(--neutral-100);"
                        data-fallback-src="${generateProductSvgFallback(item.name || item.productName, item.emoji, item.cat)}"
                      />
                      <div style="flex:1; min-width:0;">
                        <div style="font-size:var(--text-sm); font-weight:600; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                          ${item.name || item.productName}
                        </div>
                        <div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:2px;">
                          ${formatCurrency(item.price)} each
                        </div>
                        ${item.stock !== undefined && item.stock <= 0
                          ? html`
                              <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
                                <span class="badge badge-danger" style="font-size:9px; padding:1px 5px;">OOS</span>
                                <button
                                  class="btn btn-sm"
                                  style="font-size:10px; padding:2px 6px; background:var(--color-brand-subtle); color:var(--color-brand); border:1px solid var(--color-brand);"
                                  data-action="find-substitute"
                                  data-product-id="${item.productId || item.product_id}"
                                  data-product-name="${item.name || item.productName}"
                                >
                                  ✨ Substitute
                                </button>
                              </div>
                            `
                          : ''}
                      </div>
                      <div style="display:flex; align-items:center; gap:10px;">
                        <div class="stepper" style="width:84px; height:28px;">
                          <button
                            class="stepper-btn"
                            data-action="cart-decrement"
                            data-product-id="${item.productId || item.product_id}"
                            aria-label="Decrease quantity"
                          >−</button>
                          <span class="stepper-val">${item.quantity}</span>
                          <button
                            class="stepper-btn"
                            data-action="cart-increment"
                            data-product-id="${item.productId || item.product_id}"
                            aria-label="Increase quantity"
                          >+</button>
                        </div>
                        <span style="font-weight:700; font-size:var(--text-sm); min-width:54px; text-align:right;">
                          ${formatCurrency(Number(item.price) * Number(item.quantity))}
                        </span>
                      </div>
                    </div>
                  `
                )}
              </div>

              <!-- Knapsack Free Delivery Recommendations -->
              ${gap > 0 && basketSuggestions.length > 0
                ? html`
                    <div style="background:var(--color-brand-light); border-radius:var(--radius-md); padding:12px; margin-bottom:16px;">
                      <div style="font-size:var(--text-xs); font-weight:700; color:var(--color-brand); margin-bottom:8px;">
                        💡 Smart Add-ons to qualify for FREE delivery (Knapsack):
                      </div>
                      <div style="display:flex; flex-direction:column; gap:8px;">
                        ${basketSuggestions.slice(0, 2).map(
                          (sug) => html`
                            <div style="display:flex; align-items:center; justify-content:space-between; background:var(--surface-card); padding:8px 10px; border-radius:var(--radius-sm);">
                              <span style="font-size:var(--text-xs); font-weight:600;">${sug.name} (${formatCurrency(sug.price)})</span>
                              <button
                                class="btn btn-outline btn-sm"
                                style="padding:4px 8px; font-size:11px;"
                                data-action="add-to-cart"
                                data-product-id="${sug.id}"
                              >+ Add</button>
                            </div>
                          `
                        )}
                      </div>
                    </div>
                  `
                : ''}

              <!-- Coupon Code Input -->
              <div style="margin-bottom:16px;">
                <div style="font-size:var(--text-xs); font-weight:600; margin-bottom:4px;">Have a Promo Code?</div>
                <div style="display:flex; gap:8px;">
                  <input
                    type="text"
                    id="couponCodeInput"
                    class="input"
                    placeholder="e.g. ZIPLI50, WELCOME"
                    style="height:36px; text-transform:uppercase; font-size:var(--text-xs);"
                    value="${cartState.coupon ? cartState.coupon.code : ''}"
                  />
                  <button class="btn btn-secondary btn-sm" data-action="apply-coupon">Apply</button>
                </div>
                ${cartState.coupon
                  ? html`
                      <div style="font-size:var(--text-xs); color:var(--color-success); font-weight:600; margin-top:4px;">
                        ✓ Coupon "${cartState.coupon.code}" applied!
                      </div>
                    `
                  : ''}
              </div>

              <!-- Bill Breakdown -->
              <div style="background:var(--surface-bg); border-radius:var(--radius-md); padding:12px; font-size:var(--text-xs); display:flex; flex-direction:column; gap:6px;">
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:var(--text-secondary);">Item Total</span>
                  <span>${formatCurrency(itemTotal)}</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:var(--text-secondary);">Delivery Fee</span>
                  <span>
                    ${deliveryFee === 0
                      ? html`<strong style="color:var(--color-success);">FREE</strong>`
                      : formatCurrency(deliveryFee)}
                  </span>
                </div>
                ${discountAmount > 0
                  ? html`
                      <div style="display:flex; justify-content:space-between; color:var(--color-success); font-weight:600;">
                        <span>Coupon Savings</span>
                        <span>−${formatCurrency(discountAmount)}</span>
                      </div>
                    `
                  : ''}
                <hr style="margin:4px 0; border:none; border-top:1px solid var(--border-subtle);" />
                <div style="display:flex; justify-content:space-between; font-size:var(--text-sm); font-weight:700;">
                  <span>Grand Total</span>
                  <span style="font-variant-numeric:tabular-nums;">${formatCurrency(grandTotal)}</span>
                </div>
              </div>
            `}
      </div>

      <!-- Drawer Foot: Checkout Action -->
      ${items.length > 0
        ? html`
            <div class="drawer-foot">
              <button
                class="btn btn-primary btn-full btn-lg"
                data-action="proceed-to-checkout"
                style="justify-content:space-between;"
              >
                <span>Proceed to Checkout</span>
                <span style="font-variant-numeric:tabular-nums;">${formatCurrency(grandTotal)} →</span>
              </button>
            </div>
          `
        : ''}
    </aside>
  `;
}
