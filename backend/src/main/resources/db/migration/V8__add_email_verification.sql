-- V8__add_email_verification.sql
-- Adds production-ready signup email verification (Brevo, Phase 2).
-- New local signups start unverified and must confirm via a one-time emailed token
-- before they can log in. Google Sign-In accounts are verified by Google itself.

ALTER TABLE app_users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN verification_token VARCHAR(255);
ALTER TABLE app_users ADD COLUMN verification_token_expires_at TIMESTAMP;
ALTER TABLE app_users ADD COLUMN verification_sent_at TIMESTAMP;

CREATE INDEX idx_users_verification_token ON app_users (verification_token);

-- Backfill: every account that already exists (created before this deploy, under the old
-- flow that never required verification) is grandfathered in as verified so nobody currently
-- using the app gets locked out retroactively. Only new signups from here on are gated.
UPDATE app_users SET email_verified = TRUE;
