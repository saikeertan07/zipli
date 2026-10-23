# 05 — PAYMENTS, LEDGER, ORDERS, TAX, LOGISTICS

======================================================================
1. MONEY MODEL
======================================================================
- Integer paise everywhere (BIGINT). A Money type in /packages/shared with add/sub/mul(rate basis points)/allocate(proportional, no lost paise).
- Rounding: banker's rounding only at tax-line level, allocate remainders deterministically (largest remainder).
- Display via Intl.NumberFormat('en-IN'); never compute with floats.
- Price rules: selling_price <= MRP (Legal Metrology); show MRP strikethrough only when selling < MRP.
- Fee types: delivery_fee, handling_fee, small_cart_fee, rain_surge, platform_fee (optional), tip. Each fee has code, label_i18n, tax treatment, and is shown separately.
- Fee configuration versioned in config center; orders snapshot the fee config version used.

======================================================================
2. CHECKOUT QUOTE ENGINE (pure function + tests)
======================================================================
quote(cart, address, slot, coupons, user, now) -> {
  lines[], itemTotal, discounts[], fees[], taxes[], tip, grandTotal, expiresAt, warnings[], quoteId
}
Rules:
 Q1 Prices from store_products at quote time; snapshot into quote; quote valid 10 minutes.
 Q2 Discount order: item-level promos -> cart-level promos -> coupon -> loyalty/wallet (wallet is payment, not discount).
 Q3 Tax per line: GST rate by HSN; prices are MRP-inclusive; compute tax component for invoice.
 Q4 Fees computed from distance bucket, order value, time-of-day, weather flag, capacity; all configurable; caps enforced; "free above X" shown with progress.
 Q5 Coupon validation: eligibility, min cart, category/brand scope, usage limits, stackability, budget, abuse flags.
 Q6 Deterministic: same inputs -> same output; property tests (totals = sum(parts), no negative totals, idempotent).
 Q7 Quote hash signed (HMAC) and verified at order creation to prevent tampering.
 Q8 Order creation recomputes and compares; if differs beyond tolerance, return QUOTE_CHANGED with diff.
Tests: 200+ table-driven cases incl. rounding, stacking, free delivery thresholds, GST slabs, partial refunds.

======================================================================
3. PAYMENT FLOW (provider interface + Razorpay adapter)
======================================================================
interface PaymentProvider { createIntent, getIntent, capture?, refund, verifyWebhook, parseEvent, listSettlements }
States: created -> pending -> authorized -> captured -> (partially_refunded|refunded) | failed | expired | disputed
Flow:
 1. POST /payments/intents {orderId, method}: server recomputes amount from order, creates provider order, stores intent.
 2. Client opens provider checkout with provider_order_id + public key (no amount from client).
 3. Provider webhook -> verify signature -> store payment_event (dedupe) -> enqueue processing.
 4. Processor: fetch payment from provider API (source of truth) -> if captured and amount matches -> single transaction: intent=captured, order=paid, ledger journal, outbox event order.paid.
 5. Client polling/SSE shows status; never relies on redirect alone.
 6. Timeout: intent pending > 15 min -> poll provider; if none, expire and release stock.
 7. Reconciliation: nightly pull gateway settlement report -> match payments/refunds/fees -> mismatch report -> alert.
Failure handling: payment succeeded but order cancelled -> auto refund; duplicate captures -> auto refund extra; amount mismatch -> hold + alert.
UPI: intent flow on mobile, QR on desktop, collect flow with VPA validation; show timers; handle app-switch return.
COD: allowed per trust score and order value cap; rider collects cash; cash ledger account per rider; daily cash deposit reconciliation; mismatches flagged.
Tests: every state transition, webhook ordering permutations, provider timeout, partial refunds, duplicate events, signature failures.

======================================================================
4. DOUBLE-ENTRY LEDGER
======================================================================
Accounts (examples): customer_wallet(user), gateway_clearing, platform_revenue, store_payable(store),
rider_payable(rider), tax_payable_gst, tcs_payable, tds_payable, promo_expense, refund_expense, cash_in_hand(rider), bank.
Journal examples:
 Order paid (UPI): Dr gateway_clearing (grand_total) ; Cr store_payable (items net of commission) ; Cr platform_revenue (commission + fees) ; Cr tax_payable_gst ; Cr rider_payable (delivery pay + tip pass-through)
 Refund: reverse proportionally using stored allocation; Dr store_payable/platform_revenue/... ; Cr gateway_clearing (or wallet).
 Wallet top-up: Dr gateway_clearing ; Cr customer_wallet.
 Wallet spend: Dr customer_wallet ; Cr store_payable/...
 Settlement: Dr store_payable ; Cr bank.
Constraints: entries immutable; per-journal sum(debit)=sum(credit) enforced by deferred constraint trigger; balances derived by SUM or maintained via triggers + periodic verification job.
Controls: no direct UPDATE/DELETE on ledger tables (revoke grants); corrections via reversing journals only; daily trial balance report; alerts on imbalance.
Tests: property-based tests generating random order/refund sequences must keep trial balance = 0 and wallet >= 0.

======================================================================
5. REFUNDS AND DISPUTES
======================================================================
- Reason codes: LATE, MISSING_ITEM, DAMAGED, WRONG_ITEM, QUALITY, CANCELLED_BY_STORE, PAYMENT_DUP, OTHER.
- Policy engine: auto-approve small amounts within user trust limits; else queue for support; fraud checks first.
- Destinations: wallet (instant), source (3-7 days; show timeline), UPI (varies).
- Coupon proration: refunds allocate discount proportionally to returned lines.
- Chargebacks: webhook -> freeze related payouts, create dispute case, evidence pack (order, OTP proof, GPS trail, photos, chat), deadlines tracker.
- Metrics: refund rate by reason/store/rider/product; alert on spikes.

