describe('Frontend Reactive Store Unit Tests (F-024)', () => {
  let Store;
  let initialState;

  beforeAll(async () => {
    global.window = {
      matchMedia: () => ({ matches: false }),
      location: { hostname: 'localhost', port: '5555', protocol: 'http:' },
      addEventListener: () => {},
    };
    global.document = {
      documentElement: {
        setAttribute: jest.fn(),
      },
    };
    global.navigator = { onLine: true };
    global.localStorage = {
      _data: {},
      getItem(k) {
        return this._data[k] || null;
      },
      setItem(k, v) {
        this._data[k] = String(v);
      },
      removeItem(k) {
        delete this._data[k];
      },
      clear() {
        this._data = {};
      },
    };

    const storeModule = await import('../../../frontend/js/store.js');
    Store = storeModule.Store;
    initialState = storeModule.initialState;
  });

  beforeEach(() => {
    global.localStorage.clear();
    jest.clearAllMocks();
  });

  it('initializes with default state values', () => {
    const testStore = new Store(initialState);
    const state = testStore.getState();

    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.categories).toEqual([]);
    expect(state.products).toEqual([]);
    expect(state.cart.items).toEqual([]);
    expect(state.cartDrawerOpen).toBe(false);
    expect(state.assistantDrawerOpen).toBe(false);
    expect(state.isOffline).toBe(false);
  });

  it('updates state and notifies subscribers on setState', () => {
    const testStore = new Store(initialState);
    const listener = jest.fn();

    const unsubscribe = testStore.subscribe(listener);
    // Immediate callback with initial state
    expect(listener).toHaveBeenCalledTimes(1);

    testStore.setState({ searchQuery: 'organic mango' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(testStore.getState().searchQuery).toBe('organic mango');

    // Unsubscribe should cease notifications
    unsubscribe();
    testStore.setState({ searchQuery: 'fresh banana' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('sets and removes user sessions with localStorage synchronization', () => {
    const testStore = new Store(initialState);
    const mockUser = { id: 10, name: 'Aarav Patel', role: 'customer' };
    const mockToken = 'jwt_access_token_123';
    const mockRefresh = 'refresh_token_456';

    testStore.setUser(mockUser, mockToken, mockRefresh);
    expect(testStore.getState().user).toEqual(mockUser);
    expect(testStore.getState().token).toBe(mockToken);
    expect(JSON.parse(global.localStorage.getItem('zipli_token'))).toBe(mockToken);

    // Logout
    testStore.logout();
    expect(testStore.getState().user).toBeNull();
    expect(testStore.getState().token).toBeNull();
    expect(testStore.getState().cart.items).toEqual([]);
    expect(global.localStorage.getItem('zipli_token')).toBeNull();
  });

  it('toggles cart and mutually closes assistant drawer', () => {
    const testStore = new Store(initialState);

    // Open assistant first
    testStore.toggleAssistant(true);
    expect(testStore.getState().assistantDrawerOpen).toBe(true);
    expect(testStore.getState().cartDrawerOpen).toBe(false);

    // Opening cart should auto-close assistant drawer
    testStore.toggleCart(true);
    expect(testStore.getState().cartDrawerOpen).toBe(true);
    expect(testStore.getState().assistantDrawerOpen).toBe(false);

    // Toggling cart closed
    testStore.toggleCart(false);
    expect(testStore.getState().cartDrawerOpen).toBe(false);
  });

  it('updates theme and sets data-theme attribute on documentElement', () => {
    const testStore = new Store(initialState);

    testStore.setTheme('dark');
    expect(testStore.getState().theme).toBe('dark');
    expect(global.document.documentElement.setAttribute).toHaveBeenCalledWith(
      'data-theme',
      'dark'
    );
    expect(JSON.parse(global.localStorage.getItem('zipli_theme'))).toBe('dark');
  });

  it('appends assistant messages reactively', () => {
    const testStore = new Store(initialState);
    const initialCount = testStore.getState().assistantMessages.length;

    testStore.addAssistantMessage({
      role: 'user',
      text: 'Find healthy breakfast options',
      timestamp: Date.now(),
    });

    const messages = testStore.getState().assistantMessages;
    expect(messages).toHaveLength(initialCount + 1);
    expect(messages[messages.length - 1].text).toBe('Find healthy breakfast options');
  });

  it('unpacks nested cart payloads correctly in setCart', () => {
    const testStore = new Store(initialState);
    const mockCart = {
      items: [{ product_id: 1, quantity: 2, price: 50 }],
      itemCount: 2,
      itemTotal: 100,
      grandTotal: 125,
    };

    // Accepts direct cart object
    testStore.setCart(mockCart);
    expect(testStore.getState().cart.itemTotal).toBe(100);

    // Accepts nested data.cart object from backend API
    testStore.setCart({ data: { cart: { ...mockCart, itemTotal: 250 } } });
    expect(testStore.getState().cart.itemTotal).toBe(250);
  });

  it('handles offline status changes', () => {
    const testStore = new Store(initialState);

    testStore.setOffline(true);
    expect(testStore.getState().isOffline).toBe(true);

    testStore.setOffline(false);
    expect(testStore.getState().isOffline).toBe(false);
  });
});
