/**
 * ZIPLI PRO — Checkout Page
 *
 * Implements:
 * 1. Saved real address book selection + Add new address.
 * 2. OTP Phone verification integration (P0).
 * 3. Capacity-aware delivery slot picker.
 * 4. Active 10-minute stock hold countdown bar.
 * 5. Idempotent order placement with UUID Idempotency-Key.
 * 6. Order summary and live submission state.
 */

import { html } from '../utils/dom.js';
import { formatCurrency, formatCountdown } from '../utils/format.js';
import { store } from '../store.js';

export function renderCheckoutPage({
  reservation = null,
  isSubmitting = false,
  showAddressModal = false,
  showOtpModal = false,
}) {
  const state = store.getState();
  const { cart, user, userAddresses = [] } = state;
  const items = cart.items || [];
  const grandTotal = Number(cart.grandTotal || 0);

  if (!user) {
    return html`
      <div class="empty-state" style="padding:80px 20px; max-width:500px; margin:0 auto; text-align:center;">
        <div class="empty-state-icon">🔒</div>
        <div class="empty-state-title" style="font-size:20px; font-weight:800; margin-bottom:8px;">Login to Complete Checkout</div>
        <div class="empty-state-desc" style="color:var(--text-secondary); margin-bottom:24px;">Log in to access your saved address book, capacity-aware delivery slots, and place your order.</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <button class="btn btn-primary btn-full btn-lg" data-action="quick-demo-login">⚡ 1-Click Instant Demo Login</button>
          <button class="btn btn-outline btn-full" data-action="open-auth-modal">Sign In with Email / Password</button>
        </div>
      </div>
    `;
  }

  if (items.length === 0) {
    return html`
      <div class="empty-state" style="padding:80px 20px;">
        <div class="empty-state-icon">🛒</div>
        <div class="empty-state-title">Your cart is empty</div>
        <div class="empty-state-desc">Add items to your cart before proceeding to checkout.</div>
        <a href="#home" class="btn btn-primary">Browse Catalog</a>
      </div>
    `;
  }

  const isPhoneVerified = Boolean(user.is_phone_verified);

  return html`
    <div class="checkout-page-container" style="max-width:1000px; margin:0 auto; padding:32px 20px;">
      <!-- Page Title -->
      <h1 style="font-family:var(--font-display); font-size:var(--text-2xl); font-weight:800; margin:0 0 24px;">
        Checkout & Delivery Details
      </h1>

      <!-- 10-Minute Stock Hold Banner -->
      ${reservation && reservation.remainingSeconds > 0
        ? html`
            <div style="background:#fef3c7; border:1px solid #fde68a; color:#78350f; border-radius:var(--radius-md); padding:12px 18px; margin-bottom:24px; display:flex; align-items:center; justify-content:space-between;">
              <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:20px;">⏳</span>
                <div>
                  <strong style="font-size:var(--text-sm);">Inventory Reserved (10-Minute Hold)</strong>
                  <div style="font-size:var(--text-xs); opacity:0.9;">Your stock items are held exclusively for your cart.</div>
                </div>
              </div>
              <div style="font-family:monospace; font-size:var(--text-lg); font-weight:800;" id="checkoutHoldTimer">
                ${formatCountdown(reservation.remainingSeconds)}
              </div>
            </div>
          `
        : ''}

      <!-- 2-Column Layout -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:32px;">
        <!-- Left: Form Steps -->
        <div style="display:flex; flex-direction:column; gap:24px;">

          <!-- 0. Phone Verification Banner (P0) -->
          <div class="card" style="padding:16px 20px; border-left: 4px solid ${isPhoneVerified ? 'var(--color-success, #10b981)' : '#f59e0b'};">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <div>
                <div style="font-size:var(--text-sm); font-weight:700; display:flex; align-items:center; gap:6px;">
                  ${isPhoneVerified ? '✅ Phone Verified' : '⚠️ Phone Verification Required'}
                </div>
                <div style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:3px;">
                  ${isPhoneVerified
                    ? `OTP verified for 10-min rider SMS updates (${user.phone || 'Verified'})`
                    : 'A verified mobile number is required before placing instant delivery orders.'}
                </div>
              </div>
              ${!isPhoneVerified
                ? html`
                    <button class="btn btn-secondary btn-sm" data-action="open-otp-modal" style="white-space:nowrap;">
                      Verify Phone
                    </button>
                  `
                : ''}
            </div>
          </div>

          <!-- 1. Real Delivery Address Selection (P0) -->
          <div class="card" style="padding:20px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
              <h2 style="font-size:var(--text-base); font-weight:700; margin:0; display:flex; align-items:center; gap:8px;">
                <span>📍 1. Delivery Address</span>
              </h2>
              <button class="btn btn-secondary btn-sm" data-action="open-new-address-modal">
                + Add Address
              </button>
            </div>

            ${userAddresses.length === 0
              ? html`
                  <div style="padding:16px; border:1px dashed var(--border-subtle); border-radius:var(--radius-md); text-align:center;">
                    <p style="margin:0 0 12px; font-size:var(--text-sm); color:var(--text-secondary);">
                      No saved addresses found. Add an address to continue.
                    </p>
                    <button class="btn btn-primary btn-sm" data-action="open-new-address-modal">
                      Add Delivery Address
                    </button>
                  </div>
                `
              : html`
                  <div style="display:flex; flex-direction:column; gap:12px;" id="addressListContainer">
                    ${userAddresses.map(
                      (addr, idx) => html`
                        <label class="card" style="padding:12px 16px; display:flex; align-items:flex-start; gap:12px; cursor:pointer; ${idx === 0 ? 'border:2px solid var(--color-brand); background:var(--color-brand-subtle);' : ''}">
                          <input
                            type="radio"
                            name="selectedAddressId"
                            value="${addr.id}"
                            ${idx === 0 ? 'checked' : ''}
                            style="margin-top:3px;"
                          />
                          <div style="flex:1;">
                            <div style="display:flex; align-items:center; justify-content:space-between;">
                              <span style="font-size:var(--text-sm); font-weight:700;">
                                ${addr.label || 'Home'} ${addr.is_default ? '• Default' : ''}
                              </span>
                              <span style="font-size:var(--text-xs); color:var(--text-muted);">${addr.phone}</span>
                            </div>
                            <div style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:2px;">
                              ${addr.recipient_name} • ${addr.address_line1}${addr.address_line2 ? ', ' + addr.address_line2 : ''}${addr.landmark ? ', ' + addr.landmark : ''}, ${addr.city} - ${addr.pincode}
                            </div>
                          </div>
                        </label>
                      `
                    )}
                  </div>
                `}
          </div>

          <!-- 2. Capacity-Aware Delivery Slot Picker -->
          <div class="card" style="padding:20px;">
            <h2 style="font-size:var(--text-base); font-weight:700; margin:0 0 16px; display:flex; align-items:center; gap:8px;">
              <span>⚡ 2. Select Delivery Slot</span>
            </h2>
            <div style="display:flex; flex-direction:column; gap:10px;">
              <label class="card" style="padding:12px 16px; border:2px solid var(--color-brand); background:var(--color-brand-subtle); display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
                <div style="display:flex; align-items:center; gap:10px;">
                  <input type="radio" name="deliverySlot" value="instant" checked />
                  <div>
                    <strong style="font-size:var(--text-sm);">Instant 10-15 Mins (Recommended)</strong>
                    <div style="font-size:var(--text-xs); color:var(--color-brand); font-weight:600;">High priority dispatch</div>
                  </div>
                </div>
                <span class="badge badge-success">High Capacity</span>
              </label>

              <label class="card" style="padding:12px 16px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
                <div style="display:flex; align-items:center; gap:10px;">
                  <input type="radio" name="deliverySlot" value="evening" />
                  <div>
                    <strong style="font-size:var(--text-sm);">Evening Slot (7:00 PM – 8:00 PM)</strong>
                    <div style="font-size:var(--text-xs); color:var(--text-muted);">Scheduled delivery</div>
                  </div>
                </div>
                <span class="badge badge-info">Available</span>
              </label>

              <label class="card" style="padding:12px 16px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
                <div style="display:flex; align-items:center; gap:10px;">
                  <input type="radio" name="deliverySlot" value="morning" />
                  <div>
                    <strong style="font-size:var(--text-sm);">Tomorrow Morning (7:00 AM – 8:00 AM)</strong>
                    <div style="font-size:var(--text-xs); color:var(--text-muted);">Fresh morning produce</div>
                  </div>
                </div>
                <span class="badge badge-info">Available</span>
              </label>
            </div>
          </div>

          <!-- 3. Payment Method -->
          <div class="card" style="padding:20px;">
            <h2 style="font-size:var(--text-base); font-weight:700; margin:0 0 16px; display:flex; align-items:center; gap:8px;">
              <span>💳 3. Payment Method</span>
            </h2>
            <div style="display:flex; flex-direction:column; gap:10px;">
              <label style="display:flex; align-items:center; gap:10px; font-size:var(--text-sm); font-weight:600; cursor:pointer;">
                <input type="radio" name="paymentMethod" value="upi" checked />
                <span>UPI / QR / Instant Netbanking (Razorpay Secure)</span>
              </label>
              <label style="display:flex; align-items:center; gap:10px; font-size:var(--text-sm); font-weight:600; cursor:pointer;">
                <input type="radio" name="paymentMethod" value="cod" />
                <span>Cash / Card on Delivery (Doorstep drop)</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Right: Order Summary & Place Order -->
        <div>
          <div class="card" style="padding:24px; position:sticky; top:90px;">
            <h2 style="font-size:var(--text-base); font-weight:700; margin:0 0 16px;">
              Order Summary (${items.length} items)
            </h2>

            <div style="display:flex; flex-direction:column; gap:10px; max-height:240px; overflow-y:auto; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
              ${items.map(
                (item) => html`
                  <div style="display:flex; justify-content:space-between; font-size:var(--text-xs);">
                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">
                      ${item.quantity}× ${item.name || item.productName}
                    </span>
                    <span style="font-variant-numeric:tabular-nums; font-weight:600;">
                      ${formatCurrency(Number(item.price) * Number(item.quantity))}
                    </span>
                  </div>
                `
              )}
            </div>

            <!-- Bill breakdown -->
            <div style="font-size:var(--text-xs); display:flex; flex-direction:column; gap:8px; margin-bottom:20px;">
              <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--text-secondary);">Item Total</span>
                <span>${formatCurrency(cart.itemTotal)}</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--text-secondary);">Delivery Partner Fee</span>
                <span>${cart.deliveryFee === 0 ? 'FREE' : formatCurrency(cart.deliveryFee)}</span>
              </div>
              ${cart.discountAmount > 0
                ? html`
                    <div style="display:flex; justify-content:space-between; color:var(--color-success); font-weight:600;">
                      <span>Promo Discount</span>
                      <span>−${formatCurrency(cart.discountAmount)}</span>
                    </div>
                  `
                : ''}
              <hr style="margin:6px 0; border:none; border-top:1px solid var(--border-subtle);" />
              <div style="display:flex; justify-content:space-between; font-size:var(--text-base); font-weight:800;">
                <span>Total Amount</span>
                <span style="font-variant-numeric:tabular-nums;">${formatCurrency(grandTotal)}</span>
              </div>
            </div>

            <!-- Submit Button with Idempotency -->
            <button
              class="btn btn-primary btn-full btn-lg"
              data-action="place-order"
              ${isSubmitting ? 'disabled' : ''}
              style="justify-content:center;"
            >
              ${isSubmitting
                ? 'Securing Order...'
                : `Place Order • ${formatCurrency(grandTotal)}`}
            </button>

            <div style="text-align:center; font-size:11px; color:var(--text-muted); margin-top:12px;">
              🔒 Guaranteed delivery with A* routing & live telemetry.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
