-- Médias uploadés (images, vidéos, documents)
CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INT NOT NULL,
    storage_key TEXT NOT NULL, -- clé S3 / chemin
    alt_text TEXT,
    caption TEXT,
    type media_type NOT NULL,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_type ON media (type);

-- Variantes d'un média (thumbnails, etc.)
CREATE TABLE media_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL,
    width INT,
    height INT,
    label TEXT, -- 'thumbnail', 'medium', 'large', etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_variants_media ON media_variants (media_id);