-- Migration: 0003_recommendations.sql
-- Product associations, collaborative filtering pairs, and A/B testing event storage

CREATE TABLE IF NOT EXISTS product_associations (
  id             SERIAL PRIMARY KEY,
  antecedent_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  consequent_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  support        NUMERIC(8,6) NOT NULL,
  confidence     NUMERIC(8,6) NOT NULL,
  lift           NUMERIC(10,4) NOT NULL,
  algorithm      VARCHAR(20) NOT NULL DEFAULT 'fp_growth',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (antecedent_id, consequent_id, algorithm)
);

CREATE INDEX IF NOT EXISTS idx_prod_assoc_antecedent ON product_associations(antecedent_id);
CREATE INDEX IF NOT EXISTS idx_prod_assoc_lift ON product_associations(lift DESC);

CREATE TABLE IF NOT EXISTS user_reorder_habits (
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_count       INTEGER NOT NULL DEFAULT 1,
  typical_gap_days  NUMERIC(8,2) NOT NULL DEFAULT 7.0,
  last_purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS ab_events (
  id              SERIAL PRIMARY KEY,
  experiment_key  VARCHAR(60) NOT NULL,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  variant         VARCHAR(20) NOT NULL,
  event_type      VARCHAR(40) NOT NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_events_exp ON ab_events(experiment_key, event_type);
