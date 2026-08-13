-- Services proposés
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    short_description TEXT,
    full_description TEXT,
    icon TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    status content_status NOT NULL DEFAULT 'draft',
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_services_slug_active ON services (slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_services_status ON services (status) WHERE deleted_at IS NULL;

-- Liaison service-projet
CREATE TABLE service_projects (
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, project_id)
);

CREATE INDEX idx_service_projects_service ON service_projects (service_id);
CREATE INDEX idx_service_projects_project ON service_projects (project_id);

-- Membres de l'équipe
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT,
    bio TEXT,
    photo_media_id UUID REFERENCES media(id) ON DELETE SET NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status content_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);