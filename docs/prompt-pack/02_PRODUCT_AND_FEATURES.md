# 02 — PRODUCT AND FEATURES (work packages with acceptance criteria)

Priority tags: [MUST] launch, [SHOULD] within 60 days, [COULD] later.
Each WP: implement, test, document. AC = acceptance criteria.

======================================================================
PERSONAS
======================================================================
P1 Priya, 29, working professional: wants fast reorder, reliable ETA, UPI, no surprises.
P2 Ravi, 52, homemaker: wants Hindi/Telugu UI, big text, voice search, cash-on-delivery option.
P3 Aman, 20, student: wants budget view, group orders, low data usage, late-night food.
P4 Suresh, 38, store owner: wants simple stock updates, payout clarity, order alerts.
P5 Imran, 24, rider: wants clear pickup/drop, fair pay display, safe routing, offline tolerance.
P6 Meera, 31, support agent: wants full order context, refund tools, audit trail.
P7 Dev, 35, ops manager: wants live map, SLA alerts, capacity controls, reports.
P8 Anita, 45, finance: wants ledger, GST invoices, settlements, reconciliation.

======================================================================
EPIC A — ACCOUNTS AND ONBOARDING
======================================================================
WP-ACC-01 [MUST] Phone-number OTP signup/login (primary), email optional.
 AC: OTP 6 digits, 5-min expiry, max 5 attempts, 3 sends/hour/number, resend cooldown 30s.
 AC: OTP stored hashed; constant-time compare; no OTP in logs.
 AC: login creates device record; new-device login sends notification.
WP-ACC-02 [MUST] Social login (Google) optional, linked to the same account by verified email.
WP-ACC-03 [MUST] Profile: name, avatar, language, dietary preferences (veg/non-veg/vegan/jain), allergens.
WP-ACC-04 [MUST] Address book: up to 10 addresses, label (home/work/other), map pin, landmark, floor, instructions.
 AC: address validated against service-area polygons; out-of-area shows waitlist signup.
 AC: lat/lng stored with accuracy; reverse-geocode cached.
WP-ACC-05 [MUST] Session management screen: list active sessions/devices, revoke any, "log out everywhere".
WP-ACC-06 [MUST] Account deletion + data export (DPDP): request, 7-day cooling-off, then anonymize.
 AC: orders retained in anonymized form for tax law; PII removed; export is a signed JSON/ZIP link valid 24h.
WP-ACC-07 [SHOULD] Passkeys (WebAuthn) as second option; MFA for staff mandatory.
WP-ACC-08 [SHOULD] Family/household: invite members, shared address, shared lists, per-member spending limits.
WP-ACC-09 [SHOULD] Guest browsing with location only; require login at cart checkout.
WP-ACC-10 [COULD] Referral program with abuse limits (device + payment fingerprint rules).

======================================================================
EPIC B — DISCOVERY: HOME, CATALOG, SEARCH
======================================================================
WP-DIS-01 [MUST] Home feed: location-aware, shows ETA, categories, offers, "buy again", trending, recently viewed.
 AC: renders skeleton in <100ms, content in <1s on 4G; works offline with cached last feed.
WP-DIS-02 [MUST] Category tree (3 levels), category pages with filters (brand, price, diet tags, rating, in-stock, offers).
WP-DIS-03 [MUST] Product detail page: images (zoom), price, MRP, discount, unit price (per 100g/ml), stock urgency, nutrition, ingredients, allergens, shelf life, return policy, FSSAI info, substitutes, frequently bought together.
WP-DIS-04 [MUST] Store-aware catalog: each product has per-store price and stock; user sees the serving store automatically.
WP-DIS-05 [MUST] Search: instant suggestions (trie), typo tolerance (BK-tree), Hinglish and regional transliterations, voice input (Web Speech API), recent/popular searches.
 AC: p95 suggest < 50 ms server time; zero-result queries logged and reviewed weekly.
