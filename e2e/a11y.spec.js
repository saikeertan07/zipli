// @ts-check
const { test, expect } = require('../backend/node_modules/@playwright/test');
const AxeBuilder = require('../backend/node_modules/@axe-core/playwright').default;

test.describe('Accessibility & Keyboard Navigation (F-025, SEC-IO-02)', () => {
  const PAGES_TO_AUDIT = [
    { name: 'Home Page', path: '/' },
    { name: 'Search Results Page', path: '/#search?q=fruit' },
    { name: 'Order Checkout Page', path: '/#checkout' },
    { name: 'Operations Admin Portal', path: '/#admin' },
    { name: 'Design System Styleguide', path: '/styleguide.html' },
    { name: 'Admin Shell Page', path: '/admin.html' },
    { name: 'Privacy Policy Page', path: '/#privacy' },
    { name: 'Terms of Service Page', path: '/#terms' },
  ];

  for (const pageConfig of PAGES_TO_AUDIT) {
    test(`Axe Core A11y Audit: ${pageConfig.name} has 0 serious or critical violations`, async ({ page }) => {
      await page.goto(pageConfig.path);
      await page.waitForTimeout(600);

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .analyze();

      const seriousOrCritical = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
      );

      if (seriousOrCritical.length > 0) {
        console.error(
          `A11y Violations on ${pageConfig.name}:`,
          JSON.stringify(
            seriousOrCritical.map((v) => ({
              id: v.id,
              impact: v.impact,
              description: v.description,
              nodes: v.nodes.length,
            })),
            null,
            2
          )
        );
      }

      expect(seriousOrCritical).toEqual([]);
    });
  }

  test('Keyboard-Only E2E Navigation: Search -> Cart -> Checkout without pointer', async ({ page }) => {
    // 0. Register authenticated shopper session
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const regRes = await page.request.post('/api/auth/register', {
      data: {
        name: 'Keyboard Shopper',
        email: `kb_${uniqueSuffix}@example.com`,
        password: 'Password123!',
      },
    });
    const regJson = await regRes.json();
    const token = regJson.data?.token || regJson.token;
    const user = regJson.data?.user || regJson.user;

    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('zipli_token', JSON.stringify(token));
      localStorage.setItem('zipli_user', JSON.stringify(user));
    }, { token, user });

    await page.goto('/');

    // 1. Tab into search input
    const searchInput = page.locator('#searchInput');
    await searchInput.focus();
    await expect(searchInput).toBeFocused();

    // 2. Type query and submit via Enter
    await page.keyboard.type('apple');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/.*#search\?q=apple/);
    await expect(page.locator('.search-page-container')).toBeVisible();

    // 3. Tab to the first Add to Cart button and trigger with Enter/Space
    const addBtn = page.locator('[data-action="add-to-cart"]').first();
    await expect(addBtn).toBeVisible();
    await addBtn.focus();
    await expect(addBtn).toBeFocused();
    await page.keyboard.press('Enter');

    // Verify cart count updated to 1
    await expect(page.locator('#cartCount')).toHaveText('1');

    // 4. Navigate to cart trigger button and open cart via Enter
    const cartToggleBtn = page.locator('[data-action="toggle-cart"]');
    await cartToggleBtn.focus();
    await expect(cartToggleBtn).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.locator('#cartDrawer')).toBeVisible();

    // 5. Navigate to proceed to checkout button inside drawer and press Enter
    const checkoutBtn = page.locator('[data-action="proceed-to-checkout"]');
    await checkoutBtn.focus();
    await expect(checkoutBtn).toBeFocused();
    await page.keyboard.press('Enter');

    // 6. Verify checkout page is reached solely via keyboard
    await expect(page).toHaveURL(/.*#checkout/);
    await expect(page.locator('h1')).toContainText('Checkout & Delivery Details');
  });
});
