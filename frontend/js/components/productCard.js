/**
 * ZIPLI PRO — Product Card Component
 *
 * Implements:
 * 1. Image with explicit width/height & lazy-loading to prevent CLS.
 * 2. Distinct product photography with unique dynamic SVG fallback (no same-photo bug).
 * 3. Stock urgency indicator ("Only X left" when stock <= 5).
 * 4. Tabular price layout with MRP comparison and discount pill.
 * 5. Contextual quantity stepper or Add button.
 * 6. Event delegation data attributes.
 */

import { html } from '../utils/dom.js';
import { formatCurrency, calculateDiscountPercent } from '../utils/format.js';

export function generateProductSvgFallback(name, emoji, cat) {
  const bgColors = {
    dairy: '#eff6ff',
    fruits: '#f0fdf4',
    drinks: '#fefce8',
    snacks: '#fff7ed',
    tea: '#faf5ff',
    staples: '#f5f5f4',
    pharma: '#fef2f2',
    pet: '#f7fee7',
  };
  const borderColors = {
    dairy: '#bfdbfe',
    fruits: '#bbf7d0',
    drinks: '#fde68a',
    snacks: '#fed7aa',
    tea: '#e9d5ff',
    staples: '#e7e5e4',
    pharma: '#fecaca',
    pet: '#d9f99d',
  };
  const catKey = String(cat || '').toLowerCase();
  const bg = bgColors[catKey] || '#f8fafc';
  const border = borderColors[catKey] || '#e2e8f0';
  const displayEmoji = emoji || '🛒';
  const safeName = String(name || 'Item').replace(/[<>&"]/g, '').slice(0, 18);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <rect width="200" height="200" rx="16" fill="${bg}" stroke="${border}" stroke-width="2"/>
    <text x="100" y="105" font-size="68" text-anchor="middle" dominant-baseline="middle">${displayEmoji}</text>
    <text x="100" y="165" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="12" font-weight="700" fill="#334155" text-anchor="middle">${safeName}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function resolveProductImage(product) {
  const url = product.img || product.image_url;
  if (url && (url.startsWith('http') || url.startsWith('data:'))) {
    return url;
  }
  if (url && (url.startsWith('/images/products/') || url.startsWith('images/products/')) && !url.includes('placeholder')) {
    return url.replace(/^\//, '');
  }
  if (product.id) {
    return `images/products/${product.id}.jpg`;
  }
  return generateProductSvgFallback(product.name, product.emoji, product.cat || product.category_id);
}

export function renderProductCard(product, cartQty = 0) {
  const stock = product.stock !== undefined ? Number(product.stock) : 50;
  const isOutOfStock = stock <= 0;
  const isLowStock = stock > 0 && stock <= 5;
  const mrp = Number(product.mrp || product.price * 1.25);
  const price = Number(product.price);
  const discount = calculateDiscountPercent(price, mrp);

  const imageUrl = resolveProductImage(product);
  const fallbackSvg = generateProductSvgFallback(product.name, product.emoji, product.cat || product.category_id);

  return html`
    <article class="product-card" data-product-id="${product.id}">
      <div class="product-badges">
        ${isOutOfStock
          ? html`<span class="badge badge-danger">Out of Stock</span>`
          : isLowStock
          ? html`<span class="badge badge-urgency">⚡ Only ${stock} left</span>`
          : discount > 10
          ? html`<span class="badge badge-brand">${discount}% OFF</span>`
          : ''}
      </div>

      <a href="#product/${product.id}" class="product-img-box" aria-label="${product.name}">
        <img
          src="${imageUrl}"
          alt="${product.name}"
          loading="lazy"
          width="180"
          height="180"
          data-fallback-src="${fallbackSvg}"
        />
      </a>

      <div class="product-info">
        <a href="#product/${product.id}" style="text-decoration:none; color:inherit;">
          <h3 class="product-title">${product.name}</h3>
        </a>
        <div class="product-unit">${product.weight_unit || product.qty || product.unit || 'Standard Pack'}</div>

        <div class="product-pricing">
          <span class="product-price">${formatCurrency(price)}</span>
          ${mrp > price ? html`<span class="product-mrp">${formatCurrency(mrp)}</span>` : ''}
          ${discount > 5 ? html`<span class="product-discount-pill">${discount}% OFF</span>` : ''}
        </div>

        <div class="product-action-row">
          ${isOutOfStock
            ? html`
                <div style="display:flex; flex-direction:column; gap:6px; width:100%;">
                  <button class="btn btn-secondary btn-full btn-sm" disabled style="opacity:0.6; cursor:not-allowed;">Out of Stock</button>
                  <button
                    class="btn btn-sm btn-full"
                    style="background:var(--color-brand-subtle); color:var(--color-brand); border:1px solid var(--color-brand); font-size:11px; font-weight:700; padding:4px 6px;"
                    data-action="find-substitute"
                    data-product-id="${product.id}"
                    data-product-name="${product.name}"
                    aria-label="Find substitutes for ${product.name}"
                  >
                    ✨ Find Substitute
                  </button>
                </div>
              `
            : cartQty > 0
            ? html`
                <div class="stepper" role="group" aria-label="Quantity for ${product.name}">
                  <button
                    class="stepper-btn"
                    data-action="cart-decrement"
                    data-product-id="${product.id}"
                    aria-label="Decrease quantity"
                  >−</button>
                  <span class="stepper-val" aria-live="polite">${cartQty}</span>
                  <button
                    class="stepper-btn"
                    data-action="cart-increment"
                    data-product-id="${product.id}"
                    data-max-stock="${stock}"
                    aria-label="Increase quantity"
                  >+</button>
                </div>
              `
            : html`
                <button
                  class="btn btn-outline btn-full btn-sm"
                  data-action="add-to-cart"
                  data-product-id="${product.id}"
                  aria-label="Add ${product.name} to cart"
                >
                  ADD
                </button>
              `}
        </div>
      </div>
    </article>
  `;
}