WP-DIS-06 [MUST] Search results ranking explainable in admin (BM25 + popularity + availability + margin guardrail).
WP-DIS-07 [SHOULD] Semantic search with embeddings (pgvector) and reciprocal rank fusion with BM25.
WP-DIS-08 [SHOULD] Barcode scan (camera) to add or find a product (BarcodeDetector API fallback to ZXing).
WP-DIS-09 [SHOULD] Image search of a shopping-list photo (OCR) -> matched cart items (confirm before add).
WP-DIS-10 [SHOULD] Personalized ranking inside categories (bandit, with diversity and fairness constraints).
WP-DIS-11 [COULD] Recipes: tap a dish, get ingredients mapped to products with quantity scaling.
WP-DIS-12 [MUST] Unit-price comparison label and "better value" hint within same category (neutral, not manipulative).
WP-DIS-13 [MUST] SEO: server-rendered category/product pages, schema.org Product markup, sitemap, canonical URLs.

======================================================================
EPIC C — CART AND CHECKOUT
======================================================================
WP-CHK-01 [MUST] Cart persists across devices; merges guest cart on login; max line qty rules per product.
WP-CHK-02 [MUST] Cart validation: price changes, stock changes, availability, min order, max weight; show diffs to the user before payment.
WP-CHK-03 [MUST] Fee breakdown shown before payment: items, discounts, delivery fee, handling fee, taxes (GST by slab), tip, platform fee (if any) — each line explained.
 AC: No fee appears only at the last step. Total at cart equals total at payment (or user is told why it changed).
WP-CHK-04 [MUST] Coupons: percent/flat/free-delivery/BOGO/first-order; stack rules; per-user/limit/validity; clear error messages.
WP-CHK-05 [MUST] Delivery slots: instant, 30-min windows, and scheduled up to 7 days; capacity-aware; slot lock for 10 minutes.
WP-CHK-06 [MUST] Stock reservation at checkout start (10-min hold), released on abandon, converted on payment success.
WP-CHK-07 [MUST] Payment methods: UPI (intent/collect/QR), cards, netbanking, wallets, Cash on Delivery (with limits and fraud rules), Zipli Wallet.
WP-CHK-08 [MUST] Tip for rider (preset + custom), 100% passes to rider, shown in ledger.
WP-CHK-09 [MUST] Delivery instructions, contactless option, "leave at door" with OTP-less photo proof rules, gate code field.
WP-CHK-10 [MUST] Order placement is idempotent; double-click, refresh, network retry never double-charge or double-order.
WP-CHK-11 [SHOULD] Substitution preferences per item: "substitute", "refund", "call me".
WP-CHK-12 [SHOULD] Split payment: wallet + UPI; group order split link (each pays own share).
WP-CHK-13 [SHOULD] Save payment methods via gateway tokens only (never PAN); one-click UPI via saved VPA with consent.
WP-CHK-14 [SHOULD] Pre-order: reserve out-of-stock items for next availability.
WP-CHK-15 [COULD] Buy now pay later via partner (only after legal review).

======================================================================
EPIC D — ORDER LIFECYCLE AND TRACKING
======================================================================
WP-ORD-01 [MUST] State machine: created -> payment_pending -> paid -> accepted -> picking -> packed -> assigned -> picked_up -> out_for_delivery -> delivered; plus cancelled, failed, refunded, partially_refunded.
 AC: illegal transitions blocked; every transition logged with actor and reason; event emitted via outbox.
WP-ORD-02 [MUST] Live tracking: map with rider position (1–3 s smoothing), ETA with confidence band, status timeline, call/chat masked numbers.
WP-ORD-03 [MUST] Notifications: push (web push/FCM), SMS (critical), WhatsApp (optional), in-app; user preferences and quiet hours.
WP-ORD-04 [MUST] Cancellation rules: free until accepted; fee after packing; automatic full refund if store/rider cancels.
WP-ORD-05 [MUST] Order history, reorder-in-one-tap, invoice PDF download (GST compliant).
WP-ORD-06 [MUST] Delivery OTP (4-digit) shown to customer, verified by rider for high-value or alcohol-free sensitive categories (configurable).
WP-ORD-07 [MUST] Missing/damaged item flow: photo evidence, instant refund to wallet or source, abuse scoring.
WP-ORD-08 [SHOULD] Order edit window (add items before packing) with price lock.
WP-ORD-09 [SHOULD] Delay compensation: automatic credit if ETA breached by > X minutes (configurable, budget-capped).
WP-ORD-10 [SHOULD] Delivery rating (rider + store + items) with free text; moderation; feeds quality scores.
WP-ORD-11 [COULD] Live order chat with rider (templated quick replies, translated).

