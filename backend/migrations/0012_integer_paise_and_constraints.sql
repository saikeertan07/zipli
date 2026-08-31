-- Migration 0012: Integer Paise Canonical Columns, Check Constraints & Foreign Key Indexes
-- Requirements: F-050 (Integer Paise Model), F-054 (Database Schema Integrity Constraints)
-- Architecture: Expand -> Migrate -> Contract pattern (Zero-downtime backwards compatible)

-- 1. EXPAND: Add integer paise columns to commercial and inventory tables
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS price_paise BIGINT CHECK (price_paise >= 0),
  ADD COLUMN IF NOT EXISTS mrp_paise BIGINT CHECK (mrp_paise >= 0),
  ADD COLUMN IF NOT EXISTS cost_price_paise BIGINT CHECK (cost_price_paise >= 0);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS item_total_paise BIGINT CHECK (item_total_paise >= 0),
  ADD COLUMN IF NOT EXISTS delivery_fee_paise BIGINT CHECK (delivery_fee_paise >= 0),
  ADD COLUMN IF NOT EXISTS discount_paise BIGINT CHECK (discount_paise >= 0),
  ADD COLUMN IF NOT EXISTS taxes_paise BIGINT CHECK (taxes_paise >= 0),
  ADD COLUMN IF NOT EXISTS grand_total_paise BIGINT CHECK (grand_total_paise >= 0);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS unit_price_paise BIGINT CHECK (unit_price_paise >= 0),
  ADD COLUMN IF NOT EXISTS line_total_paise BIGINT CHECK (line_total_paise >= 0);

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS min_total_paise BIGINT CHECK (min_total_paise >= 0),
  ADD COLUMN IF NOT EXISTS max_discount_paise BIGINT CHECK (max_discount_paise >= 0),
  ADD COLUMN IF NOT EXISTS flat_discount_paise BIGINT CHECK (flat_discount_paise >= 0);

-- 2. MIGRATE: Backfill integer paise from existing decimal rupee columns
UPDATE products
SET
  price_paise = ROUND(COALESCE(price, 0) * 100)::BIGINT,
  mrp_paise = ROUND(COALESCE(mrp, price, 0) * 100)::BIGINT,
  cost_price_paise = ROUND(COALESCE(cost_price, 0) * 100)::BIGINT
WHERE price_paise IS NULL;

UPDATE orders
SET
  item_total_paise = ROUND(COALESCE(item_total, 0) * 100)::BIGINT,
  delivery_fee_paise = ROUND(COALESCE(delivery_fee, 0) * 100)::BIGINT,
  discount_paise = ROUND(COALESCE(discount_amount, 0) * 100)::BIGINT,
  taxes_paise = ROUND(COALESCE(taxes, 0) * 100)::BIGINT,
  grand_total_paise = ROUND(COALESCE(grand_total, 0) * 100)::BIGINT
WHERE grand_total_paise IS NULL;

UPDATE order_items
SET
  unit_price_paise = ROUND(COALESCE(unit_price, 0) * 100)::BIGINT,
  line_total_paise = ROUND(COALESCE(unit_price, 0) * COALESCE(quantity, 1) * 100)::BIGINT
WHERE unit_price_paise IS NULL;

-- 3. CHECK CONSTRAINTS: Physical domain bounds (F-054)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_stock_non_negative'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT chk_products_stock_non_negative CHECK (stock >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_items_qty_positive'
  ) THEN
    ALTER TABLE order_items ADD CONSTRAINT chk_order_items_qty_positive CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cart_items_qty_positive'
  ) THEN
    ALTER TABLE cart_items ADD CONSTRAINT chk_cart_items_qty_positive CHECK (quantity > 0);
  END IF;
END $$;

-- 4. PERFORMANCE & DATA INTEGRITY: Foreign Key Indexes (F-054)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders (store_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items (user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items (product_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_product_id ON product_batches (product_id);
CREATE INDEX IF NOT EXISTS idx_price_changes_product_id ON price_changes (product_id);
