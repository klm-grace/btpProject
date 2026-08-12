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

### Infrastructure locale (développement)

- Docker Compose pour **PostgreSQL** et **Redis**
- l’application se connecte **uniquement** via variables d’environnement
- en production : mêmes variables, valeurs pointant vers les services en ligne
- **aucun changement de code** pour basculer dev → prod (seulement le `.env` / secrets)

### Sécurité / validation

- Zod uniquement pour la validation
- pas de framework backend
- pas d’ORM lourd
- pas de librairie d’authentification
- pas de dépendance inutile

---

## Bibliothèques réutilisables — contrat NON NÉGOCIABLE

Les briques techniques vivent sous `src/libs/*`. Ce sont des **bibliothèques de code** : on les importe, on ne les lance pas.

### Principe

> Les bibliothèques sont des Lego de code. L’app les assemble. **Seul** le process API (`apps/api` via `Bun.serve`) et le frontend Next.js écoutent un port.

### Règles

1. **Une bibliothèque n’écoute jamais un port** — pas de `Bun.serve`, pas de `listen`, pas de process autonome dans `src/libs/*`.
2. **API pure** — factory `createXxx(config)` / fonctions exportées ; **aucun effet de bord à l’import**.
3. **Injection** — aucune lecture de `process.env` dans une bibliothèque ; la config (DB, Redis, S3, secrets) est passée en paramètre. Seule l’app lit l’env.
4. **Réutilisation** — copier la bibliothèque (ou l’extraire en package) dans un autre projet, injecter la config de *ce* projet, brancher sur *ses* routes — **sans tout réécrire**.
5. **Zéro métier BTP** dans les bibliothèques génériques (auth, CSRF, rate-limit, upload, sessions, pagination, errors, logger, health, db, redis, config…). Le métier (portfolio, leads, contenus) vit dans la couche app / handlers.
6. **Documentation** — chaque bibliothèque a son `README.md` local (rôle, API, prérequis, exemple d’import autre projet). **Pas** de fichier global d’architecture : ce contrat vit ici (`plan/README.md`), dans le prompt agent, et dans les README des bibliothèques.
7. **Dépendances** — entre bibliothèques uniquement via interfaces / paramètres explicites, pas de singletons cachés.

### Qui écoute un port ?

| Composant | Port ? | Rôle |
|-----------|--------|------|
| `apps/api` | Oui (`PORT`) | Composition HTTP |
| `apps/web` | Oui | Frontend Next.js |
| `src/libs/*` | **Non** | Bibliothèques importables |
| PostgreSQL / Redis | Infra | Externes |

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

Chaque section possède son propre fichier `README.md` dans `plan/`.

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
- Ne jamais hardcoder un hôte / port / credential de base de données ou de Redis dans le code.
- Ne jamais basculer dev/prod par branche de code : **uniquement** via variables d’environnement.
- Ne jamais stocker durablement un fichier utilisateur sur le disque applicatif.
- Ne jamais renvoyer une erreur technique brute au client.
- Ne jamais logger des données sensibles.
- Ne jamais avancer plusieurs sections en parallèle.
- Ne jamais ajouter une dépendance serveur non validée.
- Ne jamais laisser une requête SQL non maîtrisée atteindre la base de données.
- Ne jamais concaténer des entrées utilisateur dans une requête SQL.
- Ne jamais exécuter une requête sans paramètres bindés ou requête préparée.
- Ne jamais renvoyer ou logger des erreurs SQL brutes.
- Ne jamais faire d’une bibliothèque (`src/libs/*`) un serveur ou un process qui écoute un port.
- Ne jamais lire `process.env` à l’intérieur d’une bibliothèque.
- Ne jamais créer de fichier d’architecture global hors de ce plan et des README des bibliothèques.

---

## Format de compte-rendu obligatoire

À la fin de chaque section, l’agent doit produire :

- fichiers créés / modifiés,
- comment tester,
- points de sécurité couverts,
- points RGPD couverts si applicable,
- tests exécutés,
- bibliothèques livrées (confirmation : réutilisables, **pas de port**),
- ce qui reste pour les sections suivantes,
- demande explicite de validation.
