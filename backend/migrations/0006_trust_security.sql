-- Migration: 0006_trust_security.sql
-- Trust, Security, Immutable Audit Hash Chains, and Abuse Prevention

-- 1. Immutable Cryptographic Admin Audit Logs Hash Chain
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id           SERIAL PRIMARY KEY,
  admin_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action       VARCHAR(100) NOT NULL,
  target_type  VARCHAR(100) NOT NULL,
  target_id    VARCHAR(100),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash    CHAR(64) NOT NULL,
  current_hash CHAR(64) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin ON admin_audit_logs(admin_id);

-- 2. Fraud Risk Assessment Columns on Orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fraud_score NUMERIC(5,4) DEFAULT 0.0000;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fraud_decision VARCHAR(20) DEFAULT 'ALLOW';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fraud_signals JSONB DEFAULT '{}'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fraud_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fraud_reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_fraud_decision ON orders(fraud_decision);

-- 3. Security, Lockout, and Privacy / Anonymization Columns on Users
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_anonymized BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;
