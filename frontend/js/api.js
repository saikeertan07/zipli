/**
 * ZIPLI PRO — Resilient API Client
 *
 * Implements:
 * 1. Exponential backoff retry on 5xx and transient network dropouts.
 * 2. AbortController signal support for fast UI cancellations.
 * 3. Automatic JWT refresh token rotation & silent retry on 401.
 * 4. X-Request-Id header propagation.
 */

import { storage } from './utils/storage.js';

export const API_BASE =
  window.ZIPLI_API_BASE ||
  (typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? `${window.location.protocol}//${window.location.host}/api`
    : 'https://zipli-backend.onrender.com/api');

let isRefreshing = false;
let refreshSubscribers = [];

function onRefreshed(newToken) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

function addRefreshSubscriber(callback) {
  refreshSubscribers.push(callback);
}

function generateRequestId() {
  return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export class ApiClient {
  constructor(baseUrl = API_BASE) {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}, retries = 2) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const token = storage.get('zipli_token');

    const headers = {
      'Content-Type': 'application/json',
      'X-Request-Id': generateRequestId(),
      ...(options.headers || {}),
    };

    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle 401 Unauthorized via Refresh Token Rotation
      if (response.status === 401 && !options._retry && !endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/login')) {
        const refreshToken = storage.get('zipli_refresh_token');

        if (refreshToken) {
          if (!isRefreshing) {
            isRefreshing = true;
            try {
              const refreshRes = await fetch(`${this.baseUrl}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
              });

              if (refreshRes.ok) {
                const refreshData = await refreshRes.json();
                const newAccessToken = refreshData.data.accessToken;
                const newRefreshToken = refreshData.data.refreshToken;

                storage.set('zipli_token', newAccessToken);
                if (newRefreshToken) storage.set('zipli_refresh_token', newRefreshToken);

                isRefreshing = false;
                onRefreshed(newAccessToken);
              } else {
                isRefreshing = false;
                storage.remove('zipli_token');
                storage.remove('zipli_refresh_token');
                storage.remove('zipli_user');
                window.dispatchEvent(new CustomEvent('zipli_auth_expired'));
              }
            } catch {
              isRefreshing = false;
            }
          }

          // Queue callers until refresh completes
          return new Promise((resolve, reject) => {
            addRefreshSubscriber(async (newToken) => {
              if (newToken) {
                options._retry = true;
                options.headers = { ...options.headers, Authorization: `Bearer ${newToken}` };
                try {
                  const retryRes = await this.request(endpoint, options, 0);
                  resolve(retryRes);
                } catch (err) {
                  reject(err);
                }
              } else {
                reject(new Error('Session expired'));
              }
            });
          });
        }
      }

      // Retry on 5xx errors with exponential backoff
      if (response.status >= 500 && retries > 0) {
        await new Promise((r) => setTimeout(r, 300 * (3 - retries)));
        return this.request(endpoint, options, retries - 1);
      }

      let data = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json().catch(() => null);
      } else {
        data = await response.text().catch(() => null);
      }

      if (!response.ok) {
        const message = (data && data.message) || `HTTP error ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw err;
      }
      // Transient network failure retry
      if (retries > 0 && (!err.status || err.status >= 500)) {
        await new Promise((r) => setTimeout(r, 400 * (3 - retries)));
        return this.request(endpoint, options, retries - 1);
      }
      throw err;
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  patch(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
