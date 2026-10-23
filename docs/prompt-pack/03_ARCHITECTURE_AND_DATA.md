# 03 — ARCHITECTURE, DATA MODEL, APIS, EVENTS

======================================================================
1. ARCHITECTURE STYLE
======================================================================
Start as a MODULAR MONOLITH (one deployable API + one worker). Modules have
strict boundaries (own tables, public interface, no cross-module SQL joins).
Extract a module into a service ONLY when: independent scaling is needed,
a separate team owns it, or isolation is a security requirement (payments).

Modules (bounded contexts):
 identity        users, sessions, devices, roles, permissions, consent
 catalog         products, categories, brands, media, nutrition, barcodes
 inventory       store stock, batches, reservations, movements
 pricing         price lists, promos, coupons, fees, taxes
 cart            carts, validation, slots
 orders          orders, items, state machine, invoices
 payments        gateway, intents, webhooks, refunds, reconciliation
 ledger          double-entry accounts, journals, wallet, settlements
 fulfillment     picking, packing, handover, store tasks
 logistics       riders, dispatch, routing, tracking, ETAs
 search          indexes, suggest, ranking, analytics
 recommendation  associations, CF, trending, bandits
 notifications   push, sms, email, whatsapp, templates, preferences
 support         tickets, macros, SLA, chat
 risk            fraud scoring, device graph, rules, reviews
 admin           config, flags, audit, reports
 assistant       LLM tools, guardrails, evals

Deployables:
 api (HTTP+WS), worker (queues, cron, outbox relay), migrator (one-shot),
 web/admin/merchant/rider static apps behind CDN, nginx/ALB ingress.

======================================================================
2. SYSTEM CONTEXT (components)
======================================================================
Browser/PWA -> CDN (static, images) -> WAF -> Load balancer -> API (N instances)
API -> PostgreSQL primary (+ read replica) ; Redis (cache, rate limit, pubsub, queues)
API -> Payment gateway (outbound), Maps/Routing, SMS/WhatsApp/Email providers, LLM provider
Worker -> same Postgres/Redis; consumes outbox + queues; calls external providers
Object storage (S3) for images, invoices, proofs-of-delivery, exports (private + signed URLs)
Observability stack receives logs, metrics, traces from all.

======================================================================
3. DATA MODEL (PostgreSQL). Implement via numbered migrations.
======================================================================
Conventions: snake_case, UUIDv7 PKs (or BIGINT identity), created_at/updated_at timestamptz,
money in BIGINT paise, enums via lookup tables or CHECK constraints, FK everywhere, indexes on FK and hot filters.

-- identity
users(id, phone_e164 UNIQUE, phone_verified_at, email CITEXT UNIQUE NULL, email_verified_at, name, locale, status, created_at, deleted_at)
user_credentials(user_id, type, secret_hash, created_at)           -- passkeys, password (staff)
otp_requests(id, phone_hash, code_hash, purpose, attempts, expires_at, consumed_at, ip_hash, created_at)
sessions(id, user_id, refresh_hash, family_id, device_id, ip, ua, created_at, last_seen_at, revoked_at, expires_at)
devices(id, user_id, fingerprint_hash, platform, push_token_enc, first_seen_at, last_seen_at, trusted)
roles(id, name) ; permissions(id, code) ; role_permissions(role_id, permission_id) ; user_roles(user_id, role_id, scope_type, scope_id)
consents(id, user_id, purpose, version, granted, at, ip_hash)
addresses(id, user_id, label, line1, line2, landmark, city, state, pincode, lat, lng, geohash, instructions, is_default, created_at)

-- catalog
categories(id, parent_id, slug, name_i18n JSONB, sort, active)
brands(id, name, slug)
products(id, sku UNIQUE, barcode, brand_id, category_id, name_i18n JSONB, description_i18n JSONB, unit, unit_size, mrp_paise, hsn_code, gst_rate_bp, veg_type, allergens TEXT[], shelf_life_days, fssai_required, is_active)
product_media(id, product_id, url, kind, sort, alt_i18n)
product_nutrition(product_id, per_100g JSONB)
product_embeddings(product_id, model, embedding vector(384))

