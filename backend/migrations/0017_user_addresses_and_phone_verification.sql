-- Migration: 0017_user_addresses_and_phone_verification.sql
-- Real address book, phone verification via OTP, geofence stores, and payment constraint expansion (P0)

-- 1. Real User Address Book Table
CREATE TABLE IF NOT EXISTS user_addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(50) NOT NULL DEFAULT 'Home',
  recipient_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  landmark VARCHAR(255),
  city VARCHAR(100) NOT NULL DEFAULT 'Hyderabad',
  pincode VARCHAR(10) NOT NULL,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_default ON user_addresses(user_id, is_default);

-- 2. Phone Verification via OTP Table
CREATE TABLE IF NOT EXISTS phone_verifications (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  otp_hash VARCHAR(128) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_verifications_lookup ON phone_verifications(phone, expires_at);

-- 3. Add is_phone_verified to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN DEFAULT FALSE;

-- 4. Add delivery_address_id to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address_id INTEGER REFERENCES user_addresses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_delivery_address ON orders(delivery_address_id);

-- 5. Add optional comment column to ai_feedback
ALTER TABLE ai_feedback ADD COLUMN IF NOT EXISTS comment TEXT;

-- 6. Expand payment_orders and payment_events status constraints for lifecycle safety
ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_status_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_status_check 
  CHECK (status IN ('CREATED', 'ATTEMPTED', 'PAID', 'FAILED', 'REFUNDED', 'DISMISSED', 'EXPIRED'));

ALTER TABLE payment_events DROP CONSTRAINT IF EXISTS payment_events_status_check;
ALTER TABLE payment_events ADD CONSTRAINT payment_events_status_check 
  CHECK (status IN ('PROCESSED', 'DUPLICATE', 'FAILED', 'IGNORED', 'TAMPER_DETECTED', 'LATE_FAILURE_IGNORED', 'CAPTURED_AFTER_CANCELLED'));

-- 7. Dark Stores Seed (Hyderabad & Bengaluru Dark Stores with Service Geofences)
INSERT INTO stores (id, code, name, city, address, lat, lng, service_radius_km)
VALUES
  (4, 'HYD_BANJARA_01', 'Banjara Hills Dark Store #1', 'Hyderabad', 'Road No 12, Banjara Hills, Hyderabad', 17.415600, 78.435700, 10.00),
  (5, 'HYD_HITEC_01', 'Hitec City Dark Store #2', 'Hyderabad', 'Cyber Towers, Hitec City, Madhapur, Hyderabad', 17.447400, 78.376200, 10.00)
ON CONFLICT (id) DO NOTHING;
