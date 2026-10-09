/**
 * ZIPLI PRO — Client-Side Hash Router
 *
 * Hash router with route parameters, query string parsing,
 * auth & role guards, and View Transitions API support.
 */

import { store } from './store.js';

export class Router {
  constructor() {
    this.routes = [];
    this.currentRoute = null;
    this.currentParams = {};
    this.currentQuery = {};
    this.beforeEachHooks = [];

    window.addEventListener('hashchange', () => this._handleHashChange());
  }

  on(pattern, handler, options = {}) {
    // Convert pattern like '#product/:id' to regex
    const paramNames = [];
    const regexPattern = pattern
      .replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/?#]+)';
      })
      .replace(/\//g, '\\/');

    const regex = new RegExp(`^${regexPattern}(?:\\?(.*))?$`);
    this.routes.push({ pattern, regex, paramNames, handler, options });
    return this;
  }

  beforeEach(hook) {
    this.beforeEachHooks.push(hook);
    return this;
  }

  navigate(hash) {
    window.location.hash = hash.startsWith('#') ? hash : `#${hash}`;
  }

  start() {
    if (!window.location.hash) {
      if (window.location.pathname.includes('admin')) {
        window.location.hash = '#admin';
      } else {
        window.location.hash = '#home';
      }
    } else {
      this._handleHashChange();
    }
  }

  async _handleHashChange() {
    const fullHash = window.location.hash || '#home';
    const [pathPart, queryPart] = fullHash.split('?');

    // Parse query params
    const query = {};
    if (queryPart) {
      const searchParams = new URLSearchParams(queryPart);
      for (const [key, val] of searchParams.entries()) {
        query[key] = val;
      }
    }

    let matched = null;
    let params = {};

    for (const route of this.routes) {
      const match = pathPart.match(route.regex);
      if (match) {
        matched = route;
        route.paramNames.forEach((name, index) => {
          params[name] = decodeURIComponent(match[index + 1]);
        });
        break;
      }
    }

    if (!matched) {
      // Default to home if route not found
      this.navigate('#home');
      return;
    }

    // Run beforeEach guards
    for (const hook of this.beforeEachHooks) {
      const allowed = await hook(matched, params, query);
      if (allowed === false) return;
      if (typeof allowed === 'string') {
        this.navigate(allowed);
        return;
      }
    }

    // Role and Auth guards
    const state = store.getState();
    if (matched.options.requiresAuth && !state.user) {
      // Prompt auth modal and redirect to home
      window.dispatchEvent(new CustomEvent('zipli_open_auth_modal', { detail: { redirect: fullHash } }));
      this.navigate('#home');
      return;
    }

    if (matched.options.requiresAdmin && (!state.user || state.user.role !== 'admin')) {
      this.navigate('#home');
      return;
    }

    this.currentRoute = matched;
    this.currentParams = params;
    this.currentQuery = query;

    // View Transitions API
    const render = () => matched.handler({ params, query, path: pathPart });
    if (document.startViewTransition) {
      document.startViewTransition(() => render());
    } else {
      render();
    }

    // Scroll to top on navigation
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

export const router = new Router();
