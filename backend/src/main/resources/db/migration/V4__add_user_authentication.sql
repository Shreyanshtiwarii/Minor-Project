-- V4__add_user_authentication.sql
-- Adds real authentication support (local password + Google OAuth) to app_users

ALTER TABLE app_users ADD COLUMN password_hash VARCHAR(255);
ALTER TABLE app_users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'LOCAL';
ALTER TABLE app_users ADD COLUMN google_id VARCHAR(255);

CREATE INDEX idx_users_google_id ON app_users (google_id);
