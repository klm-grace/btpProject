-- Seed : rôle admin et utilisateur admin par défaut
-- Mot de passe hashé via Bun.password (argon2id) dans le script seed.
-- Ce fichier est un template SQL ; le hash est inséré par le script seed.ts.

INSERT INTO roles (id, name, description) VALUES
    ('00000000-0000-0000-0000-000000000000', 'owner', 'Propriétaire du compte'),
    ('00000000-0000-0000-0000-000000000001', 'admin', 'Administrateur système'),
    ('00000000-0000-0000-0000-000000000002', 'editor', 'Éditeur de contenus'),
    ('00000000-0000-0000-0000-000000000003', 'viewer', 'Lecteur seule')
ON CONFLICT (id) DO NOTHING;

-- Permissions de base
INSERT INTO permissions (id, name, description) VALUES
    ('00000000-0000-0000-0000-000000000010', 'users.read', 'Lire les utilisateurs'),
    ('00000000-0000-0000-0000-000000000011', 'users.write', 'Créer/modifier les utilisateurs'),
    ('00000000-0000-0000-0000-000000000012', 'content.read', 'Lire les contenus'),
    ('00000000-0000-0000-0000-000000000013', 'content.write', 'Créer/modifier les contenus'),
    ('00000000-0000-0000-0000-000000000014', 'leads.read', 'Lire les leads'),
    ('00000000-0000-0000-0000-000000000015', 'leads.write', 'Gérer les leads'),
    ('00000000-0000-0000-0000-000000000016', 'media.upload', 'Uploader des médias'),
    ('00000000-0000-0000-0000-000000000017', 'settings.manage', 'Gérer les paramètres'),
    ('00000000-0000-0000-0000-000000000018', 'monitoring.view', 'Voir les détails de santé'),
    ('00000000-0000-0000-0000-000000000020', 'portfolio.read', 'Lire le portfolio'),
    ('00000000-0000-0000-0000-000000000021', 'portfolio.write', 'Gérer le portfolio')
ON CONFLICT (id) DO NOTHING;

-- Admin a toutes les permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM permissions
ON CONFLICT DO NOTHING;

-- Owner a toutes les permissions (comme admin, non supprimable)
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000000', id FROM permissions
ON CONFLICT DO NOTHING;

-- Editor a les permissions de contenu et médias
INSERT INTO role_permissions (role_id, permission_id) VALUES
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000013'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000016')
ON CONFLICT DO NOTHING;

-- Viewer a uniquement les permissions de lecture
INSERT INTO role_permissions (role_id, permission_id) VALUES
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000012'),
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000014')
ON CONFLICT DO NOTHING;