======================================================================
EPIC E — SUBSCRIPTIONS AND DAILY LIFE
======================================================================
WP-SUB-01 [MUST?] Subscriptions for daily items (milk, bread, eggs, newspapers): frequency (daily/alternate/weekly/custom days), quantity, pause/skip/vacation mode.
 AC: next-delivery preview 14 days; cutoff time (e.g. 10 pm previous day); auto-substitute rules.
WP-SUB-02 [SHOULD] Wallet auto-recharge with limits and consent (RBI e-mandate rules via gateway).
WP-SUB-03 [SHOULD] Monthly staples basket ("Kirana Kit") with editable template and price lock.
WP-SUB-04 [SHOULD] Shared shopping lists (real-time collaboration), assign items, check-off, convert to cart.
WP-SUB-05 [SHOULD] Budget tracker: monthly spend by category, alerts at 80%/100%, export CSV.
WP-SUB-06 [SHOULD] Smart restock reminders based on purchase intervals (opt-in) with snooze.
WP-SUB-07 [SHOULD] Zipli Plus membership: free delivery above threshold, small discounts; clear cancel anytime; no dark patterns.
WP-SUB-08 [COULD] Meal plans: weekly menu -> shopping list -> cart with budget fit (knapsack).
WP-SUB-09 [COULD] Bill payments/recharges (only through licensed partners).

======================================================================
EPIC F — WALLET, LOYALTY, PROMOTIONS
======================================================================
WP-WAL-01 [MUST] Wallet: closed-loop prepaid balance, top-up via gateway, spend at checkout, refunds to wallet, statements.
 AC: double-entry ledger; no negative balances; per-transaction and monthly limits; KYC tiers per RBI PPI rules (legal review before enabling top-ups).
WP-WAL-02 [SHOULD] Loyalty points: earn per order, redeem, expiry rules, transparent history.
WP-WAL-03 [SHOULD] Promotions engine: rule-based (segment, category, time, store), budget caps, A/B tests, kill switch.
WP-WAL-04 [SHOULD] Cashback with delayed credit and abuse limits.
WP-WAL-05 [MUST] Promo abuse detection: device/phone/address/payment-instrument linkage graph; velocity rules.

======================================================================
EPIC G — STORE (MERCHANT) PLATFORM
======================================================================
WP-MER-01 [MUST] Store onboarding: documents (GST, FSSAI, PAN, bank), verification workflow, status (pending/active/suspended).
WP-MER-02 [MUST] Store dashboard (PWA, tablet-friendly): incoming orders with audible alert, accept/reject (with reason), picking checklist, mark packed, handover with rider OTP.
 AC: auto-reject if not accepted in 90s -> re-route to next store; store acceptance rate tracked.
WP-MER-03 [MUST] Inventory: bulk CSV upload, barcode scan stock-in, quick stock toggle, low-stock alerts, expiry/batch capture.
WP-MER-04 [MUST] Pricing: store sets selling price within MRP and category rules; promo participation opt-in.
WP-MER-05 [MUST] Settlements: daily/weekly payouts, commission statement, GST/TCS/TDS lines, downloadable invoices, dispute button.
WP-MER-06 [SHOULD] Store hours, holiday calendar, busy mode (extend prep time), capacity limits.
WP-MER-07 [SHOULD] Dark-store picking optimization: pick-path ordering by aisle map (TSP heuristic).
WP-MER-08 [SHOULD] Wastage tracking and markdown suggestions for near-expiry items (FEFO).
WP-MER-09 [SHOULD] Store analytics: sales, top items, stock-outs, ratings, acceptance time.
WP-MER-10 [COULD] Multi-store chains with central catalog and per-store overrides.