-- stores & inventory
stores(id, name, legal_name, gstin, fssai_no, address, lat, lng, geo geography(Point), status, commission_bp, opens, closes, prep_time_sec, capacity_per_hour)
service_areas(id, name, polygon geography(Polygon), delivery_fee_paise, min_order_paise, active)
store_service_areas(store_id, area_id)
store_products(store_id, product_id, price_paise, stock_qty, reorder_level, is_listed, updated_at, PRIMARY KEY(store_id, product_id))
stock_batches(id, store_id, product_id, qty, expiry_date, cost_paise, received_at)
inventory_movements(id, store_id, product_id, batch_id, delta, reason, ref_type, ref_id, created_at)
reservations(id, store_id, product_id, qty, cart_id, order_id, expires_at, state)

-- cart & orders
carts(id, user_id, store_id, status, coupon_code, created_at, updated_at)
cart_items(cart_id, product_id, qty, price_snapshot_paise)
orders(id, public_code, user_id, store_id, address_snapshot JSONB, status, payment_status, item_total_paise, discount_paise, delivery_fee_paise, handling_fee_paise, tax_paise, tip_paise, grand_total_paise, slot_start, slot_end, placed_at, delivered_at, cancelled_at, cancel_reason, idempotency_key UNIQUE, risk_score)
order_items(id, order_id, product_id, name_snapshot, qty, unit_price_paise, mrp_paise, tax_rate_bp, tax_paise, discount_paise, substitution_of)
order_events(id, order_id, from_status, to_status, actor_type, actor_id, reason, at)
invoices(id, order_id, number UNIQUE, series, pdf_url, issued_at, gst_json)
refunds(id, order_id, payment_id, amount_paise, reason_code, state, gateway_ref, approved_by, created_at)

-- payments & ledger
payment_intents(id, order_id, provider, provider_ref, method, amount_paise, state, attempts, created_at, updated_at)
payment_events(id, intent_id, provider_event_id UNIQUE, type, payload_hash, raw_encrypted, received_at, processed_at)
ledger_accounts(id, code, type, owner_type, owner_id, currency)
ledger_journals(id, ref_type, ref_id, memo, created_at)
ledger_entries(id, journal_id, account_id, debit_paise, credit_paise, created_at)   -- sum(debit)=sum(credit) per journal (constraint/trigger)
wallets(user_id, balance_paise CHECK >=0, updated_at) -- derived/cached from ledger; ledger is source of truth
settlements(id, store_id, period_start, period_end, gross_paise, commission_paise, taxes_paise, adjustments_paise, net_paise, state, paid_at, utr)

-- logistics
riders(id, user_id, vehicle_type, status, kyc_state, rating, online, last_lat, last_lng, last_seen_at)
rider_locations(rider_id, lat, lng, accuracy, speed, at) -- partitioned by day, short retention
delivery_tasks(id, order_id, rider_id, state, assigned_at, accepted_at, picked_up_at, delivered_at, distance_m, pay_paise, proof_url, otp_hash)
dispatch_offers(id, task_id, rider_id, offered_at, responded_at, outcome)

-- risk, support, admin
risk_signals(id, subject_type, subject_id, signal, score, meta JSONB, at)
device_links(device_id, user_id, phone_hash, payment_hash, address_hash, first_seen)
tickets(id, user_id, order_id, category, status, priority, assignee_id, sla_due_at, created_at)
ticket_messages(id, ticket_id, author_type, author_id, body, attachments JSONB, at)
audit_log(id, actor_id, actor_role, action, target_type, target_id, before JSONB, after JSONB, ip, ua, at, prev_hash, hash)
feature_flags(key, enabled, rollout_pct, rules JSONB, updated_by, updated_at)
config_settings(key, value JSONB, version, updated_by, updated_at)
outbox_events(id, aggregate_type, aggregate_id, type, payload JSONB, created_at, published_at, attempts)
idempotency_keys(key, scope, request_hash, response JSONB, status, created_at, expires_at)

