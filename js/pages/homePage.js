/**
 * ZIPLI PRO — Home Page
 *
 * Implements:
 * 1. Hero offers banner with responsive layout.
 * 2. Sticky category rail with distinct emojis and instant active category filtering.
 * 3. Multi-Armed Bandit personalized rails ("Buy it again", "Trending").
 * 4. Product grid with individual photo resolution.
 * 5. Shimmer skeleton states.
 */

import { html, rawHtml } from '../utils/dom.js';
import { renderProductCard } from '../components/productCard.js';
import { formatCurrency } from '../utils/format.js';
import { store } from '../store.js';

export function renderHomePage() {
  const state = store.getState();
  const { categories = [], products = [], activeCategory = 'all', cart, reorders = [], user } = state;
  const cartItemsMap = new Map();
  (cart.items || []).forEach((item) => {
    cartItemsMap.set(Number(item.productId || item.product_id), Number(item.quantity));
  });

  const activeCatNormalized = String(activeCategory || 'all').toLowerCase();

  // Filter products by category if selected (checks both cat and category_id)
  const filteredProducts = activeCatNormalized === 'all'
    ? products
    : products.filter((p) => {
        const cat = String(p.cat || p.category_id || p.category || p.category_slug || '').toLowerCase();
        return cat === activeCatNormalized;
      });

  // Display categories: filter out duplicate 'all' entry from API
  const displayCategories = categories.filter((c) => String(c.id).toLowerCase() !== 'all');
  const activeCatObj = categories.find((c) => String(c.id).toLowerCase() === activeCatNormalized);
  const activeCatTitle = activeCatNormalized === 'all'
    ? 'All Products'
    : (activeCatObj ? `${activeCatObj.emoji || ''} ${activeCatObj.name}`.trim() : 'Products');

  return html`
    <div class="home-container">
      <!-- Hero Banner -->
      <section class="hero" aria-label="Featured Offers">
        <div class="hero-text">
          <h1>Stock up on daily essentials</h1>
          <p>Get farm-fresh goodness & a range of exotic fruits, vegetables, eggs & more in 10-15 minutes.</p>
          <button class="hero-shopbtn" data-action="set-category" data-cat-id="fruits">Shop Farm Fresh</button>
        </div>
        <img
          class="hero-img"
          src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=900&h=400&fit=crop&q=80"
          alt="Fresh organic produce"
          width="600"
          height="240"
        />
      </section>

      <!-- Recipe → Cart Express Meal Builder (P1) -->
      <section class="card" style="padding:18px 24px; margin-bottom:24px; background:linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%); border:1px solid #a7f3d0; border-radius:var(--radius-lg);" aria-label="Recipe to Cart Meal Builder">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div style="display:flex; align-items:center; gap:14px;">
            <span style="font-size:32px;">🍳</span>
            <div>
              <h2 style="font-family:var(--font-display); font-size:var(--text-base); font-weight:800; color:#065f46; margin:0;">
                Recipe → Cart Instant Meal Planner
              </h2>
              <p style="font-size:var(--text-xs); color:#047857; margin:4px 0 0;">
                Pick a dish below or ask Zipli AI to assemble fresh farm ingredients for instant 10-minute delivery.
              </p>
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" data-action="quick-recipe" data-recipe="Dal Tadka">🍛 Dal Tadka</button>
            <button class="btn btn-primary btn-sm" data-action="quick-recipe" data-recipe="Pasta Arrabbiata">🍝 Pasta</button>
            <button class="btn btn-primary btn-sm" data-action="quick-recipe" data-recipe="Chicken Biryani">🍗 Biryani</button>
            <button class="btn btn-secondary btn-sm" data-action="toggle-assistant">✨ Custom Recipe...</button>
          </div>
        </div>
      </section>

      <!-- "Your Usual" Fast Reorder Shelf (P1) -->
      ${user && reorders && reorders.length > 0
        ? html`
            <section class="card" style="padding:18px 20px; margin-bottom:24px; border-radius:var(--radius-lg);" aria-label="Your Usual Fast Reorder">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:18px;">↻</span>
                  <h2 style="font-family:var(--font-display); font-size:var(--text-base); font-weight:800; margin:0;">
                    Your Usual (Fast Reorder)
                  </h2>
                </div>
                <span style="font-size:var(--text-xs); color:var(--text-muted); font-weight:600;">Based on your past orders</span>
              </div>
              <div style="display:flex; gap:12px; overflow-x:auto; padding-bottom:8px;">
                ${reorders.map(
                  (item) => html`
                    <div style="min-width:140px; max-width:160px; background:var(--surface-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:10px; display:flex; flex-direction:column; justify-content:space-between;">
                      <div style="font-size:var(--text-xs); font-weight:700; line-height:1.2; margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${item.name}
                      </div>
                      <div style="font-size:var(--text-xs); color:var(--text-muted); margin-bottom:8px;">
                        ${formatCurrency(item.price)}
                      </div>
                      <button class="btn btn-primary btn-sm btn-full" style="font-size:11px; padding:3px 6px;" data-action="add-to-cart" data-product-id="${item.productId || item.id}">
                        + Add
                      </button>
                    </div>
                  `
                )}
              </div>
            </section>
          `
        : ''}

      <!-- Promo Section -->
      <section class="promo-section" aria-label="Special Categories">
        <div class="promo-card" data-action="set-category" data-cat-id="drinks" role="button" tabindex="0">
          <img src="https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=300&fit=crop&q=80" alt="Cold Drinks & Juices" width="300" height="150" loading="lazy" />
          <div class="ptext">
            <h3>Cold Drinks & Juices</h3>
            <p>Chilled beverages, juices & soda in 10 mins</p>
            <span class="btn btn-secondary btn-sm" aria-hidden="true">Order Now</span>
          </div>
        </div>
        <div class="promo-card" data-action="set-category" data-cat-id="snacks" role="button" tabindex="0">
          <img src="https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=300&fit=crop&q=80" alt="Snacks & Munchies" width="300" height="150" loading="lazy" />
          <div class="ptext">
            <h3>Snacks & Munchies</h3>
            <p>Chips, biscuits, namkeen & sweets</p>
            <span class="btn btn-secondary btn-sm" aria-hidden="true">Shop Snacks</span>
          </div>
        </div>
        <div class="promo-card" data-action="set-category" data-cat-id="fruits" role="button" tabindex="0">
          <img src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=600&h=300&fit=crop&q=80" alt="Organic Fruits" width="300" height="150" loading="lazy" />
          <div class="ptext">
            <h3>Farm Fresh Daily</h3>
            <p>Hand-picked seasonal fruits & veggies</p>
            <span class="btn btn-secondary btn-sm" aria-hidden="true">Explore Fresh</span>
          </div>
        </div>
      </section>

      <!-- Main Layout: Sidebar & Content Grid -->
      <div class="main-layout">
        <!-- Sticky Sidebar Navigation -->
        <aside class="sidebar" id="sidebar" aria-label="Categories">
          <div
            class="cat-item ${activeCatNormalized === 'all' ? 'active' : ''}"
            data-action="set-category"
            data-cat-id="all"
            role="button"
            tabindex="0"
          >
            <div class="cat-thumb">🛍️</div>
            <div class="cat-name">All Items</div>
          </div>
          ${displayCategories.map(
            (cat) => html`
              <div
                class="cat-item ${activeCatNormalized === String(cat.id).toLowerCase() ? 'active' : ''}"
                data-action="set-category"
                data-cat-id="${cat.id}"
                role="button"
                tabindex="0"
              >
                <div class="cat-thumb">${cat.emoji || cat.icon || '📦'}</div>
                <div class="cat-name">${cat.name}</div>
              </div>
            `
          )}
        </aside>

        <!-- Main Product Area -->
        <main class="content" id="mainContent">
          <!-- Chips Filter Bar -->
          <div class="chip-bar" id="chips">
            <span
              class="chip ${activeCatNormalized === 'all' ? 'active' : ''}"
              data-action="set-category"
              data-cat-id="all"
            >🛍️ All (${products.length})</span>
            ${displayCategories.map(
              (cat) => html`
                <span
                  class="chip ${activeCatNormalized === String(cat.id).toLowerCase() ? 'active' : ''}"
                  data-action="set-category"
                  data-cat-id="${cat.id}"
                >${cat.emoji || ''} ${cat.name}</span>
              `
            )}
          </div>

          <!-- Section Header -->
          <div class="sec-header">
            <h2 class="sec-title">${activeCatTitle}</h2>
            <div style="font-size:var(--text-xs); color:var(--text-muted); font-weight:600;">
              Showing ${filteredProducts.length} items
            </div>
          </div>

          <!-- Product Grid -->
          <div class="product-grid" id="productGrid">
            ${filteredProducts.length > 0
              ? filteredProducts.map((product) =>
                  rawHtml(renderProductCard(product, cartItemsMap.get(Number(product.id)) || 0))
                )
              : html`
                  <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-state-icon">🔍</div>
                    <div class="empty-state-title">No products found in this category</div>
                    <div class="empty-state-desc">Try selecting another category or clear your filter.</div>
                    <button class="btn btn-primary btn-sm" data-action="set-category" data-cat-id="all">
                      View All Products
                    </button>
                  </div>
                `}
          </div>

          <!-- Infinite Scroll Sentinel -->
          <div id="infiniteScrollSentinel" style="height:20px; width:100%;"></div>
        </main>
      </div>
    </div>
  `;
}
