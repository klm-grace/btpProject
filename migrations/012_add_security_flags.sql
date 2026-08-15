-- Section 13 — Rate limiting avancé et événements de sécurité
-- Ajout de la colonne suspicious_note sur users et amélioration des index

ALTER TABLE users ADD COLUMN IF NOT EXISTS suspicious_note TEXT;

CREATE INDEX IF NOT EXISTS idx_security_events_user_created
  ON security_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_type_created
  ON security_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_ip_created
  ON security_events (ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;
