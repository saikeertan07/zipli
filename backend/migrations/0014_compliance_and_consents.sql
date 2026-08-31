-- Migration 0014: DPDP (Digital Personal Data Protection Act 2023) Consent Records
CREATE TABLE IF NOT EXISTS user_consents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  analytics_consent BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  communication_consent BOOLEAN NOT NULL DEFAULT TRUE,
  version VARCHAR(64) NOT NULL DEFAULT 'dpdp_v1_2026',
  ip_address VARCHAR(45),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user ON user_consents(user_id);
