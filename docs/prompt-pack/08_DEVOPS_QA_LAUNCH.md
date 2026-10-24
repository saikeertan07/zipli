# 08 — DEVOPS, QUALITY, OBSERVABILITY, LAUNCH

======================================================================
1. ENVIRONMENTS
======================================================================
local (docker compose) -> dev (auto-deploy main) -> staging (prod-like, anonymized data, nightly DAST/load) -> production (manual approval, canary).
Each environment: separate cloud account/project, separate secrets, separate payment-gateway test/live keys, separate domains.
Config via typed env schema validated at boot; fail fast; no defaults for secrets.

======================================================================
2. INFRASTRUCTURE AS CODE (WP-OPS-01)
======================================================================
- Terraform modules: network (VPC, subnets, NAT), compute (ECS Fargate or EKS—prefer ECS Fargate for simplicity), database (RDS Postgres Multi-AZ + read replica), cache (ElastiCache Redis), storage (S3 + CloudFront), secrets (Secrets Manager/KMS), WAF/Shield, DNS (Route53), observability, IAM/OIDC for CI.
- Region: ap-south-1 (Mumbai) primary; DR region ap-southeast-1 (cold standby with backups replicated).
- Autoscaling: API by CPU+latency, workers by queue depth.
- Cost controls: budgets/alerts, tagging, rightsizing monthly, spot for non-critical workers.
- Compose file for local parity (api, worker, postgres+postgis+pgvector, redis, mailhog, minio, osrm optional).

======================================================================
3. CI/CD (WP-OPS-02) — GitHub Actions
======================================================================
Pipeline on every PR: install (cached) -> lint -> typecheck -> unit -> integration (service containers) -> contract tests -> build -> container scan -> SAST -> secret scan -> license check -> bundle-size + Lighthouse CI -> e2e smoke (Playwright) -> coverage gate (80% overall, 95% on /algo and money/ledger).
Main branch: build and sign images, SBOM, push to registry, deploy to dev automatically; staging on tag; production via approval gate + canary 5% -> 25% -> 100% with automated rollback on SLO burn.
DB migrations: run as one-shot job before app rollout; backwards-compatible; automated check that migration is safe (no long locks: use CONCURRENTLY, NOT VALID constraints, batched backfills).
Release notes auto-generated; changelog; feature flags default off for new risky features.
Preview environments for PRs (optional).

======================================================================
4. OBSERVABILITY (WP-OPS-03)
======================================================================
Logs: JSON with requestId/traceId/userIdHash; Loki/CloudWatch; retention 30 d hot, 180 d cold (CERT-In), PII-scrubbed.
Metrics (Prometheus/OpenMetrics): RED per route (rate, errors, duration), DB pool/queries, cache hit ratio, queue depth/latency/DLQ, search latency, dispatch time, payment success rate, order funnel, rider online count, notification success, LLM cost/latency.
Traces: OpenTelemetry across API -> DB -> Redis -> providers; sample 10% + 100% of errors.
RUM: web-vitals to backend; session replay OFF by default (privacy).
Dashboards: Executive (orders, GMV, SLA), Service health, Payments, Dispatch/Logistics, Search/Recs, Security, Cost.
Alerts (page vs ticket): 
 PAGE: error rate > 2% 5m; p95 > 1s 10m; payment success < 90% 10m; DLQ > 0 for 10m; queue age > 5m; DB CPU > 85% 10m; replication lag > 30s; OTP spike; webhook failures; ledger imbalance; disk > 85%; certificate expiry < 14d.
 TICKET: slow query regressions, cache hit ratio drop, cost anomalies, dependency CVEs.
Every alert links to a runbook; alert quality reviewed monthly (no noisy alerts).
Error tracking: Sentry with PII scrubbing, release tracking, source maps (private).
Status page for customers and stores.

======================================================================
5. SLOs AND ERROR BUDGETS
======================================================================
- Availability API 99.9% monthly (43 min budget). Checkout success 98%. Search p95 < 300 ms. Order tracking freshness: location update lag p95 < 5 s.
- Delivery SLO: 85% orders delivered within promised ETA +/- 3 min (operational metric).
- Burn-rate alerts (fast 2%/1h, slow 5%/6h). Freeze risky releases when budget exhausted.

======================================================================
6. RELIABILITY ENGINEERING (WP-OPS-04)
======================================================================
- Health: liveness (process), readiness (DB/Redis ok), startup probes; graceful shutdown (drain, finish in-flight, close pools).
- Timeouts everywhere; bulkheads (separate pools for checkout vs reporting); circuit breakers for providers; retry budgets.
- Degraded modes documented and tested: Redis down, replica down, search index stale, payment provider down (show alternative methods/COD policy), SMS vendor down (failover), maps down (fallback ETA), LLM down (rules assistant).
- Chaos tests (staging): kill API pod, block Redis, add DB latency, drop provider; verify SLOs/degradation.
- Backups & DR: PITR tested; RPO 5 min, RTO 60 min for DB; documented failover runbook; quarterly game day.
- Capacity: load tests before each stage; headroom 2x peak; auto-scaling rules validated.
- Data migrations rehearsed on staging copy with timing.

======================================================================
7. LOAD, STRESS, SOAK TESTS (WP-QA-02)
======================================================================
Tools: k6 (HTTP), custom WS load script, simulator for riders/orders.
Scenarios: browse (80%), search (10%), cart+checkout (8%), track (2%); spike (10x for 5 min), soak (8 h), stress until failure; checkout under stock contention; webhook flood; OTP flood (verify rate limits).
Targets (Stage 1 hardware): 300 RPS mixed, checkout 20/s, 5,000 concurrent SSE/WS connections; p95 within SLO; error < 0.5%.
Output: docs/capacity.md with machine specs, commands, results, bottlenecks found/fixed. Never publish numbers you did not measure.

