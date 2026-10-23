# 06 — FRONTEND, UX, MOBILE, PERFORMANCE

======================================================================
1. DESIGN PRINCIPLES
======================================================================
- Trust first: clear prices, honest ETAs, visible fees, easy undo, no dark patterns (no fake urgency, no pre-ticked upsells, no hidden opt-outs).
- Speed first: perceived performance (skeletons, optimistic UI), real performance (budgets below).
- One-handed mobile use: primary actions in thumb zone, bottom sheets, sticky cart bar.
- Accessible by default; large touch targets (>= 44px); readable type; high contrast; supports voice.
- Calm visual language: one brand accent, neutral surfaces, generous spacing, consistent iconography.

======================================================================
2. DESIGN SYSTEM
======================================================================
Tokens (CSS variables): color (brand, neutral 50-900, success, warning, danger, info; light+dark), spacing 4/8/12/16/24/32/48, radius 8/12/16/24, elevation 0-4, typography (Inter + Noto Sans for Indic scripts; fluid scale with clamp), motion (120/200/320 ms; ease-out/spring), z-index scale, breakpoints 360/480/768/1024/1280.
Components (documented in /styleguide with states + a11y notes): Button, IconButton, Link, Input, OTPInput, PhoneInput, Select, Checkbox, Radio, Switch, Stepper, Slider, Chip, Badge, Tag, Card, ProductCard, CategoryTile, Banner, Carousel, Tabs, Accordion, Modal, BottomSheet, Drawer, Popover, Tooltip, Toast, Snackbar, Skeleton, Spinner, ProgressBar, Timeline, Map, EmptyState, ErrorState, Rating, Avatar, Table, Pagination, Chart (SVG), FileUpload, AddressPicker, SlotPicker, PriceTag, FeeBreakdown, QuantityStepper, CouponInput, SearchBar, CommandPalette.
Rules: components are keyboard accessible, themeable, tested (unit + visual regression via Playwright screenshots), documented with usage guidelines.
Localization: all strings via i18n; layout tolerates 40% longer strings; test with Hindi/Telugu/Tamil fonts; number formatting en-IN (lakh/crore grouping).

