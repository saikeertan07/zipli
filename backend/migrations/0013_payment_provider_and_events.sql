-- Migration 0013: Payment Provider Orders, Webhook Events & Idempotency
-- Requirement: F-044 (Payment Webhook Edge Scenarios), F-053 (Webhook-Driven Server Verification)

CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL DEFAULT 'RAZORPAY',
  provider_order_id VARCHAR(128) NOT NULL UNIQUE,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  status VARCHAR(32) NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'ATTEMPTED', 'PAID', 'FAILED', 'REFUNDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_order ON payment_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_provider_ref ON payment_orders(provider_order_id);

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL,
  event_id VARCHAR(128) NOT NULL UNIQUE,
  event_type VARCHAR(64) NOT NULL,
  provider_order_id VARCHAR(128),
  payment_id VARCHAR(128),
  amount_paise BIGINT,
  status VARCHAR(32) NOT NULL DEFAULT 'PROCESSED' CHECK (status IN ('PROCESSED', 'DUPLICATE', 'FAILED', 'IGNORED', 'TAMPER_DETECTED')),
  raw_payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_event_id ON payment_events(event_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_order_ref ON payment_events(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id ON payment_events(payment_id);
