-- Catégories de projets (Résidentiel, Commercial, etc.)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_categories_slug ON categories (slug);

-- Projets portfolio
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    location TEXT,
    year INT,
    status content_status NOT NULL DEFAULT 'draft',
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_projects_slug_active ON projects (slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_status ON projects (status) WHERE deleted_at IS NULL;

-- Liaison projet-catégorie (Many-to-Many)
CREATE TABLE project_categories (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, category_id)
);

CREATE INDEX idx_project_categories_project ON project_categories (project_id);
CREATE INDEX idx_project_categories_category ON project_categories (category_id);

-- Images d'un projet
CREATE TABLE project_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    is_cover BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_images_project ON project_images (project_id);