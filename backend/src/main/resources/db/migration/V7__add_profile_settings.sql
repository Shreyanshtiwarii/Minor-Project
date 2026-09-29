-- V7__add_profile_settings.sql
-- Adds support for the Profile Settings "Change Email" flow. Email changes are not applied
-- immediately: we stage the requested address + a one-time verification token here, and the
-- swap onto app_users.email only happens once the link is confirmed (Phase 2).

ALTER TABLE app_users ADD COLUMN pending_email VARCHAR(255);
ALTER TABLE app_users ADD COLUMN email_change_token VARCHAR(255);
ALTER TABLE app_users ADD COLUMN email_change_token_expires_at TIMESTAMP;

CREATE INDEX idx_users_email_change_token ON app_users (email_change_token);
