-- Logs d'audit
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- 'create', 'update', 'delete', 'login', etc.
    entity_type TEXT,
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at);

-- Événements de sécurité
CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'login_failed', 'password_changed', 'mfa_enabled', etc.
    ip_address INET,
    user_agent TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_events_user ON security_events (user_id);
CREATE INDEX idx_security_events_type ON security_events (event_type);
CREATE INDEX idx_security_events_created ON security_events (created_at);