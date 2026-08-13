-- Demandes de contact
CREATE TABLE contact_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    subject TEXT,
    message TEXT NOT NULL,
    status lead_status NOT NULL DEFAULT 'new',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_requests_status ON contact_requests (status);
CREATE INDEX idx_contact_requests_created ON contact_requests (created_at);

-- Demandes de devis
CREATE TABLE quote_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    company TEXT,
    project_type TEXT,
    budget_range TEXT,
    description TEXT NOT NULL,
    status lead_status NOT NULL DEFAULT 'new',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_requests_status ON quote_requests (status);
CREATE INDEX idx_quote_requests_created ON quote_requests (created_at);

-- Fichiers joints aux devis
CREATE TABLE quote_request_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_request_id UUID NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_request_files_quote ON quote_request_files (quote_request_id);

-- Rendez-vous
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID, -- peut être null si pas encore converti
    contact_request_id UUID REFERENCES contact_requests(id) ON DELETE SET NULL,
    quote_request_id UUID REFERENCES quote_requests(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60,
    notes TEXT,
    status appointment_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appointments_scheduled ON appointments (scheduled_at);
CREATE INDEX idx_appointments_status ON appointments (status);