======================================================================
6. GST, INVOICING, SETTLEMENTS
======================================================================
- Per-line HSN + GST rate; invoice numbering series per FY per entity; sequential, gapless; PDF + JSON; stored in S3; regenerate-safe.
- Who invoices: model decisions needed (marketplace vs inventory-led). Document in ADR; consult CA. Support both: store-issued invoices (marketplace) and platform-issued (own inventory).
- Platform fees/commission invoices to stores (B2B tax invoice).
- E-commerce operator TCS (1% -> check current rate) computed on net taxable supplies to stores; reported in settlement statements.
- TDS on payouts where applicable (194-O style) — configurable and CA-reviewed.
- Credit notes on refunds/returns linked to the original invoice.
- Settlement cycle: weekly (T+2 for verified stores), statement lists orders, commissions, taxes, adjustments, payouts, disputes; CSV + PDF export.
- Reports: GSTR-1/3B helper exports, sales register, purchase register.
Tests: invoice math vs reference calculator cases; gapless series under concurrency.

======================================================================
7. ORDER STATE MACHINE (code + diagram + tests)
======================================================================
Transitions (actor): created->payment_pending (system); payment_pending->paid (webhook); paid->accepted (store/auto); accepted->picking (store);
picking->packed (store); packed->assigned (dispatch); assigned->picked_up (rider); picked_up->out_for_delivery (rider);
out_for_delivery->delivered (rider+OTP); any pre-delivery->cancelled (policy); delivered->refunded/partially_refunded (support/system).
Guards: stock reserved, payment captured, rider assigned, OTP valid, within geofence.
Side effects via outbox only (notifications, ledger, search/rec updates).
Timeouts: store accept 90s -> reroute; packing SLA alert; rider acceptance 20s -> next; pickup wait > 8 min -> compensate rider.
Every transition: reason, actor, timestamps; durable; visible in support console.

======================================================================
8. INVENTORY CORRECTNESS
======================================================================
- Reservation at checkout start; expiry job every 30s; convert on payment; release on cancel.
- Picking confirms actual qty; shortages trigger substitution/refund flow.
- Cycle counts: store staff periodic counts; variance report; write-offs logged with reason.
- Batch/expiry (FEFO) for perishables; block sale of items within X days of expiry (configurable).
- Negative stock impossible (CHECK + locking). Concurrency test with 200 parallel buyers.
- Stock sync from store POS: CSV/API adapter; conflict policy (store truth for physical stock, platform truth for reservations).

======================================================================
9. LOGISTICS ENGINE
======================================================================
Routing: self-hosted OSRM/Valhalla on India OSM extract (or Google Directions behind provider interface); fallback to haversine * factor.
ETA: baseline route time + learned correction (SGD regression: hour, day, distance, items, rain, store queue); show range; log predicted vs actual; weekly MAE report; retrain job.
Dispatch:
 - Candidate riders: within radius of store, online, capacity, battery > 15%, shift limits.
 - Cost: pickup ETA + fairness penalty + rider score; solve with Hungarian in 10 s windows; greedy fallback on timeout.
 - Batching: Clarke-Wright with constraints (max 2-3 orders, max detour 6 min, freshness window, cold-chain items not batched with hot food).
 - Offers: rider gets offer with expiry 20 s; decline reasons captured; repeated declines lower priority softly (avoid punishing safety refusals).
 - Re-dispatch on rider no-show/stall.
Geofencing: arrive-at-store and arrive-at-customer events from GPS with accuracy thresholds; delivery completion requires within 150 m unless override with reason.
Capacity control: orders/hour per store and per area; slot capacity via segment tree; surge fee only with transparency and caps; auto "busy" messaging.
Safety: night mode, weather throttle, max speed alerts (not punitive), SOS flow, insurance.
Proof of delivery: OTP or photo; image hashed; blur faces optional; stored private.
Rider pay: transparent formula (base + distance + wait + incentives); shown before accepting; never lower than minimum guarantee.
Tests/benchmarks: simulation harness with 1,000 riders / 5,000 orders reports average pickup time, SLA hit rate, rider utilization for greedy vs Hungarian vs batching.

======================================================================
10. NOTIFICATIONS
======================================================================
Channels: web push (VAPID), FCM (if wrapper), SMS (DLT templates), WhatsApp (templates), email, in-app inbox.
Templates in i18n with variables validated; per-user preferences; quiet hours except critical (OTP, delivery OTP).
Delivery guarantees: outbox -> queue; provider failover (SMS vendor A -> B); dedupe; rate caps per user/day; unsubscribe/DND respect.
Observability: sent/delivered/failed metrics per channel and vendor; cost tracking; alerts on failure spike.

======================================================================
11. WORK PACKAGES
======================================================================
WP-PAY-01 Money type + quote engine + tests.
WP-PAY-02 Provider interface + Razorpay adapter + webhook pipeline + reconciliation.
WP-PAY-03 Ledger schema + constraints + journals + property tests.
WP-PAY-04 Wallet (closed-loop) with limits + legal gate flag (off until licence/partner confirmed).
WP-PAY-05 Refund engine + policy rules + dispute workflow.
WP-PAY-06 GST invoice generator + credit notes + settlement statements.
WP-ORD-10 Order state machine v2 with timeouts and outbox.
WP-INV-01 Reservations + FEFO batches + cycle counts.
WP-LOG-01 Routing provider + ETA model + evaluation harness.
WP-LOG-02 Dispatch engine v2 (Hungarian + batching + fairness) + simulator.
WP-LOG-03 Rider app flows (offers, navigation, OTP/photo proof, offline queue).
WP-NOT-01 Notification service with vendor failover and DLT templates.
