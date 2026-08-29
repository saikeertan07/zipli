-- 0009_staff_mfa.sql
-- Add TOTP MFA secret and status columns to users table (SEC-AUTH-02, F-015)

ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
