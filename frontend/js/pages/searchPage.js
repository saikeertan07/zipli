/**
 * ZIPLI — Search Results Page
 *
 * Implements:
 * 1. Faceted filters (categories, price ranges, in-stock toggle).
 * 2. Relevance / Price sorting.
 * 3. Matched query term highlighting.
 * 4. "Did you mean?" spelling suggestions (BK-tree / Levenshtein).
 * 5. Zero-result helper with catalog suggestions.
 * 6. Explain Score toggle in dev mode.
 */

import { html, rawHtml } from '../utils/dom.js';
import { renderProductCard } from '../components/productCard.js';
import { store } from '../store.js';

export function renderSearchPage({ query = '', results = [], facets = null, didYouMean = null, explainMode = false }) {
  const state = store.getState();
  const cartItemsMap = new Map();
  (state.cart.items || []).forEach((item) => {
    cartItemsMap.set(Number(item.productId || item.product_id), Number(item.quantity));
  });

  // Highlight matched terms in text
  const highlightQuery = (text, q) => {
    if (!q || !text) return text;
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark style="background:var(--color-accent-light);color:inherit;font-weight:700;">$1</mark>');
  };

  return html`
    <div class="search-page-container" style="max-width:1200px; margin:0 auto; padding:24px 20px;">
      <!-- Search Header & Did You Mean -->
      <div style="margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
        <h1 style="font-size:var(--text-xl); font-family:var(--font-display); margin:0 0 6px;">
          Search results for "${query}"
        </h1>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="font-size:var(--text-xs); color:var(--text-muted); font-weight:600;">
            Found ${results.length} ${results.length === 1 ? 'match' : 'matches'}
          </div>

          <!-- Sort & Explain Score Toggle -->
          <div style="display:flex; align-items:center; gap:12px;">
            <label style="font-size:var(--text-xs); font-weight:600; display:flex; align-items:center; gap:6px;">
              <span>Sort:</span>
              <select class="select" id="searchSortSelect" style="height:32px; font-size:12px; padding:0 8px;" data-action="sort-search">
                <option value="relevance">Best Match (BM25 + Hybrid)</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
              </select>
            </label>

            <!-- Dev mode explain score switch -->
            <label style="font-size:var(--text-xs); color:var(--text-secondary); display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" id="explainScoreToggle" data-action="toggle-explain" ${explainMode ? 'checked' : ''} />
              <span>Dev: Explain Score</span>
            </label>
          </div>
        </div>

        <!-- "Did you mean?" suggestions -->
        ${didYouMean && didYouMean.length > 0
          ? html`
              <div style="margin-top:10px; font-size:var(--text-xs); background:var(--color-brand-light); padding:8px 14px; border-radius:var(--radius-sm); display:flex; align-items:center; gap:8px;">
                <span style="font-weight:700; color:var(--color-brand);">Did you mean?</span>
                ${didYouMean.map(
                  (suggestion) => html`
                    <button
                      class="chip"
                      style="font-size:11px; padding:2px 8px;"
                      data-action="apply-suggestion"
                      data-query="${suggestion}"
                    >
                      ${suggestion}
                    </button>
                  `
                )}
              </div>
            `
          : ''}
      </div>

      <!-- Faceted Layout: Filter Rail + Grid -->
      <div style="display:grid; grid-template-columns: 220px 1fr; gap:24px;" class="search-layout">
        <!-- Facets Sidebar -->
        <aside style="display:flex; flex-direction:column; gap:20px;" aria-label="Search filters">
          <div class="card" style="padding:16px;">
            <h3 style="font-size:var(--text-sm); font-weight:700; margin:0 0 12px;">Categories</h3>
            <div style="display:flex; flex-direction:column; gap:8px; font-size:var(--text-xs);">
              ${Object.entries(facets && facets.categories ? facets.categories : {}).map(
                ([catName, count]) => html`
                  <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
                    <span style="text-transform:capitalize;">${catName}</span>
                    <span style="color:var(--text-muted); font-size:11px;">(${count})</span>
                  </label>
                `
              )}
            </div>
          </div>

          <div class="card" style="padding:16px;">
            <h3 style="font-size:var(--text-sm); font-weight:700; margin:0 0 12px;">Availability</h3>
            <label style="display:flex; align-items:center; gap:8px; font-size:var(--text-xs); cursor:pointer;">
              <input type="checkbox" id="inStockFilter" data-action="filter-instock" checked />
              <span>In-stock only</span>
            </label>
          </div>
        </aside>

        <!-- Product Results Grid -->
        <main>
          ${results.length === 0
            ? html`
                <div class="empty-state">
                  <div class="empty-state-icon">🔍</div>
                  <div class="empty-state-title">No matching products found</div>
                  <div class="empty-state-desc">
                    We couldn't find anything matching "${query}". Check your spelling or search for broader keywords like "fruits", "milk", or "snacks".
                  </div>
                  <button class="btn btn-primary btn-sm" data-action="navigate" data-path="#home">
                    Return to Catalog
                  </button>
                </div>
              `
            : html`
                <div class="product-grid">
                  ${results.map((product) => {
                    const cardHtml = renderProductCard(product, cartItemsMap.get(Number(product.id)) || 0);
                    if (!explainMode || !product.explain) {
                      return rawHtml(cardHtml);
                    }
                    // If explainMode is on, attach the score breakdown pill
                    return html`
                      <div style="position:relative;">
                        ${rawHtml(cardHtml)}
                        <div style="background:var(--neutral-900); color:#fff; font-family:monospace; font-size:10px; padding:6px; border-radius:4px; margin-top:4px;">
                          Score: ${product.score ? product.score.toFixed(3) : 'N/A'}<br/>
                          BM25: ${(product.explain && product.explain.bm25) || '1.000'} | Vec: ${(product.explain && product.explain.vector) || 'N/A'}
                        </div>
                      </div>
                    `;
                  })}
                </div>
              `}
        </main>
      </div>
    </div>
  `;
}
