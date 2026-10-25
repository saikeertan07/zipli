/**
 * ZIPLI — Service Worker Cache Hygiene & Privacy Engine (F-023, SEC-AUTH-04)
 *
 * Enforces strict cache isolation ensuring that:
 * 1. Authenticated API responses with personal data (PII) are NEVER cached.
 * 2. Auth and payment endpoints are NEVER cached.
 * 3. Responses with Set-Cookie or Cache-Control: no-store/private are NEVER cached.
 * 4. Only public static assets and anonymous catalog read endpoints are eligible.
 */

const NEVER_CACHE_URL_PATTERNS = [
  /\/api\/auth\//i,
  /\/api\/users?\//i,
  /\/api\/cart\//i,
  /\/api\/orders?\//i,
  /\/api\/admin\//i,
  /\/api\/security\//i,
  /\/api\/payments?\//i,
  /\/api\/notifications\//i,
  /\/api\/events\//i,
  /\/api\/sse\//i,
];

const ALLOWED_API_CACHE_PATTERNS = [
  /\/api(\/v1)?\/products(\/.*)?$/i,
  /\/api(\/v1)?\/categories(\/.*)?$/i,
];

/**
 * Determines whether a given request is eligible for service worker caching.
 *
 * @param {Request|Object} request - Fetch request object or mock with { method, url, headers }
 * @returns {boolean}
 */
function isRequestCacheable(request) {
  if (!request || !request.url) return false;

  // Rule 1: Only safe GET requests can be cached
  const method = (request.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    return false;
  }

  // Rule 2: Never cache requests with credentials / Authorization header
  const authHeader =
    typeof request.headers?.get === 'function'
      ? request.headers.get('Authorization')
      : request.headers?.Authorization || request.headers?.authorization;
  if (authHeader) {
    return false;
  }

  const urlStr = typeof request.url === 'string' ? request.url : String(request.url);
  const urlPath = urlStr.replace(/^https?:\/\/[^/]+/i, '');

  // Rule 3: Never cache sensitive API endpoints (auth, cart, orders, users, admin, payments)
  for (const pattern of NEVER_CACHE_URL_PATTERNS) {
    if (pattern.test(urlPath)) {
      return false;
    }
  }

  // Rule 4: If it is an API route, only explicitly allowlisted catalog reads are permitted
  if (urlPath.startsWith('/api/')) {
    return ALLOWED_API_CACHE_PATTERNS.some((pattern) => pattern.test(urlPath));
  }

  // App shell static files (HTML, CSS, JS, images, fonts) are cacheable
  return true;
}

/**
 * Validates whether a network response is safe to store in the cache.
 *
 * @param {Response|Object} response - Fetch response object or mock with { status, headers }
 * @returns {boolean}
 */
function isResponseCacheable(response) {
  if (!response) return false;

  // Only successful responses can be cached
  if (response.status !== 200) {
    return false;
  }

  // Inspect headers for Cache-Control and Set-Cookie
  const getHeader = (name) => {
    if (typeof response.headers?.get === 'function') {
      return response.headers.get(name);
    }
    return response.headers?.[name] || response.headers?.[name.toLowerCase()];
  };

  const cacheControl = (getHeader('Cache-Control') || '').toLowerCase();
  if (cacheControl.includes('no-store') || cacheControl.includes('private')) {
    return false;
  }

  const setCookie = getHeader('Set-Cookie');
  if (setCookie) {
    return false;
  }

  return true;
}

/**
 * Prunes outdated cache keys, preserving only the current active version.
 *
 * @param {string[]} cacheKeys - List of available cache names in CacheStorage
 * @param {string} currentCacheName - Active cache version string
 * @returns {string[]} Keys that must be purged
 */
function getStaleCacheKeys(cacheKeys, currentCacheName) {
  if (!Array.isArray(cacheKeys)) return [];
  return cacheKeys.filter((key) => key !== currentCacheName);
}

// Module exports for Node tests & ES module browser support
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isRequestCacheable,
    isResponseCacheable,
    getStaleCacheKeys,
    NEVER_CACHE_URL_PATTERNS,
    ALLOWED_API_CACHE_PATTERNS,
  };
}

if (typeof self !== 'undefined') {
  self.swCachePolicy = {
    isRequestCacheable,
    isResponseCacheable,
    getStaleCacheKeys,
  };
}
