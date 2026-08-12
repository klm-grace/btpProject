# Section 2 — Base de données et migrations

## Objectif

Créer un modèle de données complet, sûr, indexé et prêt à accueillir toutes les fonctionnalités du site.

---

## Périmètre

Cette section couvre :

- le schéma PostgreSQL complet,
- les contraintes,
- les index,
- les relations,
- les enums ou checks,
- le système de migration versionné,
- les seeds minimales,
- la documentation du modèle.

### Prérequis (section 01)

- PostgreSQL accessible via les variables d’environnement (conteneur Docker local en dev).
- Les migrations et seeds s’exécutent **contre l’URL / les credentials fournis par l’env**.
- Aucune cible de base hardcodée : la même commande de migration fonctionne en dev (Docker) et en prod (DB en ligne) en changeant uniquement l’env.

---

## Tables obligatoires

### Sécurité / utilisateurs

- users
- roles
- permissions
- role_permissions
- user_roles
- sessions
- audit_logs
- security_events

### Contenus

- settings
- company_profile
- content_sections
- seo_metas
- media
- media_variants
- categories
- projects
- project_categories
- project_images
- services
- service_projects
- team_members

### Leads

- contact_requests
- quote_requests
- quote_request_files
- appointments

### Fiabilité

- outbox_events

---

## Règles de base de données

- clés étrangères obligatoires,
- contraintes `CHECK` sur statuts et valeurs critiques,
- index sur clés étrangères,
- index sur slugs,
- index sur statuts,
- index sur dates,
- unique partiel pour slugs actifs,
- soft delete sur contenus éditoriaux,
- `created_at` et `updated_at` sur tables pertinentes,
- versioning optimiste sur entités critiques.

---

## Recommandations

- UUIDv7 générés côté applicatif,
- `deleted_at` pour contenus,
- statut explicite : draft / published / archived,
- conservation des leads et logs sans suppression sauvage.

---

## Sécurité

- intégrité référentielle forte,
- pas de suppression en cascade non maîtrisée,
- contraintes au niveau base, pas seulement applicatives,
- migrations versionnées et rejouables.

---

## Critères d’acceptation

- [ ] Toutes les tables obligatoires sont créées.
- [ ] Les contraintes sont présentes.
- [ ] Les index sont présents.
- [ ] Les migrations sont versionnées.
- [ ] Une table de suivi des migrations existe.
- [ ] Les migrations peuvent être rejouées proprement.
- [ ] Une seed admin de test peut être créée.
- [ ] Le modèle est documenté.
- [ ] Aucune requête SQL n’est construite par concaténation.

---

## Tests à effectuer

- exécuter les migrations sur une base vide,
- vérifier les contraintes,
- vérifier les index,
- insérer des données de test,
- vérifier les relations,
- vérifier les uniques partiels.
