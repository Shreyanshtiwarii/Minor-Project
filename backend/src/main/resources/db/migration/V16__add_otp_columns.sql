-- V16__add_otp_columns.sql
-- Email OTP (6-digit code) for signup verification and password reset.
-- Only a BCrypt hash of the code is stored, never the plain code.
-- One active OTP per user; otp_purpose is VERIFY_EMAIL or RESET_PASSWORD so a code
-- issued for one flow can't be used for the other.

ALTER TABLE app_users ADD COLUMN otp_hash VARCHAR(100);
ALTER TABLE app_users ADD COLUMN otp_purpose VARCHAR(30);
ALTER TABLE app_users ADD COLUMN otp_expires_at TIMESTAMP;
ALTER TABLE app_users ADD COLUMN otp_sent_at TIMESTAMP;
ALTER TABLE app_users ADD COLUMN otp_attempts INTEGER NOT NULL DEFAULT 0;
