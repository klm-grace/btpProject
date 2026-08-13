-- Enums réutilisés dans le schéma
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE content_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'converted', 'archived');
CREATE TYPE media_type AS ENUM ('image', 'video', 'document');
CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');