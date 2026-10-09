/**
 * ZIPLI PRO — Reactive Pub/Sub Store
 *
 * Ultra-lightweight state manager with reactive subscribers.
 */

import { storage } from './utils/storage.js';

const initialTheme = storage.get('zipli_theme') ||
  (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

const initialState = {
  user: storage.get('zipli_user', null),
  token: storage.get('zipli_token', null),
  theme: initialTheme,
  categories: [],
  products: [],
  activeCategory: 'all',
  searchQuery: '',
  searchFacets: null,
  cart: {
    items: [],
    itemCount: 0,
    itemTotal: 0,
    deliveryFee: 25,
    grandTotal: 25,
    coupon: null,
    discountAmount: 0,
  },
  cartDrawerOpen: false,
  assistantDrawerOpen: false,
  activeReservation: null,
  activeOrder: null,
  isOffline: !navigator.onLine,
  assistantMessages: [
    {
      role: 'assistant',
      text: 'Hi! I am Zipli Pro AI. Looking for fresh groceries or meal recipe ingredients? Ask me anything!',
      chips: ['Plan Italian Pasta dinner', 'Find high-protein snacks', 'Fresh fruits under ₹100'],
      timestamp: Date.now(),
    },
  ],
  assistantStreaming: false,
  conversationId: null,
  aiDegraded: false,
  reorders: [],
  userAddresses: [],
};

class Store {
  constructor(state) {
    this.state = state;
    this.subscribers = new Set();
  }

  getState() {
    return this.state;
  }

  setState(partial) {
    const prevState = this.state;
    this.state = { ...this.state, ...partial };
    this._notify(prevState);
  }

  subscribe(listener) {
    this.subscribers.add(listener);
    // Immediate callback with current state
    listener(this.state, this.state);
    return () => this.subscribers.delete(listener);
  }

  _notify(prevState) {
    for (const listener of this.subscribers) {
      try {
        listener(this.state, prevState);
      } catch (err) {
        console.error('Store subscriber error:', err);
      }
    }
  }

  // Action helpers
  setUser(user, token, refreshToken = null) {
    if (user && token) {
      storage.set('zipli_user', user);
      storage.set('zipli_token', token);
      if (refreshToken) storage.set('zipli_refresh_token', refreshToken);
      this.setState({ user, token });
    } else {
      storage.remove('zipli_user');
      storage.remove('zipli_token');
      storage.remove('zipli_refresh_token');
      this.setState({ user: null, token: null });
    }
  }

  logout() {
    this.setUser(null, null);
    this.setState({
      cart: {
        items: [],
        itemCount: 0,
        itemTotal: 0,
        deliveryFee: 25,
        grandTotal: 25,
        coupon: null,
      },
      activeReservation: null,
      activeOrder: null,
    });
  }

  setTheme(theme) {
    storage.set('zipli_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.setState({ theme });
  }

  setCart(cart) {
    const actualCart = cart?.data?.cart || cart?.cart || cart || {};
    this.setState({ cart: actualCart });
  }

  setCatalog(categories, products) {
    this.setState({ categories, products });
  }

  setActiveCategory(activeCategory) {
    this.setState({ activeCategory });
  }

  setSearchQuery(searchQuery) {
    this.setState({ searchQuery });
  }

  setReservation(activeReservation) {
    this.setState({ activeReservation });
  }

  setActiveOrder(activeOrder) {
    this.setState({ activeOrder });
  }

  toggleCart(force = null) {
    const cartDrawerOpen = force !== null ? force : !this.state.cartDrawerOpen;
    this.setState({
      cartDrawerOpen,
      assistantDrawerOpen: cartDrawerOpen ? false : this.state.assistantDrawerOpen,
    });
  }

  toggleAssistant(force = null) {
    const assistantDrawerOpen = force !== null ? force : !this.state.assistantDrawerOpen;
    this.setState({
      assistantDrawerOpen,
      cartDrawerOpen: assistantDrawerOpen ? false : this.state.cartDrawerOpen,
    });
  }

  addAssistantMessage(msg) {
    this.setState({
      assistantMessages: [...this.state.assistantMessages, msg],
    });
  }

  updateLastAssistantMessage(partial) {
    const messages = [...this.state.assistantMessages];
    if (messages.length > 0) {
      messages[messages.length - 1] = { ...messages[messages.length - 1], ...partial };
      this.setState({ assistantMessages: messages });
    }
  }

  setConversationId(conversationId) {
    this.setState({ conversationId });
  }

  setAiDegraded(aiDegraded) {
    this.setState({ aiDegraded });
  }

  setReorders(reorders) {
    this.setState({ reorders });
  }

  setUserAddresses(userAddresses) {
    this.setState({ userAddresses });
  }

  setAssistantStreaming(assistantStreaming) {
    this.setState({ assistantStreaming });
  }

  setOffline(isOffline) {
    this.setState({ isOffline });
  }
}

export const store = new Store(initialState);
export { Store, initialState };

// Sync online/offline events automatically
window.addEventListener('online', () => store.setOffline(false));
window.addEventListener('offline', () => store.setOffline(true));

// Initialize theme on DOM root
document.documentElement.setAttribute('data-theme', initialTheme);
