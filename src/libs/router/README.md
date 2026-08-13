# Router

Routeur HTTP maison strict pour backend **Bun.js**.

## Rôle

- Dispatch HTTP strict par méthode + chemin segmenté.
- Matcher paramètres de chemin (`:id`, `:slug`) avec priorité aux routes statiques.
- 404 propre (route inexistante), 405 avec header `Allow` (méthode non supportée).
- Rejet automatique des paths malformés : double slash, `..`, `./`, encodage non valide.
- Limitation de longueur de path.
- **Injection** : aucune dépendance externe, aucun `process.env`, aucun port.

## API publique

`src/libs/router/index.ts` :

- `createRouter(options?)` → `Router`
  - `get(path, handler)` / `post(path, handler)` / `put(...)` / `patch(...)` / `delete(...)` → chaînable
  - `handle(req)` → `Promise<Response>`
  - `size()` → `number`
- Types : `RouteHandler`, `RouteContext`, `HttpMethod`, `Router`, `RouterOptions`

## Sécurité intégrée

| Protection | Comportement |
|---|---|
| Path traversal (`../`) | 400 bad_request |
| Double slash (`//`) | 400 bad_request |
| Segments `.` / `..` | 400 bad_request |
| Encodage malformé (`%ZZ`) | 400 bad_request |
| Path trop long | 414 uri_too_long |
| Méthode non supportée | 405 + Allow |
| Route inconnue | 404 |
| Route dupliquée (registre) | Erreur au démarrage |

## Exemple

```ts
import { createRouter } from "@libs/router";
import { jsonOk } from "@libs/http";

const router = createRouter();
router.get("/api/health", (_req, ctx) => jsonOk({ ok: true }));
router.get("/api/items/:id", (_req, ctx) => jsonOk({ id: ctx.params.id }));

const response = await router.handle(req);
```