Indexes (minimum): orders(user_id, placed_at DESC), orders(store_id, status), order_items(order_id),
store_products(store_id, is_listed), products USING GIN(to_tsvector), addresses GIST(geo) if PostGIS,
rider_locations(rider_id, at DESC), outbox_events(published_at) WHERE published_at IS NULL, audit_log(at).
Partition rider_locations and audit_log by month/day; retention jobs drop old partitions.
Row-level security (RLS) for multi-tenant store data: store_staff can only see their store rows.

======================================================================
4. API SURFACE (/api/v1) — each with schema, authz, rate limit, tests
======================================================================
Auth
 POST /auth/otp/request {phone, purpose}           public, rate limited per phone+IP+device
 POST /auth/otp/verify {phone, code}               returns access+refresh (cookie)
 POST /auth/refresh   POST /auth/logout   POST /auth/logout-all
 GET  /auth/sessions  DELETE /auth/sessions/:id
 POST /auth/passkeys/register|authenticate         (WebAuthn)
Me
 GET/PATCH /me   GET/POST/PATCH/DELETE /me/addresses
 POST /me/export   POST /me/delete   GET /me/consents  PUT /me/consents
Catalog & search
 GET /categories   GET /products   GET /products/:id   GET /products/:id/substitutes
 GET /search?q=&filters=   GET /search/suggest?q=   GET /search/trending
 GET /home?lat=&lng=       GET /recommendations/*
Cart & checkout
 GET /cart   PUT /cart/items/:productId   DELETE /cart   POST /cart/coupon   DELETE /cart/coupon
 POST /cart/validate   GET /slots?addressId=   POST /checkout/quote   POST /checkout/start
 POST /orders (Idempotency-Key)   GET /orders   GET /orders/:id   POST /orders/:id/cancel
 GET /orders/:id/track (SSE)   GET /orders/:id/invoice   POST /orders/:id/issues
Payments
 POST /payments/intents   POST /payments/:id/confirm   GET /payments/:id
 POST /webhooks/razorpay (signature verified; no auth cookie)   POST /refunds (staff)
Wallet & subscriptions
 GET /wallet   POST /wallet/topup   GET /wallet/transactions
 GET/POST/PATCH/DELETE /subscriptions   POST /subscriptions/:id/skip|pause|resume
Lists & budget
 GET/POST/PATCH/DELETE /lists   POST /lists/:id/items   POST /lists/:id/to-cart
 GET /budget/summary?month=
Store (merchant)
 GET /store/orders   POST /store/orders/:id/accept|reject|packed|handover
 GET/PATCH /store/inventory   POST /store/inventory/import   GET /store/settlements
Rider
 POST /rider/online|offline   POST /rider/location   GET /rider/offers   POST /rider/offers/:id/accept|decline
 POST /rider/tasks/:id/arrived|picked-up|delivered   POST /rider/sos
Support/Admin
 /admin/** (products, stores, areas, riders, users (masked), orders, refunds, flags, config, reports, audit)
Assistant
 POST /assistant/chat (SSE)   POST /assistant/confirm   POST /assistant/feedback
Ops
 GET /health/live   GET /health/ready   GET /metrics (internal only)

Every endpoint spec must define: auth (public/user/staff + permission), request schema, response schema,
error codes, rate-limit policy, idempotency requirement, audit requirement, cache policy.

======================================================================
5. EVENTS (outbox -> queue). Schema versioned. Consumers idempotent.
======================================================================
user.registered, user.deleted
cart.updated, checkout.started, checkout.abandoned
order.created, order.paid, order.accepted, order.packed, order.assigned, order.picked_up,
order.delivered, order.cancelled, order.refunded
payment.succeeded, payment.failed, payment.refund_succeeded
inventory.low, inventory.adjusted, reservation.expired
rider.online, rider.offer_sent, rider.offer_accepted, rider.location_batch
ticket.opened, ticket.resolved
risk.flagged, risk.blocked
Event envelope: { id, type, version, occurredAt, aggregateId, actor, payload, traceId }.
DLQ after 8 attempts with exponential backoff + jitter; alert on DLQ depth > 0.

======================================================================
6. KEY ALGORITHMS AND WHERE THEY ARE USED
======================================================================
Search: trie, BK-tree, inverted index, BM25, RRF with vectors.
Recs: FP-Growth, item-item CF, replenishment cycles, Thompson sampling.
Pricing: knapsack for free-delivery top-up, markdown decay curves.
Inventory: Holt-Winters, safety stock, FEFO heap, segment tree for slot capacity.
Logistics: A*/Dijkstra on road graph (or routing engine), Hungarian assignment, Clarke-Wright batching, 2-opt/Held-Karp, KD-tree for nearest store/rider, geohash for sharding.
Reliability: token bucket/GCRA, single-flight cache, LRU/LFU, circuit breaker, bloom filter.
Security: hash-chained audit log, HMAC webhooks, robust z-score anomaly detection.

