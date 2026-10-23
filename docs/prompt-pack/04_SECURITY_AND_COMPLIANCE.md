# 04 — SECURITY AND COMPLIANCE (heavy security baseline)

Standards to design against: OWASP ASVS 4.0.3 Level 2 (Level 3 for payments/auth/admin),
OWASP Top 10 (2021), OWASP API Security Top 10 (2023), OWASP MASVS (if mobile wrapper),
CIS benchmarks (Docker/Postgres/Linux), NIST 800-63B (authentication), PCI DSS SAQ A (hosted checkout only),
India: DPDP Act 2023 + rules, IT Act 2000 + SPDI rules, CERT-In 2022 directions (6-hour incident reporting,
180-day log retention in India), RBI guidance for payment aggregators/PPIs (via licensed partner),
Consumer Protection (E-Commerce) Rules 2020, FSSAI e-commerce guidelines, Legal Metrology.
Rule: every control below becomes a ticket with a test or evidence (config, CI check, or runbook).

======================================================================
A. THREAT MODEL (do first: WP-SEC-01)
======================================================================
Create docs/security/THREAT_MODEL.md using STRIDE per component (web, API, worker, DB, Redis,
payment webhook, rider app, admin console, CI/CD, object storage, third parties).
Assets: customer PII, addresses/locations, payment tokens, wallet balances, order data, staff access,
secrets, ledger integrity, rider live locations, inventory data, promo budget.
Actors: anonymous attacker, malicious customer, malicious rider, malicious store, insider admin,
compromised dependency, cloud account takeover, competitor scraper, fraud ring.
Top abuse cases to model and test:
 AB-01 Account takeover via OTP brute force / SIM swap / OTP pumping (SMS cost abuse).
 AB-02 Promo/coupon/referral abuse with many accounts.
 AB-03 Wallet fraud: refund-to-wallet laundering, chargeback abuse.
 AB-04 IDOR: reading others' orders/addresses/invoices.
 AB-05 Price/quantity tampering, negative quantities, integer overflow.
 AB-06 Race conditions: double-spend wallet, overselling, coupon reuse.
 AB-07 Webhook forgery or replay.
 AB-08 Rider location spoofing; fake delivery proof; collusion with store.
 AB-09 Scraping catalog/prices; credential stuffing for staff.
 AB-10 SSRF via image URL import; XXE; zip-bombs on CSV import; malicious file uploads.
 AB-11 Stored XSS via product names/reviews/addresses/support chat.
 AB-12 Prompt injection through product text or user messages in the assistant.
 AB-13 Insider data exfiltration (bulk export, support lookups).
 AB-14 Supply-chain compromise (npm typosquat, CI secrets leak).
 AB-15 DDoS / layer-7 floods on search and OTP endpoints.
Output: risk register with likelihood, impact, owner, mitigations, residual risk; review quarterly.

======================================================================
B. AUTHENTICATION
======================================================================
SEC-AUTH-01 Customer login: phone OTP; optional passkey; no passwords for customers.
SEC-AUTH-02 Staff (admin/support/finance/store manager): SSO or password + mandatory MFA (TOTP/WebAuthn). Password min 12 chars, breached-password check (k-anonymity HIBP), Argon2id (memory 64MB, t=3, p=1) for any password.
SEC-AUTH-03 OTP: 6 digits via CSPRNG; store HMAC-SHA256 with server secret; expiry 5 min; single use; attempts <= 5; lock phone for 15 min after 5 failures; per-IP, per-device, per-phone, per-ASN rate limits; CAPTCHA (Turnstile/hCaptcha) after anomalies; block premium-rate/VOIP ranges; daily OTP budget with alert (SMS pumping defense).
SEC-AUTH-04 Tokens: access JWT (EdDSA or RS256, 10-15 min, aud/iss/kid), refresh token opaque random 256-bit, stored hashed, rotated on every use, reuse detection revokes whole family, bound to device id; httpOnly+Secure+SameSite=Lax cookies for web; no tokens in localStorage.
SEC-AUTH-05 Key rotation: JWKS with overlap; rotate signing keys every 90 days; emergency rotation runbook.
SEC-AUTH-06 Session security: idle timeout (customer 30 d sliding, staff 30 min), absolute max (staff 12 h), re-auth for sensitive actions (change phone, add payout bank, delete account, large refund).
SEC-AUTH-07 Step-up auth (OTP/passkey) for: wallet top-up above limit, address change near order time, adding UPI id, export data.
SEC-AUTH-08 Login notifications for new device; "was this you" link that revokes sessions.
SEC-AUTH-09 Account recovery: phone change requires old-phone OTP + email OTP or support verification with audit; 72-h cooling period for payout changes.
SEC-AUTH-10 Brute-force protections uniform in response timing and messages (no user enumeration).
SEC-AUTH-11 Service-to-service auth: mTLS or signed short-lived tokens; no shared static API keys between internal services.
SEC-AUTH-12 Tests: token tampering, alg=none, key confusion, expired/nbf, refresh reuse, cookie flags, CSRF, session fixation.