======================================================================
8. QUALITY ASSURANCE (WP-QA-01)
======================================================================
Test pyramid: many unit (algo, money, quote, policies), solid integration (API+DB+Redis), contract tests (OpenAPI vs client), few e2e (critical journeys), security tests (file 04 O), a11y tests, visual tests, load tests.
Test data: factories; deterministic seeds; separate DB per worker; time/clock injection; payment provider fake with failure modes.
Flaky test policy: quarantine within 24 h and fix within a week.
Mutation testing (Stryker) on money, ledger, state machine, quote engine: score >= 70%.
Property-based tests (fast-check): ledger balance, quote totals, allocation, state machine invariants, search tokenization.
Exploratory test charters each release; bug bash before launch; beta with real users (friends/campus) with feedback form.

======================================================================
9. OPERATIONS (RUNBOOKS) (WP-OPS-05)
======================================================================
docs/runbooks/: deploy/rollback, db failover, restore from backup, scale up, payment outage, webhook backlog, queue DLQ replay, OTP abuse, SMS vendor failover, stuck orders, rider app issues, store offline, mass refund, data deletion request, suspected breach, key rotation, certificate renewal, cost spike, on-call handover.
On-call: rota, escalation ladder, severity definitions (SEV1 revenue/safety/security; SEV2 degraded; SEV3 minor), response times, comms templates, post-incident review template.
Ops console actions: pause store, pause area, reduce capacity, disable payment method, enable maintenance banner, broadcast message, trigger reconciliation.

======================================================================
10. LAUNCH GATES (all MUST be green)
======================================================================
Business/legal:
 [ ] Company registered; GST; bank account; payment gateway live KYC done
 [ ] FSSAI/licences for any food handled; store contracts signed; rider agreements and insurance
 [ ] Terms, Privacy (DPDP), Refund, Delivery, Grievance pages reviewed by lawyer
 [ ] DLT registered SMS templates; WhatsApp templates approved
 [ ] CA signed off GST/TCS/TDS/invoice approach
Product:
 [ ] 6 critical journeys pass e2e on staging (customer, store, rider, support, admin, finance)
 [ ] Fee transparency verified; no dark patterns review checklist signed
 [ ] Accessibility audit done; Hindi/Telugu localization reviewed by native speakers
Security:
 [ ] Threat model current; 0 critical/high findings; external pen-test done and fixed
 [ ] Secrets rotated from dev values; no test keys in prod; WAF + rate limits active
 [ ] Backups restore-tested; incident runbooks rehearsed; security.txt live
 [ ] DPDP processes (export/delete/consent) verified
Reliability:
 [ ] Load test at 2x expected peak passed; autoscaling verified
 [ ] SLO dashboards and alerts live; on-call rota staffed; status page ready
 [ ] Rollback tested; feature flags/kill switches verified in production
Operations:
 [ ] Support team trained; macros/policies loaded; refund limits set
 [ ] Store training done; rider onboarding done; pilot area geofence configured
 [ ] Cash handling/COD process documented; settlement dry-run with test payouts
Launch plan: soft launch (invite-only, one area, 5 stores, 50 orders/day) -> measure 2 weeks -> expand radius/hours -> open public -> add stores. Review metrics daily with go/no-go criteria for each expansion.

======================================================================
11. POST-LAUNCH
======================================================================
- Weekly: SLO review, incident review, top support reasons, refund analysis, search zero-results, recs experiments, security alerts, dependency updates.
- Monthly: restore drill, access review, cost review, accessibility regression check, threat-model update.
- Quarterly: pen-test or bug bounty review, DR game day, policy review, roadmap re-prioritization from data.

======================================================================
12. DOCUMENTATION DELIVERABLES
======================================================================
README (quick start <= 5 commands), ARCHITECTURE.md (C4 diagrams), API.md/OpenAPI, ERD, ADRs (>= 15), SECURITY.md, THREAT_MODEL.md, PRIVACY (data inventory + DPIA), RUNBOOKS, CAPACITY.md, BENCHMARKS.md (measured), ALGORITHMS.md, RESUME.md (honest metrics, interview Q&A), CONTRIBUTING.md, CODE_OF_CONDUCT.md, LICENSE decision.

======================================================================
13. BUILD ORDER (how to execute the pack, 16 weeks part-time)
======================================================================
Weeks 1-2   Foundation: TypeScript strictness, module boundaries, migrations, Zod, OpenAPI, CI (WP-ARC-01..04, WP-OPS-02)
Weeks 3-4   Security core: auth overhaul, authz+RLS, headers/CSP, secrets (WP-SEC-01..05)
Weeks 5-6   Money: quote engine, payments adapter, ledger, refunds, invoices (WP-PAY-01..06)
Weeks 7-8   Orders & stock: state machine v2, reservations, FEFO, store dashboard (WP-ORD-10, WP-INV-01, WP-MER-01..05)
Weeks 9-10  Logistics: routing, dispatch v2, rider PWA, tracking (WP-LOG-01..03, WP-FE-05, WP-FE-10)
Weeks 11-12 Discovery & AI: hybrid search, recs, assistant with LLM gateway (WP-AI-01..04, WP-DIS-05..07)
Weeks 13-14 Frontend polish, PWA, i18n, a11y, performance (WP-FE-01..12)
Weeks 15-16 Hardening: pen-test prep, load tests, DR drill, docs, soft launch (WP-SEC-12, WP-QA-02, WP-OPS-04..05, Launch gates)
Use feature flags: ship dark, enable gradually. Re-evaluate scope at every two-week boundary; cut COULD items first.
