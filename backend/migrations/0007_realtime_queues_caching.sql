-- Migration: 0007_realtime_queues_caching.sql
-- Real-Time Systems Showcase: Stock Reservations, Transactional Outbox, In-App Notifications

-- 1. Stock Reservations Table (10-minute hold during checkout)
CREATE TABLE IF NOT EXISTS stock_reservations (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, COMMITTED, RELEASED, EXPIRED
  reserved_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_user_status ON stock_reservations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_prod_status ON stock_reservations(product_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_expires ON stock_reservations(expires_at, status);

-- 2. Transactional Outbox Pattern Table (reliable at-least-once event delivery)
CREATE TABLE IF NOT EXISTS outbox_events (
  id              SERIAL PRIMARY KEY,
  aggregate_type  VARCHAR(50) NOT NULL,
  aggregate_id    VARCHAR(100) NOT NULL,
  event_type      VARCHAR(100) NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, PUBLISHED, FAILED
  retry_count     INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status_created ON outbox_events(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate ON outbox_events(aggregate_type, aggregate_id);

-- 3. Notifications Table (In-app notifications & multi-channel persistence)
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB DEFAULT '{}'::jsonb,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at DESC);
