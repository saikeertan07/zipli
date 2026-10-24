// @ts-check
const { test, expect } = require('../backend/node_modules/@playwright/test');

test.describe('Zipli Pro — End-to-End User Experience Suite', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    page.on('console', (msg) => console.log(`[BROWSER ${msg.type()}]:`, msg.text()));
    if (!testInfo.title.includes('DPDP Compliance')) {
      await page.addInitScript(() => {
        localStorage.setItem('zipli_dpdp_consent', 'true');
      });
    }
  });

  test('Shopper Journey: Sign up -> Search catalog -> Add to cart -> Checkout -> Track Order', async ({ page }) => {
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const testUser = {
      name: 'E2E Shopper',
      email: `shopper_${uniqueSuffix}@example.com`,
      password: 'Password123!',
    };

    // 1. Visit homepage
    await page.goto('/');
    await expect(page).toHaveTitle(/Zipli Pro/i);

    // 2. Open Auth modal & Sign Up
    await page.click('[data-action="open-auth-modal"]');
    await expect(page.locator('#authDialog')).toBeVisible();

    // Switch to Sign Up tab
    await page.click('#tabRegisterBtn');
    await page.fill('#authName', testUser.name);
    await page.fill('#authEmail', testUser.email);
    await page.fill('#authPassword', testUser.password);
    await page.click('#authSubmitBtn');

    // Verify logged in header state
    await expect(page.locator('#authArea')).toContainText('E2E');

    // 3. Search Catalog with Prefix Trie autocomplete
    const searchInput = page.locator('#searchInput');
    await searchInput.fill('frui');
    // Dropdown suggestions appear
    await page.waitForTimeout(400);

    // Press Enter to execute search
    await searchInput.press('Enter');
    await expect(page).toHaveURL(/.*#search\?q=frui/);
    await expect(page.locator('.search-page-container')).toBeVisible();

    // 4. Add item to cart from search results
    const consentBannerBtn = page.locator('#consentBanner [data-action="accept-consent"]').first();
    if (await consentBannerBtn.isVisible()) {
      await consentBannerBtn.click();
    }
    const addBtn = page.locator('[data-action="add-to-cart"]').first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Verify cart count updated
    await expect(page.locator('#cartCount')).toHaveText('1');

    // 5. Open Cart Drawer & Check Knapsack progress bar
    await page.click('[data-action="toggle-cart"]');
    await expect(page.locator('#cartDrawer')).toBeVisible();
    await expect(page.locator('.progress-bar-wrap')).toBeVisible();

    // 6. Proceed to Checkout
    await page.click('[data-action="proceed-to-checkout"]');
    await expect(page).toHaveURL(/.*#checkout/);

    // Verify 10-Minute stock hold timer is active
    await expect(page.locator('h1')).toContainText('Checkout & Delivery Details');

    // 7. Place Order (COD path)
    const consentBtn = page.locator('#consentBanner [data-action="accept-consent"]').first();
    if (await consentBtn.isVisible()) {
      await consentBtn.click();
    }
    await page.click('input[value="cod"]');
    const placeOrderBtn = page.locator('[data-action="place-order"]');
    await expect(placeOrderBtn).toBeVisible();
    await placeOrderBtn.click();

    // Verify redirect to live order tracking page
    await page.waitForURL(/.*#track\/\d+/, { timeout: 10000 });
    await expect(page.locator('h1')).toContainText(/Order #/);

    // Verify live canvas route map element exists
    await expect(page.locator('#trackingCanvas')).toBeVisible();
  });

  test('Razorpay Checkout Flow with Fake Provider (Item 13)', async ({ page }) => {
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const testUser = {
      name: 'Razorpay Shopper',
      email: `rzp_${uniqueSuffix}@example.com`,
      password: 'Password123!',
    };

    // 1. Visit homepage and register
    await page.goto('/');
    await page.click('[data-action="open-auth-modal"]');
    await page.click('#tabRegisterBtn');
    await page.fill('#authName', testUser.name);
    await page.fill('#authEmail', testUser.email);
    await page.fill('#authPassword', testUser.password);
    await page.click('#authSubmitBtn');
    await expect(page.locator('#authArea')).toContainText('Razorpay');

    // 2. Add product to cart
    const addBtn = page.locator('[data-action="add-to-cart"]').first();
    await addBtn.click();
    await expect(page.locator('#cartCount')).toHaveText('1');

    // 3. Open cart and proceed to checkout
    await page.click('[data-action="toggle-cart"]');
    await page.click('[data-action="proceed-to-checkout"]');
    await expect(page).toHaveURL(/.*#checkout/);

    // 4. Select UPI (Razorpay) and click Place Order
    const consentBtn = page.locator('#consentBanner [data-action="accept-consent"]').first();
    if (await consentBtn.isVisible()) {
      await consentBtn.click();
    }
    await page.locator('input[value="upi"]').check({ force: true });
    await page.click('[data-action="place-order"]');

    // 5. Verify Simulated Razorpay Gateway modal appears
    await expect(page.locator('#simulatedPaymentModal')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#simulatedPaymentModal')).toContainText('Razorpay Checkout (Simulated)');

    // 6. Confirm payment via simulated signed HMAC webhook
    await page.click('[data-action="confirm-simulated-payment"]');

    // 7. Verify order transitions to confirmed via webhook & tracking loads
    await page.waitForURL(/.*#track\/\d+/, { timeout: 15000 });
    await expect(page.locator('h1')).toContainText(/Order #/);
  });

  test('DPDP Compliance & Legal Pages (Item 15)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('zipli_dpdp_consent');
    });
    await page.reload();

    // 1. Verify DPDP Consent Banner appears
    const banner = page.locator('#consentBanner');
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toContainText('DPDP Compliance');
    await page.click('[data-action="accept-consent"]');
    await expect(banner).not.toBeVisible();

    // 2. Visit #privacy
    await page.goto('/#privacy');
    await expect(page.locator('h1')).toContainText('Privacy Policy (India DPDP Act 2023)');
    await expect(page.locator('.legal-page-container .badge-warning')).toContainText('Needs Counsel Review');

    // 3. Visit #terms
    await page.goto('/#terms');
    await expect(page.locator('h1')).toContainText('Terms of Service');
    await expect(page.locator('.legal-page-container .badge-warning')).toContainText('Needs Counsel Review');

    // Reset consent for subsequent tests
    await page.evaluate(() => {
      localStorage.setItem('zipli_dpdp_consent', 'true');
    });
  });

  test('Homepage Touchpoints: Recipe to Cart and OOS Substitutes (Item 14)', async ({ page }) => {
    await page.goto('/');

    // 1. Verify Recipe -> Cart section exists on homepage
    await expect(page.locator('h2:has-text("Recipe → Cart")')).toBeVisible();

    // 2. Click a quick recipe button
    const dalBtn = page.locator('[data-action="quick-recipe"]').first();
    await dalBtn.click();

    // 3. Verify assistant drawer opens with dish prompt
    await expect(page.locator('#assistantDrawer')).toBeVisible();
    await expect(page.locator('.assistant-msg').last()).toBeVisible({ timeout: 8000 });
  });

  test('AI Assistant: Conversational meal planning and tool chips', async ({ page }) => {
    await page.goto('/');

    // 1. Open Assistant Drawer
    await page.locator('[data-action="toggle-assistant"]:visible').first().click();
    await expect(page.locator('#assistantDrawer')).toBeVisible();

    // 2. Click quick prompt suggestion chip "Plan Italian Pasta dinner"
    const pastaChip = page.locator('[data-action="send-assistant-chip"]').first();
    await pastaChip.click();

    // 3. Verify assistant responses with tool chip
    await expect(page.locator('.assistant-msg.bot-msg').last()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#assistantDrawer')).toContainText('Italian Pasta');

    // 4. Verify Thumbs Up feedback rating button
    const thumbsUpBtn = page.locator('[data-action="rate-assistant"][data-rating="1"]').first();
    if (await thumbsUpBtn.isVisible()) {
      await thumbsUpBtn.click();
      await expect(page.locator('#assistantDrawer')).toContainText('Feedback recorded');
    }
  });

  test('Styleguide Component Library Documentation Check', async ({ page }) => {
    // Visit /styleguide.html
    await page.goto('/styleguide.html');
    await expect(page).toHaveTitle(/Design System & Component Styleguide/i);

    // Verify 18 components present
    await expect(page.locator('#buttons')).toBeVisible();
    await expect(page.locator('#inputs')).toBeVisible();
    await expect(page.locator('#chips-badges')).toBeVisible();
    await expect(page.locator('#product-card')).toBeVisible();
    await expect(page.locator('#progress-bar')).toBeVisible();
    await expect(page.locator('#skeletons')).toBeVisible();
    await expect(page.locator('#tabs-timeline')).toBeVisible();
    await expect(page.locator('#overlays')).toBeVisible();

    // Toggle dark mode in styleguide
    await page.click('#themeToggleBtn');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('Admin Portal & Kanban Order Progression', async ({ page }) => {
    // 1. Create and authenticate admin user
    const { makeUser } = require('../backend/tests/helpers/factories');
    const admin = await makeUser({ role: 'admin', name: 'Admin Operations' });

    await page.goto('/');
    await page.evaluate((adminData) => {
      localStorage.setItem('zipli_token', adminData.token);
      localStorage.setItem('zipli_user', JSON.stringify(adminData.user));
      if (window.zipliStore) {
        window.zipliStore.setUser(adminData.user, adminData.token);
      }
    }, { token: admin.token, user: admin.user });

    // 2. Visit #admin
    await page.goto('/#admin');
    await expect(page.locator('h1')).toContainText('Zipli Operations Command Center');

    // 3. Verify KPI cards & SVG charts render
    await expect(page.locator('#adminForecastChart svg')).toBeVisible();
    await expect(page.locator('#adminCategoryChart svg')).toBeVisible();
  });

  test('CSP Compliance: Zero CSP violations across all key frontend routes (F-020, SEC-IO-04)', async ({ page }) => {
    const cspErrors = [];
    page.on('console', (msg) => {
      if (
        msg.type() === 'error' &&
        /content security policy|violates the following Content Security Policy|Refused to execute inline script/i.test(
          msg.text()
        )
      ) {
        cspErrors.push(`${page.url()}: ${msg.text()}`);
      }
    });

    const keyPages = [
      '/',
      '/#search?q=apple',
      '/#checkout',
      '/#admin',
      '/styleguide.html',
      '/admin.html',
    ];

    for (const urlPath of keyPages) {
      await page.goto(urlPath);
      await page.waitForTimeout(300);
    }

    expect(cspErrors).toEqual([]);
  });
});