======================================================================
EPIC H — RIDER PLATFORM
======================================================================
WP-RID-01 [MUST] Rider onboarding: KYC (ID, license, vehicle docs), background-check partner hook, training quiz, status.
WP-RID-02 [MUST] Rider PWA: online/offline toggle, offer card (distance, earnings, items), accept/decline timer, navigation deep link, pickup and drop steps, OTP/photo proof.
WP-RID-03 [MUST] Dispatch: batch assignment (Hungarian), nearest-available fallback, fairness (rotation), rider scoring, re-assign on timeout.
WP-RID-04 [MUST] Earnings: per-order pay breakdown (base, distance, wait, surge, tip), daily/weekly statements, payout schedule.
WP-RID-05 [MUST] Safety: SOS button (shares location with ops), shift length limits, rain/night rules, insurance info, incident reporting.
WP-RID-06 [SHOULD] Offline tolerance: queue location pings and status events; sync on reconnect.
WP-RID-07 [SHOULD] Heat map of demand, incentive targets (clear, not manipulative).
WP-RID-08 [SHOULD] Rider support chat and escalation.

======================================================================
EPIC I — SUPPORT, TRUST AND SAFETY
======================================================================
WP-SUP-01 [MUST] In-app help center: order-specific issues (late, missing, wrong, damaged, payment failed) with guided flows and instant resolution where policy allows.
WP-SUP-02 [MUST] Support console: unified customer timeline (orders, payments, refunds, tickets, device, risk flags), macros, SLA timers, escalation.
WP-SUP-03 [MUST] Refund tool: partial/full, to wallet/source, approval limits per role, audit.
WP-SUP-04 [MUST] Masked calling/chat between customer and rider (virtual numbers); no direct phone exposure.
WP-SUP-05 [SHOULD] Chatbot triage (LLM) with strict tool permissions; always offers human handoff.
WP-SUP-06 [SHOULD] CSAT collection and root-cause tagging; weekly quality review dashboards.
WP-SUP-07 [MUST] Reporting abuse (users, riders, stores); block/suspend workflow with appeal.
WP-SUP-08 [MUST] Legal: grievance officer details, takedown/complaint process per Indian IT rules and Consumer Protection (E-Commerce) Rules.

======================================================================
EPIC J — ADMIN AND OPERATIONS
======================================================================
WP-ADM-01 [MUST] Admin console with RBAC, MFA, IP allow-list option, session timeout, audit trail.
WP-ADM-02 [MUST] Catalog management: bulk import, image pipeline (resize, WebP/AVIF), moderation, duplicates detection, GS1/barcode data.
WP-ADM-03 [MUST] Service areas: polygon editor, per-area fees, hours, capacity, store assignment.
WP-ADM-04 [MUST] Live ops map: orders, riders, stores, SLA breaches, one-click interventions (reassign, cancel, compensate).
WP-ADM-05 [MUST] Config center: fees, thresholds, feature flags, kill switches, change history with approvals for risky changes (four-eyes).
WP-ADM-06 [SHOULD] Reports: GMV, AOV, conversion funnel, retention cohorts, delivery SLA, refund rate, support metrics, unit economics per order.
WP-ADM-07 [SHOULD] Experimentation: feature flags + A/B tests with guardrail metrics and auto-stop.
WP-ADM-08 [SHOULD] Finance console: ledger explorer, reconciliation with gateway settlements, GST reports, tax invoices, credit notes.
WP-ADM-09 [COULD] Demand forecast and replenishment suggestions per store (Holt-Winters).

======================================================================
EPIC K — GROWTH, CONTENT, LEGAL SURFACES
======================================================================
WP-GRO-01 [MUST] Legal pages: Terms, Privacy, Refund & Cancellation, Shipping/Delivery, Grievance, Cookie policy, accessibility statement. (Templates only; get a lawyer to review.)
WP-GRO-02 [MUST] Cookie/consent management; analytics only after consent where required.
WP-GRO-03 [SHOULD] Transactional email/SMS templates (i18n), unsubscribe handling, DLT registration for SMS in India.
WP-GRO-04 [SHOULD] SEO landing pages per locality/category; Open Graph; structured data.
WP-GRO-05 [SHOULD] Blog/CMS (lightweight) for recipes, offers; sanitized markdown.
WP-GRO-06 [COULD] Partner/affiliate links with disclosure.

