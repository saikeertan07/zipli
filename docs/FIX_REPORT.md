# Zipli Pro — Audit Fix Report (Part 2 Fix-All-Errors)

> **Branch**: `autopilot/upgrade`  
> **Tracker**: Fix-All-Errors audit findings F-001 through F-064.

---

## Audit Findings Matrix

| Finding ID | Title | Status | Commit | Evidence File | Residual Risk / Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **F-001** | Remove tracked credentials & `.env` hygiene | **RESOLVED** | Baseline | `docs/evidence/F-001.txt` | `.env` untracked, `.gitignore` protects all `.env*` except `.env.example`. |
| **F-002** | Remove nested duplicate copy (`zipli/zipli`) | **RESOLVED** | Baseline | `docs/evidence/F-002.txt` | Single root repository confirmed. |
| **F-003** | Remove generated/junk files | **RESOLVED** | Baseline | `docs/evidence/F-003.txt` | Cleaned `coverage/`, `test-results/`. Added to `.gitignore`. |
| **F-004** | Single migrations directory | **RESOLVED** | Baseline | `docs/evidence/F-004.txt` | Single migrations folder `backend/migrations`, backup in `docs/db`. |
| **F-005** | Production boot guard for weak credentials | **RESOLVED** | `ee1d955` | `docs/evidence/F-005.txt` | Enforce JWT_SECRET patterns and default DB password rejection. |
| **F-006** | Reviewable git history | **RESOLVED** | Baseline | `docs/evidence/F-006.txt` | Clean conventional commits on `autopilot/upgrade`. |
| **F-010** | Admin policy explicit permissions & 4-eyes | **RESOLVED** | `ee1d955` | `docs/evidence/F-010.txt` | Eliminate `if (role === 'admin') return true;`, enforce 4-eyes. |
| **F-011** | Route coverage test (Zod + Authz) | **RESOLVED** | `3382826` | `docs/evidence/F-011.txt` | Automated route table audit test covering 235 mounted routes. |
| **F-012** | IDOR/BOLA test matrix | **RESOLVED** | `3382826` | `docs/evidence/F-012.txt` | 17-case cross-user resource access and privilege escalation matrix. |
| **F-013** | Database Row-Level Security | **RESOLVED** | `bda09e1` | `docs/evidence/F-013.txt` | Postgres RLS on orders, cart, notifications, store_inventory with non-superuser zipli_app role. |
| **F-014** | Registration anti-enumeration | **RESOLVED** | `3382826` | `docs/evidence/F-014.txt` | Constant-time dummy bcrypt hash and neutral response on duplicate registration. |
| **F-015** | Staff MFA & session lifetimes | **RESOLVED** | `3382826` | `docs/evidence/F-015.txt` | RFC 6238 zero-dependency TOTP, drift window, 12h session lifetime, step-up check. |
| **F-020** | CSP & inline handler elimination | **RESOLVED** | `bda09e1` | `docs/evidence/F-020.txt` | Strict CSP compliance, zero inline handlers, clean router entry. |
| **F-021** | XSS safe render auditing | **RESOLVED** | `bda09e1` | `docs/evidence/F-021.txt` | Tagged template `html` auto-escaping, safeUrl protocol neutralizer, eslint-plugin-no-unsanitized. |
| **F-022** | httpOnly cookie auth | **RESOLVED** | `ed184bb` | `docs/evidence/F-022.txt` | httpOnly SameSite Lax cookies + CSRF protection. |
| **F-023** | Service worker cache hygiene | **RESOLVED** | `bda09e1` | `docs/evidence/F-023.txt` | Pure swCachePolicy prohibiting non-GET, tokens, sensitive endpoints, and private directives. |
| **F-024** | Modular frontend | **RESOLVED** | `bda09e1` | `docs/evidence/F-024.txt` | Split frontend into testable modules with 14 unit tests for store and api client. |
| **F-025** | Accessibility audit (axe) | **RESOLVED** | `bda09e1` | `docs/evidence/F-025.txt` | Zero serious/critical axe violations, contrast >= 4.5:1, keyboard shopping journey. |
| **F-030** | AI Gateway with offline fallback | **PLANNED** | - | - | LLM gateway with strict schemas & prompt injection defenses. |
| **F-031** | Hybrid search evaluation | **PLANNED** | - | - | BM25 + dense embedding vector fusion with RRF. |
| **F-032** | Reproducible benchmarks | **RESOLVED** | `b3afab5` | `docs/evidence/F-032.txt` | Benchmark scripts run locally on Apple M5 and verified. |
| **F-033** | Recommender NDCG tuning | **RESOLVED** | `e5f9bbc` | `docs/evidence/F-033.txt` | Diversity guardrails & explainability reasons verified. |
| **F-034** | Search index build optimization | **PLANNED** | - | - | Profile and optimize index memory footprint. |
| **F-035** | Suggest endpoint throughput | **PLANNED** | - | - | Optimize HTTP autocomplete throughput. |
| **F-040** | CI integration services | **PLANNED** | - | - | `docker-compose.test.yml` and `npm run test:ci`. |
| **F-041** | Coverage gate in CI | **PLANNED** | - | - | Coverage threshold gate (80% / 95%). |
| **F-042** | Real-DB concurrency stock tests | **RESOLVED** | `15e8efc` | `docs/evidence/F-042.txt` | 20-client stock contention, no oversell. |
| **F-043** | Property-based tests | **RESOLVED** | `b3afab5` | `docs/evidence/F-043.txt` | Fast-check property test suites for discount allocation, quotes, ledger balance. |
| **F-044** | Payment webhook scenarios | **PLANNED** | - | - | Signature verification, replayed event deduplication. |
| **F-045** | Outbox relay guarantees | **PLANNED** | - | - | At-least-once delivery, DLQ handling. |
| **F-046** | Graceful shutdown & probes | **PLANNED** | - | - | Readiness/liveness probes and SIGTERM handler. |
| **F-050** | Integer paise money model | **RESOLVED** | `b3afab5` | `docs/evidence/F-050.txt` | Integer paise throughout the platform. |
| **F-051** | Double-entry balanced ledger | **RESOLVED** | `b3afab5` | `docs/evidence/F-051.txt` | Balanced journal constraints, deferred constraint trigger, zero-sum trial balance. |
| **F-052** | Configurable delivery fees | **RESOLVED** | `b3afab5` | `docs/evidence/F-052.txt` | Distance tiers, weather/time surges, transparent fee breakdown. |
| **F-053** | Webhook-driven payment verification | **PLANNED** | - | - | Server-side provider verification. |
| **F-054** | Database schema constraints | **PLANNED** | - | - | CHECK constraints on money/qty/stock. |
| **F-060** | Structured logging without PII | **PLANNED** | - | - | Redact sensitive customer information. |
| **F-061** | Rate limiting sensitive endpoints | **RESOLVED** | `5267fe1` | `docs/evidence/F-061.txt` | GCRA partitioned by user ID and cookie. |
| **F-062** | Security headers & CSP | **RESOLVED** | `5267fe1` | `docs/evidence/F-062.txt` | Strict Helmet headers and CORS policy. |
| **F-063** | SCA & SBOM generation | **PLANNED** | - | - | Automated vulnerability scanning and SBOM. |
| **F-064** | STRIDE threat model & runbooks | **PLANNED** | - | - | STRIDE threat model and disaster recovery runbooks. |
