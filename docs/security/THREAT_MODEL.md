# Zipli Pro — Production Threat Model & Security Runbooks (F-064)

**Document Version**: 2.0.0  
**Classification**: Engineering & Operations  
**Framework**: Microsoft STRIDE & OWASP Top 10 API Security  
**Last Audited**: October 2026  

---

## 1. System Overview & Trust Boundaries

Zipli Pro is a high-velocity 10-minute quick-commerce platform handling sensitive payment credentials, user PII (names, phone numbers, delivery addresses), commercial order ledger entries, and dark store inventory.

```
+-----------------------------------------------------------------------------------+
| UNTRUSTED EXTERNAL ZONE (Shoppers, Delivery Riders, Attackers, Public Web)       |
+-----------------------------------------------------------------------------------+
                                         │ HTTPS / WSS
                                         ▼
+-----------------------------------------------------------------------------------+
| DMZ / INGRESS GATEWAY (Reverse Proxy, TLS Termination, GCRA Rate Limiting)        |
+-----------------------------------------------------------------------------------+
                                         │ X-Request-ID, Bearer JWT, CSRF Cookie
                                         ▼
+-----------------------------------------------------------------------------------+
| APPLICATION SERVICE LAYER (Express App, Policy Engine, State Machine, AI Gateway) |
|  - In-flight Distributed Locks                                                    |
|  - Strict Zod Input Validation                                                    |
|  - Centralized Authorization (can / validateFourEyes)                             |
|  - PII Logger Scrubbing                                                           |
+-----------------------------------------------------------------------------------+
             │                                              │
             ▼ TLS (127.0.0.1)                              ▼ Redis Protocol
+----------------------------------------+     +------------------------------------+
| POSTGRESQL RELATIONAL ENGINE           |     | REDIS IN-MEMORY STATE              |
|  - Integer Paise Financial Columns     |     |  - Distributed Idempotency Locks   |
|  - Immutable Double-Entry Ledger       |     |  - GCRA Theoretical Arrival Time   |
|  - Row-Level Security (RLS)            |     |  - Cluster SSE Pub/Sub Fan-out     |
|  - Check Constraints (stock >= 0)      |     +------------------------------------+
+----------------------------------------+
```

---

## 2. STRIDE Threat Analysis & Applied Mitigations

| Category | Threat Description | Attack Vector | Technical Mitigation in Zipli Pro | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| **Spoofing** | Forged payment webhook notifications | Attacker sends mock `payment.captured` POST to credit orders without paying | Cryptographic HMAC-SHA256 signature verification over raw incoming buffer (`req.rawBody`). Replay tolerance enforced strictly at $\pm 300$ seconds. | `backend/tests/integration/payments.test.js` |
| **Spoofing** | Timing-based user email enumeration | Attacker times `/api/auth/register` and `/api/auth/login` to deduce valid emails | Constant-time dummy bcrypt calculation (`DUMMY_HASH`) executed on non-existent accounts to eliminate timing side-channels. | `backend/tests/integration/auth.test.js` |
| **Tampering** | Under-payment order amount tampering (F-053) | Attacker pays ₹1 for a ₹1,000 order by altering client-side payload | Server-side amount verification: incoming `amount` is strictly checked against DB `grand_total_paise`. Mismatch flags `TAMPER_DETECTED`, cancels order, and auto-refunds. | `backend/tests/integration/payments.test.js` |
| **Tampering** | Floating-point rounding discrepancies (F-050) | IEEE 754 float arithmetic leaks fractions of rupees across large volume | Canonical `BIGINT` integer paise columns in PostgreSQL schema (`0012_integer_paise_and_constraints.sql`) with zero float operations. | `backend/tests/unit/moneyInvariants.test.js` |
| **Repudiation** | Dispute on merchant payout or refund deduction | Dark store or platform operator disputes ledger entries | Double-entry balanced ledger (`ledger_journal_entries`, `ledger_lines`) with PostgreSQL constraint triggers strictly prohibiting `UPDATE` and `DELETE`. Corrections require reversing entries. | `backend/tests/unit/ledgerService.test.js` |
| **Information Disclosure** | PII leakage into centralized logging (F-060) | Customer phone numbers, emails, or JWTs logged in plain JSON logs | Recursive PII scrubbing engine in `logger.js` masking emails (`j***@domain.com`), Indian phone numbers (`+91-XXXXX-XXXX`), bearer tokens, and credentials before serialization. | `backend/tests/unit/logger.test.js` |
| **Information Disclosure** | Unauthenticated internal metrics scraping | External actor queries `/metrics` to discover request volumes and routes | Protected `/metrics` endpoint requiring bearer token authentication (`METRICS_AUTH_TOKEN`) in production environments. | `backend/tests/integration/route-security-audit.test.js` |
| **Denial of Service** | Inventory hogging & checkout spam | Concurrent automated checkout bots deplete dark store inventory | Distributed atomic locking via Redis (`idempotency:lock`) preventing duplicate executions, combined with per-user GCRA rate limiting. | `backend/tests/integration/multi-instance.test.js` |
| **Elevation of Privilege** | Rogue staff approving high-value refunds (SEC-AZ-04) | Single compromised manager approves massive fraudulent refund | Four-eyes dual-party authorization constraint enforced via `policy.js`: refunds above ₹1,000 require distinct second approver. | `backend/tests/integration/payments.test.js` |

