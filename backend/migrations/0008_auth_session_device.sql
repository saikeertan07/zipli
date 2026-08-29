-- 0008_auth_session_device.sql
-- Add device_id tracking to refresh_tokens for device binding and session security (SEC-AUTH-04)

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS device_id VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_device ON refresh_tokens(device_id);