======================================================================
CROSS-CUTTING FEATURE REQUIREMENTS
======================================================================
XC-01 Internationalization: all strings externalized (ICU messages), RTL-ready, locale-aware numbers/dates/currency, language switch without reload.
XC-02 Accessibility: semantic HTML, ARIA only when needed, focus management in drawers/modals, color contrast AA, reduced motion, text scaling to 200%, screen-reader tested (NVDA/VoiceOver).
XC-03 Offline: service worker caches shell + last catalog; queue safe actions; clear offline UI; never queue payments.
XC-04 Low-data mode: smaller images, no autoplay, fewer prefetches; toggle in settings and auto-detect Save-Data.
XC-05 Performance: see budgets in file 06.
XC-06 Observability: every user-visible flow has metrics + traces + alerts.
XC-07 Privacy by design: data minimization, purpose limitation, retention schedule, consent logs.
XC-08 Resilience: graceful degradation (e.g., recommendations down -> popularity; Redis down -> DB; maps down -> straight-line ETA).
XC-09 Testing: unit, integration, contract, e2e, load, chaos (basic), security tests.
XC-10 Documentation: runbook for every alert; ADR for every big decision.

======================================================================
USER-FLOW SPECS (follow exactly)
======================================================================
FLOW-1 First-time user
 1. Open site -> location prompt (or manual pincode) -> service check.
 2. If serviceable: show home with ETA; else waitlist form.
 3. Add to cart without login; at checkout login by OTP.
 4. Address confirm on map; slot select; payment; success with ETA and tracking link.
 Failure paths: OTP failure, address out of area, item out of stock, payment failure, network loss.
FLOW-2 Returning user reorder
 1. Home shows "Buy again". 2. One tap adds usual basket. 3. Cart diff shows price/stock changes. 4. One-tap UPI pay.
FLOW-3 Payment failure
 1. Gateway returns failure/timeout. 2. Order stays payment_pending; stock hold continues for remaining time. 3. User can retry other method. 4. If money debited but status unknown, reconcile via webhook/poll; auto-refund after 30 minutes if not captured.
FLOW-4 Out-of-stock during picking
 1. Store marks item unavailable. 2. Apply user's substitution preference. 3. If substitute: show price diff and ask approve (timeout 2 min -> refund item). 4. Update totals, adjust payment (refund difference).
FLOW-5 Late delivery
 1. ETA breach predicted -> proactive notification. 2. If breach > threshold -> auto compensation credit. 3. Support shortcut shown in tracking.
FLOW-6 Damaged item
 1. User selects item + reason + photo. 2. Risk score decides instant refund vs review. 3. Refund issued with reason code; store/rider quality metrics updated.
FLOW-7 Subscription cycle
 1. Nightly job builds next-day orders (idempotent). 2. Wallet/UPI mandate charge. 3. Failure: retry schedule, notify, pause after 3 failures.
FLOW-8 Store onboarding
 1. Submit docs. 2. Admin review checklist. 3. Catalog upload. 4. Test order. 5. Go live with limited radius.
FLOW-9 Rider shift
 1. Go online (location + battery check). 2. Receive offer. 3. Accept within 20s. 4. Navigate to store. 5. Pickup with order code. 6. Deliver with OTP/photo. 7. Earnings update.
FLOW-10 Account deletion
 1. Request. 2. Confirm via OTP. 3. 7-day grace. 4. Anonymize and delete. 5. Email confirmation.

======================================================================
EDGE-CASE CATALOG (write tests for each)
======================================================================
EC-01 Two users buy the last item at the same time.
EC-02 User changes address after payment but before packing.
EC-03 Store goes offline mid-order.
EC-04 Rider app crashes or loses connectivity during delivery.
EC-05 Payment webhook arrives before client redirect; arrives twice; arrives late; never arrives.
EC-06 Coupon used concurrently from two devices.
EC-07 Price changes between add-to-cart and pay.
EC-08 Clock skew between client and server.
EC-09 Address on the boundary of service area.
EC-10 Heavy rain: capacity throttling and ETA inflation.
EC-11 Duplicate phone numbers with different country formats.
EC-12 Emoji/RTL/very long names in addresses and products.
EC-13 User with 500 past orders loading history.
EC-14 Cart with 80 items and weight limit.
EC-15 Refund after partial delivery with coupon proration.
EC-16 GST rate change mid-day.
EC-17 Subscription during holiday/lockdown.
EC-18 DST not applicable but timezone misconfiguration tests.
EC-19 Fraudster tries 100 phone numbers from one device.
EC-20 Insider admin tries to view customer PII without reason.
