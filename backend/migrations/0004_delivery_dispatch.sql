-- Migration: 0004_delivery_dispatch.sql
-- Real-time delivery dispatch, drivers, assignments, and location tracking

CREATE TABLE IF NOT EXISTS drivers (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  phone       VARCHAR(20) NOT NULL UNIQUE,
  current_lat NUMERIC(10,6) NOT NULL DEFAULT 12.935240,
  current_lng NUMERIC(10,6) NOT NULL DEFAULT 77.624480,
  status      VARCHAR(20) NOT NULL DEFAULT 'IDLE' CHECK (status IN ('IDLE', 'ASSIGNED', 'EN_ROUTE', 'OFFLINE')),
  rating      NUMERIC(3,2) NOT NULL DEFAULT 5.00 CHECK (rating >= 1.00 AND rating <= 5.00),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);

CREATE TABLE IF NOT EXISTS delivery_assignments (
  id                     SERIAL PRIMARY KEY,
  order_id               INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id              INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  status                 VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'DELIVERED', 'CANCELLED')),
  assigned_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at            TIMESTAMPTZ,
  pickup_at              TIMESTAMPTZ,
  delivered_at           TIMESTAMPTZ,
  distance_km            NUMERIC(6,3) NOT NULL DEFAULT 0.000,
  estimated_duration_min NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_order ON delivery_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_driver ON delivery_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_status ON delivery_assignments(status);

CREATE TABLE IF NOT EXISTS driver_location_logs (
  id          SERIAL PRIMARY KEY,
  driver_id   INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  lat         NUMERIC(10,6) NOT NULL,
  lng         NUMERIC(10,6) NOT NULL,
  speed_kmh   NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_logs_driver_time ON driver_location_logs(driver_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_logs_order_time ON driver_location_logs(order_id, recorded_at DESC);

-- Optional coordinates on orders for delivery destination
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(10,6) DEFAULT 12.971598;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(10,6) DEFAULT 77.594566;

-- Seed default initial fleet of delivery drivers if empty
INSERT INTO drivers (name, phone, current_lat, current_lng, status, rating)
VALUES
  ('Ramesh Kumar', '+919876543201', 12.935240, 77.624480, 'IDLE', 4.85),
  ('Suresh Patel', '+919876543202', 12.936500, 77.621200, 'IDLE', 4.92),
  ('Anil Sharma', '+919876543203', 12.932100, 77.628500, 'IDLE', 4.75),
  ('Vikram Singh', '+919876543204', 12.940500, 77.620100, 'IDLE', 4.68),
  ('Priya Nair', '+919876543205', 12.931200, 77.623400, 'IDLE', 4.98)
ON CONFLICT (phone) DO NOTHING;
