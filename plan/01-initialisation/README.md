# Section 1 — Initialisation du projet

## Objectif

Mettre en place la base technique du projet afin de démarrer le développement sur des fondations propres, sécurisées et reproductibles.

---

## Périmètre

Cette section couvre uniquement :

- la structure du repository,
- la configuration Bun / TypeScript,
- la configuration backend,
- la configuration frontend minimale,
- les variables d'environnement d'exemple,
- les scripts de développement,
- **Docker Compose local** pour PostgreSQL et Redis,
- la connexion à PostgreSQL via variables d'environnement,
- la connexion à Redis via variables d'environnement,
- un healthcheck simple.

---

## Hors périmètre

- logique métier,
- routes API complexes,
- authentification,
- base de données complète (schéma / migrations → section 2),
- frontend avancé,
- Dockerfiles applicatifs et reverse proxy (→ section 17).

---

## Infrastructure locale (obligatoire)

En développement, PostgreSQL et Redis **doivent** tourner via Docker Compose.

### Fichier attendu

- `docker-compose.yml` (ou `compose.yaml`) à la racine du monorepo / backend.

### Services obligatoires

| Service    | Image / rôle        | Exposition          | Usage applicatif      |
|------------|---------------------|---------------------|------------------------|
| PostgreSQL | `postgres` (version LTS documentée) | port local uniquement (ex. `127.0.0.1:5432`) | `Bun.sql` / `DATABASE_URL` |
| Redis      | `redis` (version documentée)        | port local uniquement (ex. `127.0.0.1:6379`) | `Bun.redis` / `REDIS_URL` |

### Règles Docker Compose

- volumes nommés pour la persistance des données de dev,
- healthchecks sur les deux services,
- **bind sur localhost uniquement** (jamais `0.0.0.0` exposé sans reverse proxy),
- credentials de dev uniquement dans `.env` (jamais hardcodés dans le code),
- le compose de dev ne doit **pas** publier PG/Redis sur Internet,
- un seul `docker compose up -d` doit suffire pour démarrer l'infra locale.

### Bascule dev → production (contrat non négociable)

- **Aucun code conditionnel** du type `if (NODE_ENV === "production")` pour choisir l'hôte DB/Redis.
- L'application lit **uniquement** les variables d'environnement.
- En dev : `.env` pointe vers les conteneurs locaux (`localhost` / noms de service si applicable).
- En prod : le même `.env` (ou secrets injectés) pointe vers PostgreSQL et Redis de production en ligne.
- Changer d'environnement = **changer les valeurs d'env**, pas le code ni les clients SQL/Redis.

---

## Livrables attendus

- arborescence claire du projet,
- `docker-compose.yml` avec PostgreSQL + Redis,
- fichier `.env.example` complet (URLs / hosts / ports / credentials de **placeholder**),
- scripts `infra:up`, `infra:down` (ou équivalent),
- scripts `dev`, `test`, `build`, `start`,
- configuration TypeScript,
- bibliothèques réutilisables `config`, `db`, `redis`, `logger`, `health` (et base `errors` si utile) sous `src/libs/`,
- clients PostgreSQL et Redis branchés sur l'env **via injection** (pas de `process.env` dans les bibliothèques),
- connexion PostgreSQL fonctionnelle contre le conteneur local,
- connexion Redis fonctionnelle contre le conteneur local,
- endpoint ou script de healthcheck (API + dépendance PG/Redis si pertinent) — **seul** le process API écoute un port,
- documentation de démarrage local (compose puis app) + README par bibliothèque.

---

## Variables d'environnement minimales (à documenter dans `.env.example`)

À adapter aux conventions Bun, mais le contrat doit couvrir au minimum :

- `NODE_ENV` / `APP_ENV`
- `DATABASE_URL` (ou `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`)
- `REDIS_URL` (ou `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` si utilisé)
- `PORT` (API)
- placeholders S3 / secrets réservés aux sections suivantes (documentés vides ou commentés si pas encore utilisés)

Règle : **mêmes noms de variables** en dev et en prod ; seules les **valeurs** changent.

---

## Règles techniques

- Bun doit être utilisé comme runtime backend.
- TypeScript doit être configuré proprement.
- Les secrets ne doivent jamais être commités.
- Les variables d'environnement doivent être documentées dans `.env.example`.
- Le projet doit pouvoir démarrer en local avec : infra Docker + une commande app simple.
- Connexions DB/Redis uniquement via env (`Bun.sql`, `Bun.redis`).
- Pas d'ORM ; pas de framework backend.

### Bibliothèques réutilisables

- Les briques `config`, `db`, `redis`, `logger`, `health`, `errors` sont des **bibliothèques importables** sous `src/libs/<nom>/`.
- **Aucune bibliothèque n'écoute un port** — seul `apps/api` démarre `Bun.serve` (ex. `GET /health`).
- Chaque bibliothèque expose `createXxx(config)` ; **aucune** lecture de `process.env` dans la bibliothèque (l'app injecte).
- Pas d'effet de bord à l'import ; README **dans** chaque bibliothèque (rôle, API, exemple d'import autre projet).
- Objectif réutilisation : pouvoir copier une bibliothèque dans un autre projet Bun sans la réécrire.

---

## Sécurité

- aucun secret réel dans le dépôt,
- `.env` ignoré par Git,
- credentials de l'exemple clairement factices,
- PostgreSQL et Redis **non exposés publiquement** (localhost / réseau Docker privé),
- pas de dépendances inutiles,
- structure prête pour conteneurs non-root (section 17).

---

## Critères d'acceptation

- [ ] Le repository possède une structure claire.
- [ ] `docker-compose.yml` démarre PostgreSQL et Redis.
- [ ] Les services Compose ont des healthchecks.
- [ ] PG et Redis n'écoutent que en local / réseau privé.
- [ ] Bun démarre sans erreur.
- [ ] TypeScript est configuré.
- [ ] `.env.example` liste toutes les variables nécessaires (mêmes noms qu'en prod).
- [ ] La connexion PostgreSQL fonctionne **via l'env** contre le conteneur local.
- [ ] La connexion Redis fonctionne **via l'env** contre le conteneur local.
- [ ] Aucune bascule d'hôte hardcodée dans le code (dev vs prod = env uniquement).
- [ ] Un healthcheck simple est disponible.
- [ ] Les bibliothèques `src/libs/*` n'écoutent aucun port, utilisent l'injection, ont un README, et sont extractibles.
- [ ] Seul le process API écoute un port HTTP.
- [ ] Aucun secret réel n'est présent dans le code.
- [ ] Les commandes de développement et d'infra sont documentées.

---

## Tests à effectuer

- `docker compose up -d` puis vérifier que PG et Redis sont healthy,
- démarrer le backend avec un `.env` local,
- vérifier la connexion PostgreSQL,
- vérifier la connexion Redis,
- simuler un changement d'URL env (sans redéployer de code) pour valider le contrat de bascule,
- vérifier que `.env` n'est pas commité,
- vérifier que `.env.example` est complet et sans secrets réels.