======================================================================
C. AUTHORIZATION
======================================================================
SEC-AZ-01 Central policy layer: can(actor, action, resource). Deny by default. Unit-tested matrix.
SEC-AZ-02 Object-level checks on every resource fetch (user_id/store_id scope) — never trust IDs from clients.
SEC-AZ-03 Function-level checks for admin routes with permission codes (orders.refund.approve etc.).
SEC-AZ-04 Property-level: whitelist updatable fields (mass assignment protection); Zod .strict().
SEC-AZ-05 Row-Level Security in Postgres for store-scoped tables; API sets app.current_store/app.current_user per request; tests with a non-superuser DB role.
SEC-AZ-06 Separate DB roles: app_rw (no DDL), migrator (DDL), readonly_analytics, support_readonly (masked views). No superuser in app.
SEC-AZ-07 Break-glass access: time-boxed, requires reason + second approver, logged and alerted.
SEC-AZ-08 Four-eyes for: refunds above limit, config changes to fees/payouts, role grants, payout bank changes.
SEC-AZ-09 PII access by support is logged with ticket reference; bulk exports require approval and are watermarked.
SEC-AZ-10 Tests: automated IDOR/BOLA test suite iterating every endpoint with two users and each role.

======================================================================
D. INPUT/OUTPUT SAFETY (web & API)
======================================================================
SEC-IO-01 Validate every request body/query/params/headers with Zod at the edge; max lengths; reject unknown keys; normalize Unicode (NFC); strip control characters.
SEC-IO-02 Output encoding by context; no innerHTML with untrusted data; use textContent or an escaping template helper; ban unsafe sinks via ESLint (no-unsanitized).
SEC-IO-03 Sanitize rich text (descriptions/blog) with DOMPurify server-side allowlist; markdown rendering sandboxed.
SEC-IO-04 Content Security Policy: default-src 'self'; script-src 'self' (+nonces); no 'unsafe-inline'/'unsafe-eval'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; report-to endpoint; Trusted Types (require-trusted-types-for 'script').
SEC-IO-05 Headers: HSTS (1y, includeSubDomains, preload), X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (geolocation self, camera self, microphone self, others none), COOP same-origin, CORP same-site, COEP where feasible.
SEC-IO-06 CORS: explicit origin allow-list per environment; no wildcard with credentials; preflight cache modest.
SEC-IO-07 CSRF: SameSite cookies + double-submit or synchronizer token for cookie-authenticated state-changing requests; check Origin/Sec-Fetch-Site.
SEC-IO-08 File uploads: allow-list MIME by magic bytes, size caps, re-encode images (strip EXIF/GPS), store in private bucket with random keys, serve via signed URLs, antivirus scan (ClamAV) for documents, never execute or serve from app domain.
SEC-IO-09 CSV/Excel import: row/size limits, streaming parser, formula-injection escaping on export (prefix ' for = + - @), reject zip-bombs.
SEC-IO-10 SSRF: no server-side fetch of user URLs; if required (image import) use allow-listed hosts, resolve DNS and block private/link-local/metadata ranges (169.254.169.254, 10/8, 172.16/12, 192.168/16, ::1), no redirects, timeouts, size limits.
SEC-IO-11 SQL injection: parameterized queries only; DB role cannot DROP/ALTER; automated tests with sqlmap-style payloads; lint rule forbidding template-string queries.
SEC-IO-12 NoSQL/ORM injection: no operators from user input; whitelist sort/filter fields.
SEC-IO-13 Path traversal & command injection: no shell exec with user input; use library APIs; sanitize file names.
SEC-IO-14 Deserialization: JSON only; never eval/Function; schema-validated.
SEC-IO-15 ReDoS: ban catastrophic regex; use safe-regex lint; timeouts on regex-heavy operations; max input lengths.
SEC-IO-16 Request limits: body 100 KB default (1 MB for specific uploads), header size caps, JSON depth limit, query param count limit, slowloris timeouts.
SEC-IO-17 GraphQL not used (avoid attack surface). If added: depth/complexity limits, disable introspection in prod.
SEC-IO-18 Open redirects: allow-list return URLs; no user-controlled redirects.
SEC-IO-19 Clickjacking: frame-ancestors none + X-Frame-Options DENY.
SEC-IO-20 Tests: XSS payload corpus across all text fields, SQLi corpus, SSRF test cases, upload malware test file (EICAR), CSV injection checks.

======================================================================
E. DATA PROTECTION
======================================================================
SEC-DATA-01 Encrypt in transit: TLS 1.2+ (prefer 1.3), strong ciphers, HSTS preload; internal traffic TLS/mTLS; DB connections require SSL verify-full.
SEC-DATA-02 Encrypt at rest: managed disk/DB encryption (KMS keys), S3 SSE-KMS, encrypted backups.
SEC-DATA-03 Field-level encryption (envelope, AES-256-GCM, KMS data keys) for: push tokens, payout bank details, KYC document numbers, webhook raw payloads, phone (optional: store phone_hash for lookup + encrypted value for display).
SEC-DATA-04 Hash lookups with HMAC (pepper in KMS) for phone/email/device identifiers used in risk graph; never raw in analytics.
SEC-DATA-05 Secrets: AWS Secrets Manager/SSM/Vault; short-lived credentials (IAM roles/OIDC for CI); no .env in production images; secret scanning (gitleaks) pre-commit + CI + history scan; rotation schedule; break-glass.
SEC-DATA-06 PII minimization: collect only what is needed; no Aadhaar/PAN storage for customers; rider KYC through a licensed KYC vendor where possible and store references not images.
SEC-DATA-07 Masking: logs, error trackers, support UI mask phone (XXXXXX1234), address partially until needed; analytics uses pseudonymous ids.
SEC-DATA-08 Retention & deletion jobs implemented and tested (see file 03 section 10).
SEC-DATA-09 Backups encrypted, immutable copy (object lock), cross-region, restore drill monthly with evidence.
SEC-DATA-10 Data classification: public/internal/confidential/restricted; label tables/columns in docs/data-classification.md; restricted data access reviewed quarterly.
SEC-DATA-11 Location privacy: rider location visible to customer only during active delivery; history access restricted; precise customer location not exposed to rider until task accepted.
SEC-DATA-12 Anonymized datasets for analytics (k-anonymity checks for exports).
SEC-DATA-13 DPDP: consent notices (purpose-specific, withdrawable), notice in English + regional languages, data principal rights (access, correction, erasure, grievance), breach notification to board and users, children's data (no under-18 accounts without verifiable parental consent: gate with age declaration).
SEC-DATA-14 Data processing register and vendor list (processors/sub-processors, DPAs, data location).
SEC-DATA-15 CERT-In: synchronize clocks (NTP), keep logs 180 days within India, incident reporting playbook (6 h).

======================================================================
F. PAYMENT SECURITY (PCI scope minimization)
======================================================================
SEC-PAY-01 Use gateway hosted fields/checkout/UPI intent only; card data never touches Zipli servers; keep PCI SAQ A. Enforce via CSP and code review rule: no PAN inputs in our DOM.
SEC-PAY-02 Webhooks: verify HMAC signature with raw body, check timestamp tolerance, dedupe by provider_event_id, allow-list source IPs where provider supports, respond fast (2xx) then process async; replay tests.
SEC-PAY-03 Never trust client for amount/status; server recomputes totals; verify payment with provider API before marking paid.
SEC-PAY-04 Ledger integrity: double-entry with DB constraint (balanced journals), append-only, daily reconciliation job comparing ledger vs gateway settlement reports; alert on mismatch.
SEC-PAY-05 Idempotency for all money-moving calls (internal + provider); store request hash; reject mismatched replays.
SEC-PAY-06 Refund controls: refund <= captured amount; per-role limits; second approval above limit; velocity alerts; refund-to-source default.
SEC-PAY-07 Wallet: per-day/month limits, velocity checks, no cash-out, name-matched sources, freeze capability, manual review queue.
SEC-PAY-08 COD controls: limit by user trust score, OTP at delivery, restrict high-risk areas, auto-disable after failed deliveries.
SEC-PAY-09 Chargeback workflow: evidence pack generator (order, delivery proof, OTP, GPS trail), deadlines, outcome tracking.
SEC-PAY-10 Payout security: bank account change cooldown, penny-drop verification (via partner), dual approval for settlement release above threshold.
SEC-PAY-11 Rate limit and risk-score payment attempts per user/device/card fingerprint (provider-supplied) to stop card testing.
SEC-PAY-12 Tests: forged webhook, replayed webhook, out-of-order events, amount tampering, double confirm, race on refund.

======================================================================
G. ABUSE, FRAUD AND BOT DEFENSE
======================================================================
SEC-ABU-01 Layered rate limits (edge WAF + app GCRA + per-account): OTP, login, search, add-to-cart, coupon apply, address create, checkout, support chat.
SEC-ABU-02 Bot defense: Cloudflare/AWS WAF bot control, behavioral signals, Turnstile on risky flows, headless-browser detection (not sole control).
SEC-ABU-03 Risk engine: features (velocity, device reuse, address reuse, basket anomalies, new-account high-value COD, coupon stacking) -> score -> allow/step-up/review/block; rules in config with versioning; backtest on historical data before enabling.
SEC-ABU-04 Device graph: link accounts by device/payment/address hashes; ring detection via union-find; manual review UI.
SEC-ABU-05 Promo guard: per-device and per-payment-instrument limits, budget caps, cooldowns, kill switch.
SEC-ABU-06 Rider fraud: GPS spoofing checks (speed/teleport detection, mock-location flags), delivery proof validation (geo-fence + photo hash + OTP), collusion detection by repeated store-rider pairs.
SEC-ABU-07 Store fraud: stock inflation, fake cancellations, price gouging detection vs MRP.
SEC-ABU-08 Scraper defense: rate limits, signed requests for expensive endpoints, honeypot fields, unusual enumeration detection, robots.txt, legal terms.
SEC-ABU-09 Review/rating manipulation controls (verified purchase only).
SEC-ABU-10 Everything auditable; reviewers have reason codes; false-positive feedback loop.

======================================================================
H. INFRASTRUCTURE AND CLOUD SECURITY
======================================================================
SEC-INF-01 Network: VPC with private subnets for DB/Redis/workers; only load balancer public; security groups least privilege; no SSH — use SSM Session Manager; egress allow-list via NAT + proxy for providers.
SEC-INF-02 WAF: managed rule sets (OWASP CRS), rate-based rules, geo-based rules where appropriate, custom rules for known abuse paths, logging to SIEM.
SEC-INF-03 DDoS: CDN/Shield, autoscaling, request queue limits, static fallback page, per-route concurrency limits.
SEC-INF-04 Containers: minimal base (distroless/alpine), non-root, read-only filesystem, drop all capabilities, seccomp default, no privileged, resource limits, healthchecks, image signing (cosign) and verification at deploy.
SEC-INF-05 IaC: Terraform with tfsec/checkov in CI; remote state encrypted with locking; separate AWS accounts for dev/staging/prod; SCPs; CloudTrail on, GuardDuty on, Config rules, IAM Access Analyzer.
SEC-INF-06 IAM: no long-lived access keys; OIDC for GitHub Actions; least-privilege roles per service; permission boundaries; MFA for all humans; quarterly access review.
SEC-INF-07 Database: private, TLS only, parameter hardening, pg_audit for DDL/privileged ops, statement_timeout, idle_in_transaction timeout, connection limits, automated minor upgrades, vulnerability patch SLA.
SEC-INF-08 Redis: AUTH/ACL users, TLS, no public exposure, disable dangerous commands (FLUSHALL, CONFIG, KEYS) for app user, maxmemory policy set deliberately.
SEC-INF-09 Object storage: block public access, bucket policies, versioning, lifecycle, access logs, signed URLs short TTL.
SEC-INF-10 DNS & email: DNSSEC if available, CAA records, SPF/DKIM/DMARC (p=reject), MTA-STS; subdomain takeover monitoring.
SEC-INF-11 Patch management: OS and base images rebuilt weekly; critical CVEs patched within 72 h, high within 7 days.
SEC-INF-12 Admin console isolated: separate domain, IP allow-list/VPN or Zero Trust (Cloudflare Access/AWS Verified Access), device posture where possible.
SEC-INF-13 Time sync and logging integrity (NTP, immutable log storage).

======================================================================
I. APPLICATION SUPPLY CHAIN AND CI/CD SECURITY
======================================================================
SEC-SC-01 Dependency policy: lockfiles, exact pins for prod deps, Dependabot/Renovate with grouped updates, npm audit + OSV-scanner + Socket/Snyk in CI, block high/critical.
SEC-SC-02 SBOM (CycloneDX) generated per build; stored with release.
SEC-SC-03 CI hardening: pinned GitHub Actions by SHA, minimal GITHUB_TOKEN permissions, no secrets in forks, protected branches, required reviews, signed commits (recommended), CODEOWNERS for security-sensitive paths.
SEC-SC-04 Build provenance (SLSA level 2+): reproducible builds, attestations, signed images.
SEC-SC-05 SAST (CodeQL/Semgrep) with custom rules for our anti-patterns; secret scanning; IaC scanning; container scanning (Trivy/Grype); DAST (OWASP ZAP baseline) against staging nightly.
SEC-SC-06 Postinstall scripts disabled by default (npm ci --ignore-scripts) except audited allow-list.
SEC-SC-07 Licence compliance check (no GPL in distributed code unless intended).
SEC-SC-08 Deployment: blue/green or canary, automatic rollback on SLO breach, migration safety checks, manual approval for production, change log.
SEC-SC-09 Third-party scripts: avoid; if needed use Subresource Integrity and CSP allow-list; self-host fonts/analytics.

======================================================================
J. LOGGING, DETECTION, RESPONSE
======================================================================
SEC-LOG-01 Security events logged: auth success/fail, OTP issues, role changes, permission denials, admin actions, exports, config changes, payment events, webhook failures, risk blocks, rate-limit hits.
SEC-LOG-02 Logs: JSON, request id, user id (pseudonymous), no secrets/PII; shipped to central store; tamper-evident (hash-chain audit table for admin actions + immutable S3).
SEC-LOG-03 Detections/alerts: impossible travel for staff, spike in OTP requests, spike in 401/403, spike in refunds, wallet anomalies, new admin created, WAF block surge, mass export, DB role changes, unusual egress.
SEC-LOG-04 Incident response: severity matrix, on-call rota, runbooks (credential leak, data breach, payment fraud wave, DDoS, supply-chain alert), comms templates, evidence preservation, post-mortem within 5 days, regulator notification checklist (CERT-In 6 h, DPB).
SEC-LOG-05 Security contact: /.well-known/security.txt, responsible-disclosure policy, bug bounty (private first), safe-harbor statement.
SEC-LOG-06 Tabletop exercises quarterly; restore drills; key-rotation drills.

======================================================================
K. FRONTEND / PWA SECURITY
======================================================================
SEC-FE-01 No secrets in bundles; env injected at runtime only for public values.
SEC-FE-02 Service worker: scope minimal, no caching of authenticated API responses with PII, versioned cache cleanup, no caching of POST, integrity of SW file.
SEC-FE-03 postMessage origin checks; no wildcard targets.
SEC-FE-04 Third-party iframes sandboxed; payment iframe from provider only.
SEC-FE-05 Deep links/intent handlers validated.
SEC-FE-06 Clipboard, geolocation, camera, mic permissions requested contextually with explanation.
SEC-FE-07 Local storage holds only non-sensitive preferences; clear on logout.
SEC-FE-08 Subresource Integrity for any CDN assets; dependency pinning.
SEC-FE-09 Anti-tamper for price/qty in UI is irrelevant: server is the authority; test by tampering.

======================================================================
L. AI/LLM SECURITY (see file 07 for features)
======================================================================
SEC-AI-01 Treat all retrieved text (products, user messages, reviews) as untrusted data; never place it in system instructions.
SEC-AI-02 Tool allow-list, strict schemas, per-tool authorization using the end user's permissions; no SQL generation; no network tools.
SEC-AI-03 Human confirmation for any state change (cart add, order, refund); never auto-checkout.
SEC-AI-04 PII minimization to the model; redact phone/address; per-vendor data-processing terms; no training on our data.
SEC-AI-05 Output filtering (no secrets, no markup injection, link allow-list), rate and cost limits per user, kill switch.
SEC-AI-06 Red-team suite (jailbreaks, indirect injection, data exfil prompts) run in CI with recorded model outputs.

======================================================================
M. COMPLIANCE CHECKLIST (non-code)
======================================================================
CMP-01 Register company (Pvt Ltd/LLP), PAN, GST registration, shops & establishment licence where required.
CMP-02 FSSAI: platform responsibilities for food sellers; verify seller FSSAI license numbers; display on product pages; handle recalls.
CMP-03 Legal Metrology: declarations on packaged goods (net quantity, MRP, date) shown per rules.
CMP-04 Consumer Protection (E-Commerce) Rules: grievance officer, 48-h acknowledgement and 1-month resolution, no unfair trade practices, seller details disclosure, country-of-origin display.
CMP-05 Payments: use RBI-authorized payment aggregator; wallet needs PPI licence or partner; do not hold customer funds yourself without proper licence.
CMP-06 Privacy: DPDP notice and consent artefacts, DPO/grievance contact, processors register, breach plan.
CMP-07 Telecom: DLT registration for SMS sender IDs/templates; WhatsApp business policy.
CMP-08 Rider engagement: contracts, insurance, labour code/social security compliance as applicable.
CMP-09 Taxes: GST on delivery/handling/platform fees, TCS under GST for e-commerce operators, TDS on payouts, e-invoicing thresholds.
CMP-10 Records: invoices, ledgers, logs retained per law.
Have a qualified lawyer and CA review these before launch. This file is engineering guidance, not legal advice.

======================================================================
N. SECURITY WORK PACKAGES (in order)
======================================================================
WP-SEC-01 Threat model + risk register + security backlog.
WP-SEC-02 Auth overhaul: OTP service hardening, refresh rotation, device sessions, step-up, MFA for staff.
WP-SEC-03 Authorization layer + RLS + automated IDOR test suite.
WP-SEC-04 Input validation (Zod everywhere) + output encoding + CSP/Trusted Types + remove inline handlers.
WP-SEC-05 Secrets management + secret scanning + env validation + key rotation scripts.
WP-SEC-06 Data protection: field encryption library, HMAC lookups, masking, retention jobs, export/delete flows.
WP-SEC-07 Payment security: webhook verification, idempotency, ledger constraints, reconciliation job.
WP-SEC-08 Rate limiting/abuse: Redis GCRA, WAF rules, CAPTCHA integration, risk engine v1, promo guard.
WP-SEC-09 Infra hardening: Terraform baseline, container hardening, network policy, WAF, logging pipeline.
WP-SEC-10 CI security: SAST, SCA, secrets, container scan, DAST, SBOM, signed images.
WP-SEC-11 Detection & response: alerts, runbooks, security.txt, tabletop.
WP-SEC-12 Pen-test prep: internal test using ZAP + manual checklist; fix; then external test before launch (budget it).
WP-SEC-13 Privacy engineering: consent manager, data inventory, DPA list, DPIA for location + AI.
WP-SEC-14 AI security tests and kill switches.

======================================================================
O. SECURITY TEST PLAN (automate in CI where possible)
======================================================================
T-01 AuthN: brute force, OTP reuse, OTP race, token tampering, refresh reuse, cookie flags.
T-02 AuthZ: BOLA/IDOR matrix across all endpoints and roles; mass-assignment tests.
T-03 Injection: SQLi, XSS (reflected/stored/DOM), template, header, CSV, log injection.
T-04 Business logic: negative qty, price tampering, coupon races, wallet double spend, refund > paid.
T-05 Concurrency: parallel checkout with last unit, parallel coupon use, parallel refund.
T-06 Webhooks: forged, replayed, late, duplicated, malformed.
T-07 Uploads: polyglot files, oversized, wrong MIME, EXIF leak, path traversal names.
T-08 Headers/TLS: securityheaders-style assertions, testssl.sh in staging.
T-09 Rate limits: burst + sustained for every sensitive endpoint.
T-10 DoS safety: large payloads, deep JSON, slow requests, ReDoS corpus.
T-11 Infra: Terraform scan clean; container scan clean; no public buckets/DBs (automated check).
T-12 Privacy: delete/export flows verified end-to-end; logs scanned for PII patterns in CI.
T-13 AI: injection suite, tool misuse, data exfil prompts, cost abuse.
Pass criteria for launch: 0 critical/high, mediums with accepted risk documented, all T-01..T-13 green.