======================================================================
7. SCALING PLAN
======================================================================
Stage 1 (0-5k orders/day): 2 API pods, 1 worker, Postgres 4 vCPU/16 GB + replica, Redis 2 GB.
Stage 2 (5-50k): autoscale API (CPU/latency), separate worker pools (critical vs bulk), PgBouncer, partitioned big tables, read-replica routing for search/analytics, CDN image transformations.
Stage 3 (50k+): extract payments, logistics, notifications; Kafka/NATS for events; city-based sharding by service_area; dedicated search cluster.
Capacity tests at each stage using k6; record results in docs/capacity.md.

======================================================================
8. CACHING POLICY
======================================================================
CDN: static assets (immutable, hashed), product images (1y), public category pages (60s + stale-while-revalidate).
Redis: catalog per store (60s), search suggestions (5 min), home feed (30s per area), feature flags (10s).
Never cache: carts, orders, payments, personalized recs without user key, anything with PII in shared caches.
Invalidate on admin/store changes via outbox events; protect with single-flight and TTL jitter.
Fallback: if Redis is down, bypass cache with rate-protection (circuit breaker), never fail requests.

======================================================================
9. CONSISTENCY RULES
======================================================================
- Order creation: one transaction (reserve stock -> create order -> ledger holds -> outbox).
- Payment success webhook: transaction (mark intent -> mark order paid -> journal -> outbox).
- Stock decrements use SELECT ... FOR UPDATE in deterministic order; add CHECK(stock_qty >= 0).
- Outbox guarantees at-least-once; consumers dedupe by event id.
- Cross-module reads go through interfaces; no foreign module table writes.
- Use advisory locks for per-user checkout and per-order state changes.

======================================================================
10. DATA RETENTION
======================================================================
rider_locations: 30 days detailed, then downsample 1 year. otp_requests: 24 h. sessions: until expiry + 30 d.
orders/invoices/ledger: 8 years (tax law). audit_log: 3 years minimum (immutable). logs: 30 d hot, 1 y cold (no PII).
Deleted users: anonymize PII, keep order/ledger rows with pseudonymous id.
Backups: PITR 14 days, daily snapshots 35 days, monthly 1 year, encrypted, restore-tested monthly.

======================================================================
11. WORK PACKAGES
======================================================================
WP-ARC-01 TypeScript migration plan + strict config + incremental conversion (start with shared types and money utils).
WP-ARC-02 Module boundaries enforced by lint rules (eslint-plugin-boundaries) and dependency-cruiser in CI.
WP-ARC-03 Migrations for all tables above (expand/contract), seeds for demo, test factories.
WP-ARC-04 OpenAPI generation from Zod + contract tests + typed client for frontends.
WP-ARC-05 Outbox + queue + DLQ + replay tooling.
WP-ARC-06 Config center + feature flags + kill switches.
WP-ARC-07 PostGIS service areas + nearest store assignment (KD-tree fallback).
WP-ARC-08 Read-replica routing, PgBouncer config, statement timeouts, slow-query logging.
WP-ARC-09 Partitioning + retention jobs for time-series tables.
WP-ARC-10 RLS policies + tests proving cross-store/user isolation.
