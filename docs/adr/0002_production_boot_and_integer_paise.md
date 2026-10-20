# ADR 0002: Production Boot Hardening, Compose Hygiene & Additive Integer Paise Migration

## Context
During the production-readiness audit:
1. `docker-compose.yml` hardcoded plaintext secrets including a `JWT_SECRET` containing placeholder words ("secret", "zip") that were rejected by the production boot guard (`backend/src/config/env.js`).
2. Ports for database and cache were bound to `0.0.0.0`, and Redis lacked authentication.
3. Healthcheck probes targeted non-existent routes (`/api/health/ready`).
4. Core commerce database tables stored monetary values as `NUMERIC(10,2)` rupees, while ledger tables used integer paise `BIGINT`.
5. CI suppressed audit failures with `|| true` and lacked SBOM generation.

## Decisions
1. **Docker Compose Environment Isolation**:
   - Converted `docker-compose.yml` to consume secrets from `.env` via `env_file`.
   - Bound all host ports strictly to `127.0.0.1` and mandated Redis password authentication.
   - Added `.env.production.example` with template values that deliberately fail the boot guard until high-entropy production secrets are provisioned.
2. **Resilient Probe Routing**:
   - Realigned docker healthchecks to `/health/readiness`.
   - Added router aliases in `app.js` for `/api/health/ready`, `/api/health/readiness`, and `/api/health/live` to guarantee compatibility across varied orchestration environments (K8s, ALB, Docker).
3. **Additive Integer Paise Database Migration (F-050, F-054)**:
   - Implemented `0012_integer_paise_and_constraints.sql` following the zero-downtime expand-migrate pattern.
   - Added canonical `*_paise BIGINT` columns to `products`, `orders`, `order_items`, and `coupons`.
   - Added physical domain CHECK constraints (`stock >= 0`, `quantity > 0`, `paise >= 0`) and foreign key performance indexes.
4. **Supply Chain Security Gate (F-041, F-063)**:
   - Removed error suppression on `npm audit --audit-level=high` in CI to ensure high and critical vulnerabilities break the build.
   - Resolved all dependencies (`found 0 vulnerabilities`).
   - Integrated automated SBOM inventory generation (`npm run sbom` -> `docs/evidence/sbom-inventory.json`).

## Consequences
- The container stack boots cleanly and safely in production.
- Database enforces physical and financial invariants at the schema level without breaking legacy decimal columns.
- Test suites enforce 100% threshold compliance (80% global, 95% on algorithmic code).
