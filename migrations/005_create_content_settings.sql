-- Paramètres globaux du site (clé-valeur)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profil de l'entreprise
CREATE TABLE company_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tagline TEXT,
    description TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    social_links JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sections éditoriales réutilisables (page d'accueil, etc.)
CREATE TABLE content_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    body JSONB DEFAULT '{}',
    status content_status NOT NULL DEFAULT 'draft',
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_content_sections_slug_active ON content_sections (slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_content_sections_status ON content_sections (status) WHERE deleted_at IS NULL;

-- SEO metadata
CREATE TABLE seo_metas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL, -- 'content_section', 'project', 'service', etc.
    entity_id UUID NOT NULL,
    title TEXT,
    description TEXT,
    og_image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_seo_metas_entity ON seo_metas (entity_type, entity_id);