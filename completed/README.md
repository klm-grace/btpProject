# Suivi d'avancement du projet

Ce fichier documente l'avancement des sections du projet Architecture & BTP.

---

## Sections

- [x] **Section 1 — Initialisation du projet**
  - Structure du repository
  - Docker Compose (PostgreSQL 18 + Redis)
  - Configuration Bun/TypeScript
  - Variables d'environnement
  - Bibliothèques : errors, config, logger, db, redis, health
  - API : GET /health
  - Tests unitaires et d'intégration (36 tests passants)
  - Collection Bruno (3 requêtes, 6 assertions)
  - Bascule dev/prod par env uniquement

- [x] **Section 2 — Base de données et migrations**
  - Schéma PostgreSQL complet (11 tables obligatoires)
  - Enums : user_status, content_status, lead_status, media_type, appointment_status
  - Contraintes : clés étrangères, uniques partiels, CHECK
  - Index : slugs, statuts, dates, clés étrangères
  - Bibliothèque migrations (createMigrations, up/down/status)
  - Table `_migrations` (11 migrations appliquées)
  - Seeds : rôles, permissions, admin user
  - Tests : tables, contraintes, index, seeds (12 tests passants)
  - Collection Bruno (2 requêtes)
  - README bibliothèque migrations

- [ ] **Section 2 — Base de données et migrations**
- [ ] **Section 3 — API de base**
- [ ] **Section 4 — Sécurité HTTP, CORS et proxy**
- [ ] **Section 5 — Authentification, sessions et MFA**
- [ ] **Section 6 — Rôles, permissions et autorisations**
- [ ] **Section 7 — CSRF et protection des mutations**
- [ ] **Section 8 — Formulaires publics contact / devis**
- [ ] **Section 9 — Upload et pipeline médias**
- [ ] **Section 10 — Admin portfolio : réalisations et catégories**
- [ ] **Section 11 — Admin contenus éditoriaux**
- [ ] **Section 12 — Admin gestion des leads**
- [ ] **Section 13 — Rate limiting avancé et événements de sécurité**
- [ ] **Section 14 — Frontend public Next.js**
- [ ] **Section 15 — Frontend admin Next.js**
- [ ] **Section 16 — Tests, sécurité et charge**
- [ ] **Section 17 — Déploiement, observabilité et sauvegardes**

---

## Légende

- `[x]` = terminée et validée
- `[ ]` = à venir
