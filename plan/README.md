# Projet — Site vitrine Architecture & BTP
## Stack : Bun.js natif + PostgreSQL + Next.js

Ce repository contient le plan de réalisation complet du projet.

Le projet est un site internet professionnel pour une entreprise d’Architecture & BTP, avec :

- présentation de l’entreprise,
- présentation des services,
- présentation de l’équipe,
- portfolio de réalisations,
- formulaire de contact,
- formulaire de demande de devis,
- intégration téléphone / WhatsApp / Google Maps,
- espace d’administration autonome,
- administration utilisable depuis ordinateur et téléphone,
- mentions légales et conformité RGPD de base.

---

## Hors périmètre

WordPress et MCP sont hors périmètre.
Ce projet concerne uniquement la stack custom :

- Backend : Bun.js natif
- Base de données : PostgreSQL
- Cache / sessions / rate limiting : Redis
- Stockage fichiers : S3 compatible
- Frontend : Next.js

---

## Règle de fonctionnement — NON NÉGOCIABLE

L’agent de développement doit respecter strictement ce fonctionnement :

1. Avant tout code, proposer le découpage complet en sections.
2. Attendre validation explicite avant de commencer.
3. Implémenter une seule section à la fois.
4. Ne jamais passer à la section suivante sans validation.
5. Poser une question si un choix technique n’est pas tranché.
6. Ne jamais prendre seul une décision structurante.
7. Ne jamais ajouter une dépendance non autorisée.
8. Ne jamais considérer une section comme terminée si elle n’est pas testée, documentée et sécurisée.

---

## Stack imposée

### Backend

- Bun
- `Bun.serve`
- `Bun.sql`
- `Bun.redis`
- `Bun.S3Client`
- `Bun.password`
- `Bun.Image`
- `bun:test`

### Frontend

- Next.js
- React
- TypeScript

### Sécurité / validation

- Zod uniquement pour la validation
- pas de framework backend
- pas d’ORM lourd
- pas de librairie d’authentification
- pas de dépendance inutile

---

## Découpage final

Le projet est découpé en 17 sections :

1. Initialisation du projet
2. Base de données et migrations
3. API de base
4. Sécurité HTTP, CORS et proxy
5. Authentification, sessions et MFA
6. Rôles, permissions et autorisations
7. CSRF et protection des mutations
8. Formulaires publics contact / devis
9. Upload et pipeline médias
10. Admin portfolio : réalisations et catégories
11. Admin contenus éditoriaux
12. Admin gestion des leads
13. Rate limiting avancé et événements de sécurité
14. Frontend public Next.js
15. Frontend admin Next.js
16. Tests, sécurité et charge
17. Déploiement, observabilité et sauvegardes

Chaque section possède son propre fichier `README.md` dans `docs/sections/`.

---

## Définition globale de “terminé”

Une section est terminée uniquement si :

- le code est fonctionnel,
- les tests passent,
- la validation des entrées est en place,
- les erreurs sont propres,
- la sécurité est couverte,
- les logs sont propres,
- aucun secret n’est exposé,
- la documentation est à jour,
- aucun contournement silencieux n’a été introduit.

---

## Interdictions globales

- Ne jamais concaténer du SQL.
- Ne jamais committer de secret.
- Ne jamais exposer Redis ou PostgreSQL publiquement.
- Ne jamais stocker durablement un fichier utilisateur sur le disque applicatif.
- Ne jamais renvoyer une erreur technique brute au client.
- Ne jamais logger des données sensibles.
- Ne jamais avancer plusieurs sections en parallèle.
- Ne jamais ajouter une dépendance serveur non validée.

---

## Format de compte-rendu obligatoire

À la fin de chaque section, l’agent doit produire :

- fichiers créés / modifiés,
- comment tester,
- points de sécurité couverts,
- points RGPD couverts si applicable,
- tests exécutés,
- ce qui reste pour les sections suivantes,
- demande explicite de validation.