======================================================================
3. APP STRUCTURE (web PWA)
======================================================================
Routing: file/route table with lazy-loaded page modules; deep-linkable URLs (/p/:slug, /c/:slug, /search?q=, /cart, /checkout, /orders/:id, /account/*).
State: small store (pub/sub) + server cache with stale-while-revalidate; no global mutable singletons; typed API client generated from OpenAPI.
Rendering: server-rendered (or prerendered) shell for SEO pages; hydrate interactive parts. If staying vanilla: use HTML templates + progressive enhancement and a small render helper that escapes by default.
Error handling: error boundary per route; retry with backoff; offline banner; friendly messages with request id for support.
Forms: accessible labels/errors, inline validation, autofill attributes (autocomplete=tel, one-time-code for OTP with WebOTP API), input modes.
Images: responsive srcset (AVIF/WebP/JPEG), lazy loading, explicit width/height, blurhash/LQIP placeholders, CDN transforms.
Fonts: self-hosted, subset, font-display: swap, preload critical.
Analytics: privacy-friendly (self-hosted Plausible/PostHog) with consent; events schema documented; no PII.

======================================================================
4. PAGES AND SPECIFIC UX REQUIREMENTS
======================================================================
UX-HOME: location bar (address + ETA), search, category rail, banners, "Buy again", trending near you, offers, recently viewed. Sticky mini-cart when items exist.
UX-SEARCH: instant dropdown (recent, suggestions, products), voice and barcode buttons, filters in bottom sheet, sort, "did you mean", empty state with suggestions, keyboard navigation.
UX-PRODUCT: gallery, price block (selling, MRP, discount %, per-unit price), variants/pack sizes, quantity stepper, add button morphing to stepper, info accordions, substitutes, reviews (verified), share.
UX-CART: drawer on desktop, full page on mobile; item list with steppers, savings, free-delivery progress, coupon, fee breakdown, tip, instructions, slot, safe "undo remove".
UX-CHECKOUT: address step (map pin confirm), slot step, payment step (methods, saved UPI), review & pay, success animation, share order, tracking CTA. Resume checkout after failure.
UX-TRACK: map + timeline + ETA; rider card (masked contact); status messages friendly; help button context-aware; live updates via SSE with reconnection and Last-Event-ID.
UX-ORDERS: list with filters, reorder button, invoice link, help.
UX-ACCOUNT: profile, addresses, payment methods (tokens), wallet, subscriptions, lists, budget, language, notifications, privacy (export/delete), sessions, help.
UX-SUBSCRIPTIONS: calendar view of upcoming deliveries; skip/pause with one tap; clear charge schedule.
UX-ASSISTANT: floating button -> side panel/bottom sheet; streaming; tool chips; product cards; confirm buttons; feedback; "talk to human".
UX-LEGAL: footer links; cookie banner (granular); accessibility statement.
UX-ADMIN: dense tables, filters, saved views, keyboard shortcuts, bulk actions with confirmation, audit visible, dark mode.
UX-MERCHANT: big touch targets, sound alerts, minimal steps, offline-tolerant, multi-language.
UX-RIDER: single-hand, glanceable, high-contrast, large buttons, battery-aware, minimal data.

======================================================================
5. ACCESSIBILITY (WCAG 2.2 AA) CHECKLIST
======================================================================
A11Y-01 Landmarks (header, nav, main, footer), skip link, logical heading order.
A11Y-02 All interactive elements are real buttons/links; focus-visible styles; focus trap in modals; return focus on close.
A11Y-03 Color contrast >= 4.5:1 text, 3:1 UI; don't rely on color alone.
A11Y-04 Text resizable to 200% without loss; layouts reflow at 320px.
A11Y-05 Forms: labels, error summaries, aria-describedby, aria-invalid, no placeholder-as-label.
A11Y-06 Live regions for toasts, cart updates, order status.
A11Y-07 Reduced motion respected; no flashing content.
A11Y-08 Alt text for product images (generated from names), decorative images aria-hidden.
A11Y-09 Touch target size >= 24x24 CSS px (aim 44), dragging alternatives (steppers, not just sliders).
A11Y-10 Screen reader test scripts for the 6 critical flows; automated axe checks in CI with zero serious violations.
A11Y-11 Captions/transcripts for any video; voice input alternative.
A11Y-12 Language attribute per locale; mixed-language content marked with lang.

======================================================================
6. PERFORMANCE BUDGETS (CI-enforced with Lighthouse CI + bundle size checks)
======================================================================
- Home (mobile, Moto G Power, 4G): LCP <= 2.0 s, INP <= 150 ms, CLS <= 0.05, TTFB <= 400 ms.
- JS: <= 150 KB gz initial; <= 60 KB per route chunk; CSS <= 40 KB gz critical.
- Images: product card <= 20 KB (AVIF/WebP); hero <= 60 KB.
- API from client: p95 <= 300 ms read, <= 600 ms write.
- Lighthouse >= 90 perf/95 a11y/100 best-practices/95 SEO on key pages.
- Service worker: precache shell <= 300 KB; runtime cache limits with eviction.
- No layout thrash; virtualized lists above 100 items; passive listeners; requestIdleCallback for non-critical.
- Monitor RUM (web-vitals) and alert on regression > 10%.

======================================================================
7. OFFLINE, PWA, MOBILE APP
======================================================================
- Manifest, icons (maskable), theme colors, shortcuts (Reorder, Track order, Search), share target.
- Service worker strategies: shell cache-first; catalog stale-while-revalidate; API network-first with short fallback; never cache auth endpoints or payments.
- Background sync for safe idempotent actions (lists, preferences); show "pending sync".
- Web push opt-in after first successful order with clear value text.
- Install prompt after 2nd session (not intrusive).
- Optional Capacitor wrappers (Android first) with: secure storage, deep links, native share, biometric unlock for wallet, FCM. Store listing assets and privacy labels prepared.

======================================================================
8. FRONTEND TEST PLAN
======================================================================
- Unit: components/utilities (Vitest/Jest), snapshot sparingly.
- Integration: API client with mock server (MSW).
- E2E (Playwright): signup, search, add, checkout (test gateway), payment failure/retry, cancel, track, reorder, subscription skip, address out-of-area, offline browse, language switch, assistant flow (mock LLM), admin refund, merchant accept, rider deliver.
- Visual regression: key pages light/dark at 360/768/1280.
- A11y: axe + manual scripts; keyboard-only run.
- Cross-browser: Chrome, Safari iOS, Firefox, Samsung Internet; low-end Android emulation with CPU throttle.
- Resilience: slow network (3G), flaky API, 500s, expired session mid-checkout.

======================================================================
9. WORK PACKAGES
======================================================================
WP-FE-01 Design tokens + components + styleguide + a11y tests.
WP-FE-02 App shell + router + store + typed API client + error handling + i18n.
WP-FE-03 Home/search/product/category pages with performance budgets.
WP-FE-04 Cart/checkout/payment UX with failure-recovery flows.
WP-FE-05 Tracking page with SSE and map.
WP-FE-06 Account area: addresses, sessions, privacy, wallet, subscriptions, lists, budget.
WP-FE-07 PWA: SW, offline, push, install, low-data mode.
WP-FE-08 Admin console UI (tables, filters, charts, audit).
WP-FE-09 Merchant dashboard UI.
WP-FE-10 Rider PWA UI.
WP-FE-11 Localization: English + Hindi + Telugu first (then Tamil/Kannada/Malayalam), native speaker review.
WP-FE-12 Performance pass + Lighthouse CI + RUM.
