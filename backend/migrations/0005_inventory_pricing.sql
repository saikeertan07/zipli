-- Migration: 0005_inventory_pricing.sql
-- Inventory Intelligence: FEFO Batches, Perishability, Dynamic Price Audit Trail

-- 1. Extend products table with cost and perishability attributes
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_perishable BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER DEFAULT 14;

-- 2. FEFO Product Batches
CREATE TABLE IF NOT EXISTS product_batches (
  id               SERIAL PRIMARY KEY,
  product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_number     VARCHAR(60) NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity >= 0),
  initial_quantity INTEGER NOT NULL CHECK (initial_quantity >= 0),
  expiry_date      TIMESTAMPTZ NOT NULL,
  cost_price       NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_batch UNIQUE (product_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_product_batches_product ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON product_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_product_batches_product_expiry ON product_batches(product_id, expiry_date ASC);

-- 3. Price Changes Audit Log
CREATE TABLE IF NOT EXISTS price_changes (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  old_price  NUMERIC(10,2) NOT NULL,
  new_price  NUMERIC(10,2) NOT NULL,
  reason     VARCHAR(255) NOT NULL,
  actor      VARCHAR(100) NOT NULL DEFAULT 'SYSTEM_DYNAMIC_PRICING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_changes_product ON price_changes(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_changes_created ON price_changes(created_at DESC);
