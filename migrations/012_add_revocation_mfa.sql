-- 012 — Auth : révocation de sessions + secret MFA
--
-- - sessions.revoked_at : révocation au lieu de suppression (audit conservé).
-- - users.mfa_secret : secret TOTP encodé en base32 (défense : jamais exposé via l'API).

ALTER TABLE sessions ADD COLUMN revoked_at TIMESTAMPTZ;

ALTER TABLE users ADD COLUMN mfa_secret TEXT;

CREATE INDEX idx_sessions_revoked ON sessions (revoked_at) WHERE revoked_at IS NOT NULL;
CREATE INDEX idx_sessions_token_hash ON sessions (token_hash);
