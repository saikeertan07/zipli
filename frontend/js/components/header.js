/**
 * ZIPLI — Header & Navigation Component
 *
 * Implements:
 * 1. Sticky navigation with brand logo.
 * 2. Capacity-aware Delivery ETA chip.
 * 3. Command-palette style search with Trie prefix auto-suggestions.
 * 4. Dark/Light mode theme toggle.
 * 5. Cart count trigger and User Account / Auth dropdown.
 */

import { html } from '../utils/dom.js';
import { store } from '../store.js';

export function renderHeader(state) {
  const { user, cart, theme } = state;
  const itemCount = cart.itemCount || 0;
  const isDark = theme === 'dark';

  return html`
    <header class="navbar" role="banner">
      <a class="logo" href="#home" data-action="navigate" data-path="#home" aria-label="Zipli Home">
        <div class="logo-icon">⚡</div>
        <div class="logo-text">zip<span>li</span></div>
      </a>

      <div class="delivery-wrap" data-action="open-address-modal" role="button" tabindex="0" aria-label="Delivery location selector">
        <div class="d-top">Delivery in <em>10 mins</em> ▾</div>
        <div class="d-addr">Hyderabad, Telangana 500068, India</div>
      </div>

      <div class="search-box">
        <span class="si" aria-hidden="true">🔍</span>
        <input
          type="search"
          id="searchInput"
          class="input has-icon"
          placeholder='Search for "milk", "avocado", "bread"...'
          autocomplete="off"
          aria-label="Search catalog"
          data-action="search-input"
          value="${state.searchQuery || ''}"
        />
        <div class="search-suggestions-dropdown" id="searchSuggestions" style="display:none;" role="listbox"></div>
      </div>

      <div class="nav-actions">
        <!-- Theme Toggle -->
        <button class="icon-btn" data-action="toggle-theme" title="Toggle theme" aria-label="Toggle theme">
          ${isDark ? '☀️' : '🌙'}
        </button>

        <!-- AI Assistant Trigger (Hidden on mobile where floating button is used) -->
        <button class="btn btn-outline btn-sm hide-mobile" data-action="toggle-assistant" aria-label="Open AI Assistant">
          ✨ Assistant
        </button>

        <!-- Auth / User Menu -->
        <div id="authArea">
          ${user
            ? html`
                <div class="user-menu-wrap">
                  <button class="btn btn-secondary btn-sm" data-action="toggle-user-menu" aria-label="User Account Menu" aria-haspopup="true">
                    👤 ${user.name.split(' ')[0]} ▾
                  </button>
                  <div class="user-dropdown" id="userDropdown" style="display:none;">
                    <a href="#account" class="dropdown-item">My Account & Orders</a>
                    ${user.role === 'admin'
                      ? html`<a href="#admin" class="dropdown-item" style="color:var(--color-brand);font-weight:700;">Admin Dashboard</a>`
                      : ''}
                    <a href="styleguide.html" class="dropdown-item">Styleguide (18 UI Specs)</a>
                    <hr style="margin:4px 0; border:none; border-top:1px solid var(--border-subtle);" />
                    <button class="dropdown-item danger" data-action="logout">Log Out</button>
                  </div>
                </div>
              `
            : html`
                <button class="btn btn-secondary btn-sm" data-action="open-auth-modal">
                  Login
                </button>
              `}
        </div>

        <!-- Cart Trigger -->
        <button class="btn-cart" data-action="toggle-cart" aria-label="My Cart, ${itemCount} items">
          🛒 <span class="hide-mobile">My Cart</span>
          <span class="cart-num" id="cartCount">${itemCount}</span>
        </button>
      </div>
    </header>
  `;
}
