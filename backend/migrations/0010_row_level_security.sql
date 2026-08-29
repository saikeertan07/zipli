-- Migration: 0010_row_level_security.sql
-- Multi-tenant Row-Level Security (RLS) for store-scoped and user-scoped tables

-- 1. Dark Stores Table
CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  city VARCHAR(60) NOT NULL DEFAULT 'Bengaluru',
  address VARCHAR(255),
  lat NUMERIC(10,6) NOT NULL DEFAULT 12.935240,
  lng NUMERIC(10,6) NOT NULL DEFAULT 77.624480,
  service_radius_km NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default dark stores if none exist
INSERT INTO stores (id, code, name, city, address, lat, lng, service_radius_km)
VALUES 
  (1, 'BLR_KORAMANGALA_01', 'Koramangala Dark Store #1', 'Bengaluru', '80 Feet Rd, Koramangala 4th Block, Bengaluru', 12.935240, 77.624480, 8.00),
  (2, 'BLR_INDIRANAGAR_01', 'Indiranagar Dark Store #2', 'Bengaluru', '100 Feet Rd, Indiranagar, Bengaluru', 12.971598, 77.594566, 8.00),
  (3, 'BLR_HSR_01', 'HSR Layout Dark Store #3', 'Bengaluru', '27th Main Rd, Sector 1, HSR Layout, Bengaluru', 12.911600, 77.638900, 8.00)
ON CONFLICT (id) DO NOTHING;

-- 2. Store-scoped store_inventory table
CREATE TABLE IF NOT EXISTS store_inventory (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_store_product UNIQUE (store_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_store_inventory_store ON store_inventory(store_id);
CREATE INDEX IF NOT EXISTS idx_store_inventory_product ON store_inventory(product_id);

-- 3. Add store_id to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id) DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);

-- 4. Enable Row Level Security on user-scoped and store-scoped tables
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_inventory ENABLE ROW LEVEL SECURITY;

-- 5. Policies for orders:
-- Admin or System: full access
-- Store staff: orders belonging to app.current_store
-- Customers: orders belonging to app.current_user
DROP POLICY IF EXISTS orders_rls_policy ON orders;
CREATE POLICY orders_rls_policy ON orders
  FOR ALL
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR current_setting('app.is_system', true) = 'true'
    OR (
      NULLIF(current_setting('app.current_user', true), '') IS NOT NULL
      AND user_id = NULLIF(current_setting('app.current_user', true), '')::integer
    )
    OR (
      NULLIF(current_setting('app.current_store', true), '') IS NOT NULL
      AND store_id = NULLIF(current_setting('app.current_store', true), '')::integer
    )
  )
  WITH CHECK (
    current_setting('app.is_admin', true) = 'true'
    OR current_setting('app.is_system', true) = 'true'
    OR (
      NULLIF(current_setting('app.current_user', true), '') IS NOT NULL
      AND user_id = NULLIF(current_setting('app.current_user', true), '')::integer
    )
    OR (
      NULLIF(current_setting('app.current_store', true), '') IS NOT NULL
      AND store_id = NULLIF(current_setting('app.current_store', true), '')::integer
    )
  );

-- 6. Policies for cart_items:
DROP POLICY IF EXISTS cart_items_rls_policy ON cart_items;
CREATE POLICY cart_items_rls_policy ON cart_items
  FOR ALL
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR current_setting('app.is_system', true) = 'true'
    OR (
      NULLIF(current_setting('app.current_user', true), '') IS NOT NULL
      AND user_id = NULLIF(current_setting('app.current_user', true), '')::integer
    )
  )
  WITH CHECK (
    current_setting('app.is_admin', true) = 'true'
    OR current_setting('app.is_system', true) = 'true'
    OR (
      NULLIF(current_setting('app.current_user', true), '') IS NOT NULL
      AND user_id = NULLIF(current_setting('app.current_user', true), '')::integer
    )
  );

-- 7. Policies for notifications:
DROP POLICY IF EXISTS notifications_rls_policy ON notifications;
CREATE POLICY notifications_rls_policy ON notifications
  FOR ALL
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR current_setting('app.is_system', true) = 'true'
    OR (
      NULLIF(current_setting('app.current_user', true), '') IS NOT NULL
      AND user_id = NULLIF(current_setting('app.current_user', true), '')::integer
    )
  )
  WITH CHECK (
    current_setting('app.is_admin', true) = 'true'
    OR current_setting('app.is_system', true) = 'true'
    OR (
      NULLIF(current_setting('app.current_user', true), '') IS NOT NULL
      AND user_id = NULLIF(current_setting('app.current_user', true), '')::integer
    )
  );

-- 8. Policies for stock_reservations:
DROP POLICY IF EXISTS stock_reservations_rls_policy ON stock_reservations;
CREATE POLICY stock_reservations_rls_policy ON stock_reservations
  FOR ALL
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR current_setting('app.is_system', true) = 'true'
    OR (
      NULLIF(current_setting('app.current_user', true), '') IS NOT NULL
      AND user_id = NULLIF(current_setting('app.current_user', true), '')::integer
    )
  )
  WITH CHECK (
    current_setting('app.is_admin', true) = 'true'
    OR current_setting('app.is_system', true) = 'true'
    OR (
      NULLIF(current_setting('app.current_user', true), '') IS NOT NULL
      AND user_id = NULLIF(current_setting('app.current_user', true), '')::integer
    )
  );

-- 9. Policies for store_inventory:
DROP POLICY IF EXISTS store_inventory_rls_policy ON store_inventory;
CREATE POLICY store_inventory_rls_policy ON store_inventory
  FOR ALL
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR current_setting('app.is_system', true) = 'true'
    OR (
      NULLIF(current_setting('app.current_store', true), '') IS NOT NULL
      AND store_id = NULLIF(current_setting('app.current_store', true), '')::integer
    )
  )
  WITH CHECK (
    current_setting('app.is_admin', true) = 'true'
    OR current_setting('app.is_system', true) = 'true'
    OR (
      NULLIF(current_setting('app.current_store', true), '') IS NOT NULL
      AND store_id = NULLIF(current_setting('app.current_store', true), '')::integer
    )
  );

-- 10. Role creation & Grants (guarded for non-superusers during test migrations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'zipli_app') THEN
    BEGIN
      CREATE ROLE zipli_app WITH LOGIN PASSWORD 'zipli_secure_app_pass_2026' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END IF;
END
$$;

DO $$
BEGIN
  GRANT USAGE ON SCHEMA public TO zipli_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO zipli_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO zipli_app;
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END
$$;