---

## 3. Operational Security Runbooks

### Runbook RB-01: Payment Gateway Webhook Tamper Incident
**Severity**: P1 - Critical  
**Trigger**: Alert `Payment amount tamper detected` or `TAMPER_DETECTED` status in `payment_events`.  

1. **Immediate Automated Response**:
   - The order is automatically set to `cancelled`.
   - The tampered funds are queued for automatic refund.
   - An audit entry is recorded in `payment_events`.
2. **Investigation Steps**:
   - Query `payment_events WHERE status = 'TAMPER_DETECTED' ORDER BY created_at DESC LIMIT 10`.
   - Inspect `raw_payload` to identify whether attack originated from altered client checkout or compromised gateway keys.
   - If gateway signature verified but internal amounts mismatched, verify whether merchant catalog prices changed between order placement and capture.
3. **Remediation**:
   - If key compromise is suspected, immediately rotate `RAZORPAY_WEBHOOK_SECRET` in production secrets manager and restart pods.

---

### Runbook RB-02: Compromised Staff Account & Token Family Revocation
**Severity**: P1 - High  
**Trigger**: Notification of stolen credentials or suspicious location activity on admin/staff account.  

1. **Immediate Revocation**:
   ```sql
   -- Revoke all active refresh token families for target user
   UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = $TARGET_USER_ID;
   
   -- Lock account to prevent immediate re-login
   UPDATE users SET locked_until = NOW() + INTERVAL '24 hours' WHERE id = $TARGET_USER_ID;
   ```
2. **Session Termination**:
   - The user's next API request with access token expires within 15 minutes.
   - Any refresh attempt will trigger immediate family revocation and rejection.
3. **Post-Incident Review**:
   - Review PostgreSQL `order_status_history` and `ledger_journal_entries` for any actions taken by `actor_id = $TARGET_USER_ID`.

---

### Runbook RB-03: Four-Eyes Dual-Approval Refund Override & Audit
**Severity**: P2 - Medium  
**Trigger**: Customer dispute requiring refund exceeding ₹1,000 threshold.  

1. **Standard Workflow**:
   - Primary support agent initiates refund request through Admin portal.
   - A distinct authorized administrator reviews the evidence and submits `secondApproverId`.
   - System validates `secondApproverId != actorId` and verifies both actors possess `orders:refund:approve` permission.
2. **Audit Verification**:
   ```sql
   SELECT j.id, j.reference_id, j.description, j.posted_at, l.account_code, l.debit_paise, l.credit_paise
   FROM ledger_journal_entries j
   JOIN ledger_lines l ON l.entry_id = j.id
   WHERE j.reference_type = 'ORDER_REFUND' AND j.reference_id = $ORDER_ID;
   ```

---

### Runbook RB-04: Redis Failover & Degraded Mode
**Severity**: P2 - Medium  
**Trigger**: Redis health check alert or connection drop.  

1. **Automatic Behavior**:
   - `ioredis` fails over to connection retry with backoff.
   - Application falls back gracefully to `InMemoryRedisAdapter` for single-instance request survival.
   - Rate limiters default to local GCRA memory store to preserve uptime.
2. **Recovery Verification**:
   - Once Redis connection is restored, instances automatically re-attach to the `zipli:sse_events` pub/sub channel.
   - Run `npm test tests/integration/multi-instance.test.js` in staging to verify distributed lock re-synchronization.
