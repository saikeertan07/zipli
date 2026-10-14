describe('Frontend ApiClient Unit Tests (F-024)', () => {
  let ApiClient;
  let API_BASE;
  let originalFetch;

  beforeAll(async () => {
    global.window = {
      matchMedia: () => ({ matches: false }),
      location: {
        hostname: 'localhost',
        port: '5555',
        protocol: 'http:',
        host: 'localhost:5555',
      },
      addEventListener: () => {},
      dispatchEvent: jest.fn(),
    };
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

    originalFetch = global.fetch;

    const apiModule = await import('../../../frontend/js/api.js');
    ApiClient = apiModule.ApiClient;
    API_BASE = apiModule.API_BASE;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    global.localStorage.clear();
    jest.clearAllMocks();
  });

  it('constructs with dynamic API_BASE matching current host', () => {
    expect(API_BASE).toBe('http://localhost:5555/api');
    const client = new ApiClient();
    expect(client.baseUrl).toBe('http://localhost:5555/api');
  });

  it('performs GET request with auto-generated X-Request-Id header', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (h) => (h === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({ status: 'success', data: [{ id: 1, name: 'Banana' }] }),
    });

    const client = new ApiClient();
    const result = await client.get('/products');

    expect(result.status).toBe('success');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [calledUrl, calledOptions] = global.fetch.mock.calls[0];
    expect(calledUrl).toBe('http://localhost:5555/api/products');
    expect(calledOptions.method).toBe('GET');
    expect(calledOptions.headers['X-Request-Id']).toMatch(/^req_/);
    expect(calledOptions.headers['Content-Type']).toBe('application/json');
  });

  it('automatically attaches Bearer authorization header from storage', async () => {
    global.localStorage.setItem('zipli_token', JSON.stringify('access_token_xyz_999'));

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ status: 'success', data: { id: 1 } }),
    });

    const client = new ApiClient();
    await client.get('/users/me');

    const [_url, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer access_token_xyz_999');
  });

  it('serializes JSON payload on POST, PUT, and DELETE', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ status: 'success' }),
    });

    const client = new ApiClient();

    // POST
    await client.post('/cart/items', { productId: 42, quantity: 2 });
    const postCall = global.fetch.mock.calls[0];
    expect(postCall[1].method).toBe('POST');
    expect(postCall[1].body).toBe(JSON.stringify({ productId: 42, quantity: 2 }));

    // PUT
    await client.put('/cart/items', { productId: 42, quantity: 5 });
    const putCall = global.fetch.mock.calls[1];
    expect(putCall[1].method).toBe('PUT');
    expect(putCall[1].body).toBe(JSON.stringify({ productId: 42, quantity: 5 }));

    // DELETE
    await client.delete('/cart/items/42');
    const deleteCall = global.fetch.mock.calls[2];
    expect(deleteCall[1].method).toBe('DELETE');
  });

  it('retries on 500 server error with exponential backoff', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 2) {
        return {
          ok: false,
          status: 502,
          headers: { get: () => 'application/json' },
          json: async () => ({ message: 'Bad Gateway' }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ status: 'success', data: 'recovered' }),
      };
    });

    const client = new ApiClient();
    const result = await client.get('/products');

    expect(result.data).toBe('recovered');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws structured error on non-retryable 4xx client errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      json: async () => ({ message: 'Invalid product quantity' }),
    });

    const client = new ApiClient();
    await expect(client.post('/cart/items', { quantity: -5 })).rejects.toThrow(
      'Invalid product quantity'
    );
  });
});
