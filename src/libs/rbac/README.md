# rbac — Bibliothèque de contrôle d'accès par rôles et permissions

## Rôle

Fournir des middlewares `requireAuth` et `requirePermission` réutilisables, avec cache des permissions par utilisateur. Le routeur (section 6) supporte les middlewares globaux (`router.use()`) et par-route.

## API publique

```ts
import { createRbac } from "@libs/rbac";

const rbac = createRbac(deps, { cacheTtlMs: 300_000 });

// Middleware global (toutes les routes)
router.use(rbac.requireAuth);

// Middlewares par-route
router.get("/api/me", handler, [rbac.requireAuth]);
router.put("/api/content/:id", handler, [rbac.requireAuth, rbac.requirePermission("content.write")]);

// Vérification sans middleware
const check = await rbac.checkPermission(user, "content.write");
if (!check.allowed) { /* 403 */ }

// Cache
rbac.invalidate(userId);  // force le rechargement
```

## Middlewares

| Middleware | Rôle |
|---|---|
| `requireAuth` | Lit cookie sid → charge session → remplit `ctx.state.user` → 401 si invalide |
| `requirePermission(perm)` | Vérifie que `ctx.state.user` a la permission → 403 si refusé |
| `requireResourcePermission(perm, check?)` | Permission + vérification par ressource (ex. propriété) |

## Dépendances injectées

```ts
interface RbacDeps {
  sessionReader: SessionReader;  // (req) => Promise<RbacUser | null>
  db: { sql: { unsafe } };       // charge les permissions
}

interface RbacConfig {
  cacheTtlMs: number;    // TTL du cache permissions (défaut: 5 min)
  cookieName?: string;   // nom du cookie session (défaut: "sid")
}
```

## Cache permissions

- Chargement depuis la DB au premier appel
- Stocké en mémoire (Map) avec TTL configurable
- `invalidate(userId)` force le rechargement
- Cache par défaut : 5 min (configurable via `RBAC_CACHE_TTL_MINUTES`)

## Rôles du seed

| Rôle | Permissions |
|---|---|
| owner | Toutes (non supprimable) |
| admin | Toutes |
| editor | content.read/write, media.upload |
| viewer | content.read, leads.read |

## Sécurité

- Le contrôle est **côté serveur** uniquement
- `requireAuth` est **fail-closed** : pas de cookie → 401
- `requirePermission` est **fail-closed** : permission absente → 403
- Les refus sont loggués si pertinent (via le logger de l'app)
- Le cache n'est pas un risque : en cas de doute, `invalidate()` force le rechargement

## Exemple d'import autre projet

```ts
import { createRbac } from "./src/libs/rbac";

const rbac = createRbac(
  {
    sessionReader: async (req) => {
      const sid = parseCookie(req, "sid");
      return sid ? await auth.getSession(sid) : null;
    },
    db: { sql: { unsafe: (...a) => db.sql.unsafe(...a) } },
  },
  { cacheTtlMs: 5 * 60_000 },
);

router.use(rbac.requireAuth);  // toutes les routes protégées par défaut
router.get("/public", publicHandler);  // le middleware s'applique quand même
```

## Structure

```
src/libs/rbac/
  index.ts   ← exports nommés (createRbac, types)
  types.ts   ← Rbac, RbacDeps, RbacConfig, RbacUser, SessionReader, Middleware
  rbac.ts    ← createRbac (cache permissions + middlewares)
  README.md
```
