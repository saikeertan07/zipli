# Zipli Pro — Production Operations & Reliability Runbook

> **Target Audience**: Site Reliability Engineers (SRE), DevOps, and Backend On-Call Engineers  
> **Service**: `zipli-pro` Quick-Commerce Platform  
> **Severity Tier**: Tier 1 (10-15m Delivery SLA)

---

## 1. Quick Reference & System Probes

| Endpoint / Command | Protocol | Expected Status / Value | Description |
|:-------------------|:--------:|:-----------------------:|:------------|
| `GET /health/liveness` | HTTP | `200 {"status":"UP"}` | Process liveness probe for Kubernetes / Docker |
| `GET /health/readiness`| HTTP | `200 {"status":"UP","db":"connected"}` | Database and Redis connectivity readiness probe |
| `GET /api/v1/health` | HTTP | `200 {"status":"success"}` | Public service availability check |
| `GET /metrics` | HTTP | `200 text/plain` (Prometheus) | Real-time Prometheus metrics export |
| `docker compose ps` | CLI | `Up (healthy)` | Status of all containerized stack services |

---

## 2. Standard Deployment & Startup Procedures

### 2.1 Starting the Entire Container Stack (Production)
```bash
# Pull images and build containers
docker compose build

# Start services in background with healthcheck guards
docker compose up -d

# Verify service health
docker compose ps
```

### 2.2 Local Bare-Metal Startup (Development)
```bash
cd backend
npm install
npm run db:migrate   # Applies all pending SQL schema migrations
npm run db:seed      # Seeds categories, products, and operational dark stores
npm start            # Boots Express API on http://localhost:5001
```

---

## 3. Database Migration Management

### 3.1 Applying Migrations
All migrations are located in `backend/migrations/` and track execution state via the `schema_migrations` table.
```bash
cd backend
npm run db:migrate
```

### 3.2 Rollback Procedure
If a migration fails or causes degradation:
1. Identify the failing migration file (e.g. `0015_feature.sql`).
2. Run the dedicated down-migration script or revert transactionally:
```bash
psql -U zipli_user -d zipli -c "DELETE FROM schema_migrations WHERE version = '0015_feature.sql';"
psql -U zipli_user -d zipli -f migrations/down/0015_feature_down.sql
```

---

## 4. Dead-Letter Queue (DLQ) Inspection & Replay

When asynchronous jobs (e.g. outbox notifications, inventory ledger syncing, order dispatch) exceed their maximum retry attempts (default: 3 attempts with exponential backoff), they are moved to the DLQ.

### 4.1 Checking DLQ Depth
```bash
# Query active DLQ jobs
curl -s http://localhost:5001/api/admin/queues | jq .data.dlq
```

### 4.2 Replaying Failed DLQ Jobs
```bash
# Re-queue all jobs from DLQ back into the active processing queue
curl -X POST http://localhost:5001/api/admin/queues/retry-dlq \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
```

---

## 5. Incident Response Playbooks

### Playbook 1: Elevated Search / Checkout Latency (p99 > 50ms)
**Symptoms**: High response time alerts on `/api/products` or `/api/orders`.
1. **Check System Load & CPU/Memory**:
   ```bash
   top -l 1 | grep node
   docker stats zipli_api zipli_postgres
   ```
2. **Verify In-Memory Search Engine Status**:
   - Check if catalog search service is performing a full re-index.
   - Inspect garbage collection frequency via `nodejs_gc_duration_seconds` metric at `/metrics`.
3. **Inspect Active Database Locks**:
   ```sql
   SELECT pid, age(clock_timestamp(), query_start), usename, query 
   FROM pg_stat_activity 
   WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%'
   ORDER BY age(clock_timestamp(), query_start) DESC;
   ```
4. **Action**: Terminate stuck long-running queries:
   ```sql
   SELECT pg_terminate_backend(<pid>);
   ```

---

### Playbook 2: Database Connection Pool Exhaustion
**Symptoms**: Log entries reporting `TimeoutError: ResourceRequest timed out` or `Cannot use a pool after calling end`.
1. **Check Pool Utilization**:
   ```bash
   curl -s http://localhost:5001/metrics | grep db_pool
   ```
2. **Immediate Remediation**:
   - Increase `PGPOOL_MAX` in `.env` from 20 to 50.
   - Restart API with zero dropped connections:
     ```bash
     docker compose restart api
     ```

---

### Playbook 3: Cryptographic Audit Hash Chain Tamper Detected
**Symptoms**: Automated verification job flags `Tamper Broken Index` or `Cryptographic mismatch`.
1. **Pinpoint the Tampered Record**:
   ```bash
   cd backend
   node -e "const { securityService } = require('./src/services/security.service'); securityService.verifyAuditChain().then(console.log);"
   ```
2. **Investigation**:
   - Inspect PostgreSQL WAL or query logs for manual `UPDATE` or `DELETE` statements on the `audit_logs` or `orders` table matching the row ID.
   - Compare row contents against database backups and WAL replica.
3. **Escalation**: Escalate to Chief Information Security Officer (CISO) and freeze affected account.

---

## 6. Disaster Recovery & Backups

### 6.1 Creating an Immediate Database Backup
```bash
pg_dump -U zipli_user -h localhost -d zipli -F c -b -v -f "/backups/zipli_$(date +%Y%m%d_%H%M%S).dump"
```

### 6.2 Restoring from Backup
```bash
# 1. Stop API traffic
docker compose stop api

# 2. Restore database
pg_restore -U zipli_user -h localhost -d zipli -c -v "/backups/zipli_target.dump"

# 3. Verify integrity
cd backend && npm run test:unit

# 4. Resume traffic
docker compose start api
```
