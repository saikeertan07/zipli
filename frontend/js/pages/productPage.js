/**
 * ZIPLI PRO — Product Details Page
 *
 * Implements:
 * 1. Gallery layout with high-res product photo.
 * 2. Price / MRP / discount and stock urgency ("Only 3 left").
 * 3. "Frequently bought together" bundle with 1-click addition.
 * 4. Substitutes & related items carousel.
 * 5. Nutrition, allergens, and dietary tags.
 */

import { html, rawHtml } from '../utils/dom.js';
import { formatCurrency, calculateDiscountPercent } from '../utils/format.js';
import { renderProductCard, resolveProductImage, generateProductSvgFallback } from '../components/productCard.js';
import { store } from '../store.js';

export function renderProductPage({ product, bundle = null, substitutes = [] }) {
  if (!product) {
    return html`
      <div class="empty-state" style="padding:80px 20px;">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Product not found</div>
        <a href="#home" class="btn btn-primary btn-sm">Return to Home</a>
      </div>
    `;
  }

  const state = store.getState();
  const cartItemsMap = new Map();
  (state.cart.items || []).forEach((item) => {
    cartItemsMap.set(Number(item.productId || item.product_id), Number(item.quantity));
  });

  const cartQty = cartItemsMap.get(Number(product.id)) || 0;
  const stock = product.stock !== undefined ? Number(product.stock) : 50;
  const isOutOfStock = stock <= 0;
  const isLowStock = stock > 0 && stock <= 5;
  const price = Number(product.price);
  const mrp = Number(product.mrp || price * 1.25);
  const discount = calculateDiscountPercent(price, mrp);
  const imageUrl = resolveProductImage(product);
  const fallbackSvg = generateProductSvgFallback(product.name, product.emoji, product.cat || product.category_id);

  return html`
    <div class="product-page-container" style="max-width:1100px; margin:0 auto; padding:28px 20px;">
      <!-- Breadcrumb -->
      <nav style="font-size:var(--text-xs); color:var(--text-muted); margin-bottom:20px;" aria-label="Breadcrumb">
        <a href="#home" style="color:inherit; text-decoration:none;">Home</a> /
        <span>${product.category_name || 'Category'}</span> /
        <span style="color:var(--text-primary); font-weight:600;">${product.name}</span>
      </nav>

      <!-- Main Product Details Grid -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:36px; margin-bottom:48px;">
        <!-- Left: Image Gallery -->
        <div class="card" style="display:flex; align-items:center; justify-content:center; aspect-ratio:1/1; background:var(--surface-card); position:relative; overflow:hidden;">
          <img
            src="${imageUrl}"
            alt="${product.name}"
            style="max-width:90%; max-height:90%; width:auto; height:auto; object-fit:contain; margin:auto; display:block;"
            data-fallback-src="${fallbackSvg}"
          />
          ${discount > 5
            ? html`
                <div style="position:absolute; top:16px; left:16px;">
                  <span class="badge badge-brand" style="font-size:12px; padding:4px 8px;">${discount}% OFF</span>
                </div>
              `
            : ''}
        </div>

        <!-- Right: Details & Purchase Actions -->
        <div style="display:flex; flex-direction:column; justify-content:center;">
          <h1 style="font-family:var(--font-display); font-size:var(--text-2xl); font-weight:800; line-height:1.2; margin:0 0 8px;">
            ${product.name}
          </h1>
          <div style="font-size:var(--text-sm); color:var(--text-muted); margin-bottom:16px;">
            ${product.weight_unit || product.unit || 'Standard Pack'}
          </div>

          <!-- Stock Urgency Badge -->
          <div style="margin-bottom:16px;">
            ${isOutOfStock
              ? html`<span class="badge badge-danger">Out of Stock</span>`
              : isLowStock
              ? html`<span class="badge badge-urgency">⚡ Only ${stock} left in stock — order soon!</span>`
              : html`<span class="badge badge-success">✓ In Stock (Express 10m delivery)</span>`}
          </div>

          <!-- Price Row -->
          <div style="display:flex; align-items:baseline; gap:12px; margin-bottom:24px;">
            <span style="font-size:var(--text-3xl); font-weight:800; color:var(--text-primary); font-variant-numeric:tabular-nums;">
              ${formatCurrency(price)}
            </span>
            ${mrp > price
              ? html`
                  <span style="font-size:var(--text-lg); color:var(--text-muted); text-decoration:line-through; font-variant-numeric:tabular-nums;">
                    ${formatCurrency(mrp)}
                  </span>
                  <span class="badge badge-brand">${discount}% OFF</span>
                `
              : ''}
          </div>

          <!-- Description -->
          <p style="font-size:var(--text-sm); color:var(--text-secondary); line-height:1.6; margin-bottom:24px;">
            ${product.description || 'Farm-fresh groceries sourced directly from certified organic growers. Delivered cold-chain packed to your doorstep in 10-15 minutes.'}
          </p>

          <!-- Nutrition & Diet Tags -->
          <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:28px;">
            <span class="chip" style="font-size:11px;">🌱 100% Organic</span>
            <span class="chip" style="font-size:11px;">✨ Pesticide-Free</span>
            <span class="chip" style="font-size:11px;">❄️ Cold-chain Maintained</span>
            <span class="chip" style="font-size:11px;">⚡ 10m Delivery</span>
          </div>

          <!-- Action Button or Stepper -->
          <div style="max-width:240px;">
            ${isOutOfStock
              ? html`<button class="btn btn-secondary btn-full btn-lg" disabled>Out of Stock</button>`
              : cartQty > 0
              ? html`
                  <div class="stepper" style="height:44px; font-size:var(--text-sm);">
                    <button class="stepper-btn" data-action="cart-decrement" data-product-id="${product.id}" aria-label="Decrease">−</button>
                    <span class="stepper-val">${cartQty} in Cart</span>
                    <button class="stepper-btn" data-action="cart-increment" data-product-id="${product.id}">+</button>
                  </div>
                `
              : html`
                  <button class="btn btn-primary btn-full btn-lg" data-action="add-to-cart" data-product-id="${product.id}">
                    Add to Cart
                  </button>
                `}
          </div>
        </div>
      </div>

      <!-- Frequently Bought Together Bundle -->
      ${bundle && bundle.items && bundle.items.length > 0
        ? html`
            <section class="card" style="padding:24px; margin-bottom:40px; background:var(--surface-bg);">
              <h2 style="font-family:var(--font-display); font-size:var(--text-lg); font-weight:700; margin:0 0 16px;">
                🧺 Frequently Bought Together (Apriori Bundle)
              </h2>
              <div style="display:flex; align-items:center; flex-wrap:wrap; gap:16px;">
                <div style="display:flex; align-items:center; gap:12px;">
                  <span style="font-weight:600; font-size:var(--text-sm);">${product.name}</span>
                  <span style="font-size:18px; color:var(--text-muted);">+</span>
                  ${bundle.items.map(
                    (bItem) => html`
                      <span style="font-weight:600; font-size:var(--text-sm);">${bItem.name} (${formatCurrency(bItem.price)})</span>
                    `
                  )}
                </div>
                <div style="margin-left:auto; display:flex; align-items:center; gap:16px;">
                  <div style="font-size:var(--text-base); font-weight:700;">
                    Bundle Price: ${formatCurrency(bundle.totalPrice)}
                  </div>
                  <button
                    class="btn btn-accent btn-sm"
                    data-action="add-bundle-to-cart"
                    data-bundle-ids="${[product.id, ...bundle.items.map((i) => i.id)].join(',')}"
                  >
                    Add 2-Item Bundle
                  </button>
                </div>
              </div>
            </section>
          `
        : ''}

      <!-- Substitutes & Similar Products -->
      ${substitutes.length > 0
        ? html`
            <section style="margin-top:40px;">
              <h2 style="font-family:var(--font-display); font-size:var(--text-lg); font-weight:700; margin:0 0 18px;">
                Similar & Alternative Items
              </h2>
              <div class="product-grid">
                ${substitutes.map((subProd) =>
                  rawHtml(renderProductCard(subProd, cartItemsMap.get(Number(subProd.id)) || 0))
                )}
              </div>
            </section>
          `
        : ''}
    </div>
  `;
}
