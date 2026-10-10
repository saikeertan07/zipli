# Zipli Pro — Comprehensive Security Threat Model (STRIDE)

This document delineates the security threat model for Zipli Pro quick-commerce platform using Microsoft's **STRIDE** methodology (_Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege_).

---

## Architecture Overview & Trust Boundaries

```
[ Untrusted Client / Mobile / Web ]
                 │
           HTTPS │ TLS 1.3
                 ▼
     [ Cloudflare / Edge Gateway ]
                 │
                 ▼
  [ Express API Gateway (Node.js) ] ──── [ GCRA Rate Limiter (Memory/Redis) ]
      │ (Auth, CSRF, Helmet CSP)
      ├───────────────────────┬───────────────────────┐
      ▼                       ▼                       ▼
 [ Order & Catalog Svc ] [ Delivery Dispatch ]  [ Fraud Detection Engine ]
      │                       │                       │
      └───────────────────────┴───────────────────────┘
                              │
                    PostgreSQL 16 (ACID)
             ┌────────────────────────────────┐
             │ - orders, users, products      │
             │ - admin_audit_logs (Hash Chain)│
             └────────────────────────────────┘
```

**Trust Boundaries**:

1. **Public Web / Mobile Client $\leftrightarrow$ Express API**: Untrusted to Semi-Trusted.
2. **Express API $\leftrightarrow$ PostgreSQL Database**: Semi-Trusted to Trusted.
3. **Internal Administrative Actions $\leftrightarrow$ Audit Chain Ledger**: Cryptographically Enforced Trust.

---

## Top 10 Security Risks & Applied Mitigations

| STRIDE Category            | Risk ID | Threat Description                                                                       | Likelihood | Impact   | Applied Mitigation in Zipli Pro                                                                                                                                                                          |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spoofing**               | **S1**  | Stolen or intercepted refresh token used to impersonate customer or rider                | Medium     | High     | **Token Rotation & Family Revocation**: Single-use refresh tokens stored as SHA-256 hashes. Attempted reuse of any prior token immediately revokes the entire token family.                              |
| **Spoofing**               | **S2**  | Cross-Site Request Forgery (CSRF) on state-changing order actions                        | Medium     | High     | **Double-Submit Cookie Pattern**: `csrfToken` cookie combined with `X-CSRF-Token` header validation for cookie-authenticated browser sessions.                                                           |
| **Tampering**              | **T1**  | In-flight manipulation of cart line items, pricing, or coupon discounts                  | High       | High     | **Server-Authoritative Pricing**: Total calculations, taxes, discounts, and delivery fees are recomputed exclusively on the server (`/algo/couponEngine.js`). Client prices are ignored.                 |
| **Tampering**              | **T2**  | Malicious insider or compromised admin modifying historical audit log records            | Low        | Critical | **Cryptographic Hash Chain**: `admin_audit_logs` links every record via SHA-256 (`h_i = SHA256(h_{i-1} \| payload)`). Tampering breaks chain verification (`/algo/hashChain.js`).                        |
| **Repudiation**            | **R1**  | Merchant or Admin denies modifying catalog price, inventory, or rider payout             | Low        | High     | **Canonical Signed Audit Logs**: Audit records contain deterministic canonical JSON representations of exact state transitions and actor IDs.                                                            |
| **Information Disclosure** | **I1**  | Exposure of customer PII in data breaches or non-compliance with DPDP/GDPR               | Medium     | High     | **Right-to-Erasure Anonymization**: Dedicated `/api/users/me/delete-account` scrubs names to 'Deleted User', hashes emails (`anon_<hash>@anonymized.zipli.internal`), and removes phone/address records. |
| **Information Disclosure** | **I2**  | Database stack traces or environment variables leaked in API error responses             | High       | Medium   | **Centralized AppError Sanitization**: `errorHandler.js` strips error stacks and Postgres internal codes, returning standardized structured JSON.                                                        |
| **Denial of Service**      | **D1**  | Credential stuffing and brute-force password guessing attacks                            | High       | High     | **GCRA Rate Limiting & Exponential Lockout**: GCRA limits auth to 50 req/min/IP. After 5 consecutive failed logins, accounts undergo exponential lockout (1m $\to$ 5m $\to$ 15m $\to$ 1h).               |
| **Denial of Service**      | **D2**  | Computational exhaustion via expensive Levenshtein fuzzy searches                        | High       | Medium   | **Early Exit Fuzzy Matching & GCRA Search Shields**: Levenshtein algorithm early-exits when length delta exceeds threshold $k$; search route is rate-limited to 30 req/min.                              |
| **Elevation of Privilege** | **E1**  | Regular customer tampering with API routes to access `/api/admin/*` or `/api/security/*` | Medium     | Critical | **Strict RBAC Middleware**: `requireRole('admin')` validates role claim against live database row on every administrative request.                                                                       |

---

## Cryptographic Guarantees & Chain Integrity

### 1. Hash Chain Specification

- **Genesis Hash**: `0000000000000000000000000000000000000000000000000000000000000000` (64 zeros).
- **Record Hash**:
  $$h_i = \text{SHA256}(h_{i-1} \parallel \text{id} \parallel \text{admin\_id} \parallel \text{action} \parallel \text{target\_type} \parallel \text{target\_id} \parallel \text{canonicalizeJson}(\text{payload}) \parallel \text{created\_at})$$
- **Tamper Detection**: An independent background verification worker walks from block 0 to $N$. If $h_i \ne \text{computed\_hash}(row_i)$ or $row_i.\text{prev\_hash} \ne row_{i-1}.\text{current\_hash}$, an alert flags the specific row ID and halts fulfillment.

### 2. Fraud Logistic Regression Engine

- **Sigmoid Activation**: $P(\text{fraud}) = \frac{1}{1 + e^{-z}}$
- **Feature Vector**:
  - User 10-minute and 24-hour velocity
  - IP and device 1-hour order velocity
  - Shipping address reuse count across distinct accounts
  - Coupon reuse count
  - Basket deviation Z-score: $Z = \frac{\text{total} - \mu}{\sigma}$
  - First-time high-value order flag
- **Hard Rules**:
  - `RULE_BLACKLISTED_ENTITY` $\to$ immediate `BLOCK`
  - `RULE_EXTREME_USER_VELOCITY` ($\ge 5$ orders in 10m) $\to$ immediate `BLOCK`
  - `RULE_HIGH_VALUE_FIRST_ORDER` $\to$ hold in `REVIEW` queue

---

## DPDP & GDPR Compliance Architecture

1. **Right to Access & Data Portability (`GET /api/users/me/data-export`)**:
   - Generates machine-readable JSON archive containing profile, order history, line items, and delivery coordinates.
2. **Right to Erasure / Anonymization (`POST /api/users/me/delete-account`)**:
   - Anonymizes PII while maintaining mathematical accounting integrity:
     - `name` $\to$ `'Deleted User'`
     - `email` $\to$ `'anon_' || sha256(email)[0:12] || '@anonymized.zipli.internal'`
     - `phone` $\to$ `NULL`
     - `address` $\to$ `NULL`
   - Revokes all active refresh tokens in family.
   - Writes immutable `USER_GDPR_ANONYMIZED` audit log entry.
