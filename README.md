# Site vitrine Architecture & BTP

Stack : **Bun.js natif** + **PostgreSQL** + **Redis** + **Next.js**

## Démarrage local

### Prérequis

- [Bun](https://bun.sh) ≥ 1.1
- [Docker](https://docs.docker.com/get-docker/) + Docker Compose

### 1. Installer les dépendances

```bash
bun install
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
# Éditer .env si besoin (valeurs de dev par défaut déjà prêtes)
```

### 3. Démarrer l'infrastructure (PostgreSQL + Redis)

```bash
bun run infra:up
# Attendre que les services soient healthy :
docker compose ps
```

### 4. Démarrer l'API

```bash
bun run dev
# → http://127.0.0.1:4000/health
```

### 5. Tests

```bash
bun test
```

## Scripts disponibles

| Script | Description |
|--------|-------------|
| `bun run infra:up` | Démarre PostgreSQL + Redis (Docker Compose) |
| `bun run infra:down` | Arrête l'infrastructure |
| `bun run infra:logs` | Logs Docker Compose |
| `bun run dev` | API en mode watch |
| `bun run test` | Lance tous les tests (`bun:test`) |
| `bun run typecheck` | Vérifie les types TypeScript |
| `bun run build` | Build de l'API |
| `bun run start` | Démarre le build de production |

## Structure

```
├── apps/
│   ├── api/          ← SEUL process qui écoute un port HTTP
│   └── web/          ← Frontend Next.js (section 14)
├── src/
│   ├── libs/         ← Bibliothèques réutilisables (pas de port)
│   │   ├── config/
│   │   ├── db/
│   │   ├── redis/
│   │   ├── logger/
│   │   ├── health/
│   │   └── errors/
│   └── types/        ← Types globaux (declare global)
├── test/             ← Tests regroupés par domaine
├── plan/             ← Plans de section (source de vérité)
├── docker-compose.yml
└── .env.example
```

## Contrat des bibliothèques

Les bibliothèques sous `src/libs/*` sont du **code importable** :

- Aucune n'écoute de port
- Aucune ne lit `process.env` (l'app injecte la config)
- Chacune a son `README.md` local
- Extractibles en package sans réécriture

Seul `apps/api` (via `Bun.serve`) ouvre un port HTTP.

## Bascule dev → production

**Aucun code conditionnel.** Changer d'environnement = changer les **valeurs** du `.env` :

| Variable | Dev (local) | Prod |
|----------|-------------|------|
| `DATABASE_URL` | `postgres://...@127.0.0.1:5432/...` | URL du PG de production |
| `REDIS_URL` | `redis://127.0.0.1:6379` | URL du Redis de production |
| `PORT` | `4000` | port de prod |
