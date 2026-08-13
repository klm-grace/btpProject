-- Outbox pour événements fiables (pattern transactional outbox)
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_events_published ON outbox_events (published) WHERE NOT published;
CREATE INDEX idx_outbox_events_type ON outbox_events (event_type);