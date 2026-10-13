/**
 * @file route-security-audit.test.js
 * @description Automated Route Table Walker Test (F-011, SEC-AZ-01, SEC-AZ-04).
 * Walks Express router stack and fails if any route (except an explicit public allowlist)
 * lacks authorization checks or input schema validation.
 */

const app = require('../../src/app');

describe('Automated Route Table Security Audit (F-011, SEC-AZ-01, SEC-AZ-04)', () => {
  /**
   * Recursively walks Express router stack and returns flat list of mapped routes.
   */
  function walkRoutes(expressApp) {
    const results = [];

    function walk(stack, prefix = '', inheritedMiddlewares = []) {
      const routerMiddlewares = [...inheritedMiddlewares];

      // Collect router-level middlewares
      stack.forEach((layer) => {
        if (!layer.route && layer.name !== 'router' && typeof layer.handle === 'function') {
          routerMiddlewares.push(layer.handle);
        }
      });

      stack.forEach((layer) => {
        if (layer.route) {
          const routePath = prefix + layer.route.path;
          const methods = Object.keys(layer.route.methods);
          const routeMiddlewares = layer.route.stack.map((s) => s.handle);
          const allMiddlewares = [...routerMiddlewares, ...routeMiddlewares];

          methods.forEach((method) => {
            results.push({
              method: method.toUpperCase(),
              path: routePath,
              middlewares: allMiddlewares,
              hasAuth: allMiddlewares.some(
                (m) => m._isAuth || m.name === 'requireAuth' || m.name === 'requireRole' || m.name === 'authorize'
              ),
              hasAuthorize: allMiddlewares.some(
                (m) => m._isAuthorize || m._isRole || m.name === 'authorize' || m.name === 'requireRole'
              ),
              hasZod: allMiddlewares.some(
                (m) => m._isZodValidator || m.name === 'validateZod'
              ),
            });
          });
        } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
          let subPrefix = '';
          if (layer.regexp) {
            const s = layer.regexp.source
              .replace('^\\', '')
              .replace('\\/?(?=\\/|$)', '')
              .replace('(?=\\/|$)', '')
              .replace(/\\\//g, '/')
              .replace(/\^/g, '')
              .replace(/\$/g, '');
            subPrefix = s.startsWith('/') ? s : '/' + s;
          }
          walk(layer.handle.stack, prefix + subPrefix, routerMiddlewares);
        }
      });
    }

    walk(expressApp._router.stack);
    return results;
  }

  // Explicit public allow-list of unauthenticated / public endpoints
  const PUBLIC_ALLOW_LIST = [
    /^\/api(\/v1)?\/health(\/.*)?$/,
    /^\/health(\/.*)?$/,
    /^\/metrics$/,
    /^\/api(\/v1)?\/auth\/(csrf-token|login|register|refresh|logout)$/,
    /^\/api(\/v1)?\/auth\/otp\/(send|verify)$/,
    /^\/api(\/v1)?\/users\/addresses\/serviceability$/,
    /^\/api(\/v1)?\/categories(\/.*)?$/,
    /^\/api(\/v1)?\/products(\/.*)?$/,
    /^\/api(\/v1)?\/search(\/.*)?$/,
    /^\/search(\/.*)?$/,
    /^\/api(\/v1)?\/(recs|recommendations)(\/.*)?$/,
    /^\/recs(\/.*)?$/,
    /^\/api(\/v1)?\/events(\/.*)?$/,
    /^\/api(\/v1)?\/delivery(\/.*)?$/,
    /^\/delivery(\/.*)?$/,
    /^\/api(\/v1)?\/delivery-intel(\/.*)?$/,
    /^\/delivery-intel(\/.*)?$/,
    /^\/api(\/v1)?\/inventory(\/.*)?$/,
    /^\/inventory(\/.*)?$/,
    /^\/api(\/v1)?\/pricing(\/.*)?$/,
    /^\/pricing(\/.*)?$/,
    /^\/api(\/v1)?\/assistant(\/.*)?$/,
    /^\/api(\/v1)?\/payments\/webhook$/,
    /^(\*|\/\*)$/, // CORS options catch-all
  ];

  function isPublic(path) {
    return PUBLIC_ALLOW_LIST.some((re) => re.test(path));
  }

  let allRoutes;

  beforeAll(() => {
    allRoutes = walkRoutes(app);
  });

  it('successfully discovers and indexes all mounted routes', () => {
    expect(allRoutes.length).toBeGreaterThan(50);
  });

  it('asserts EVERY private route mounts authentication and authorization checks (F-011)', () => {
    const privateRoutes = allRoutes.filter((r) => !isPublic(r.path));
    expect(privateRoutes.length).toBeGreaterThan(0);

    const unprotected = privateRoutes.filter((r) => !r.hasAuth || !r.hasAuthorize);

    if (unprotected.length > 0) {
      const details = unprotected.map((r) => `${r.method} ${r.path}`);
      throw new Error(
        `F-011 Route Audit Violation: Found ${unprotected.length} private route(s) lacking authorization:\n` +
          details.join('\n')
      );
    }

    expect(unprotected).toHaveLength(0);
  });

  it('asserts sensitive user mutations mount Zod schemas or strict authorization', () => {
    const sensitiveMutations = allRoutes.filter(
      (r) =>
        ['POST', 'PATCH', 'PUT'].includes(r.method) &&
        (r.path.includes('/cart') ||
          r.path.includes('/orders') ||
          r.path.includes('/admin/products') ||
          r.path.includes('/admin/inventory') ||
          r.path.includes('/admin/orders') ||
          r.path.includes('/admin/queues/dispatch') ||
          r.path.includes('/security/audit-logs') ||
          r.path.includes('/security/fraud-queue'))
    );

    expect(sensitiveMutations.length).toBeGreaterThan(0);

    const missingZod = sensitiveMutations.filter((r) => !r.hasZod);

    if (missingZod.length > 0) {
      const details = missingZod.map((r) => `${r.method} ${r.path}`);
      throw new Error(
        `F-011 Zod Audit Violation: Found ${missingZod.length} mutation route(s) lacking Zod schema:\n` +
          details.join('\n')
      );
    }

    expect(missingZod).toHaveLength(0);
  });

  it('fails if any unexpected private route exists outside the allowlist without authorization', () => {
    const unauthenticatedPrivateRoutes = allRoutes.filter(
      (r) => !isPublic(r.path) && !r.hasAuth
    );
    expect(unauthenticatedPrivateRoutes).toHaveLength(0);
  });
});
