# csrf — Bibliothèque de protection CSRF (double-submit cookie)

## Rôle

Protéger les mutations (POST/PUT/PATCH/DELETE) contre les attaques CSRF en vérifiant qu'un token envoyé dans un header correspond au cookie CSRF (double-submit cookie). Réutilisable hors projet BTP.

## API publique

```ts
import { createCsrf } from "@libs/csrf";

const csrf = createCsrf({
  cookieName: "csrf_token",          // défaut
  headerName: "X-CSRF-Token",        // défaut
  exemptedPaths: ["/api/auth/login"], // défaut: login, logout, csrf
});

csrf.generate();            // → token hex 64 chars
csrf.verify(cookie, header); // → boolean (comparaison en temps constant)
```

## Branchement middleware

Le middleware s'applique **par-route sur les mutations**, APRÈS l'authentification (ordre : auth → CSRF) :

```ts
router.post("/api/auth/change-password", rbac.requireAuth, csrf.middleware, handler);
router.post("/api/admin/portfolio", rbac.requireAuth, csrf.middleware, handler);
```

Pourquoi pas un `router.use(csrf.middleware)` global ?
- L'ordre serait CSRF → auth : une requête sans session recevrait 403 au lieu de 401 (mauvais signal).
- Le login/logout sont exemptés de toute façon (pas encore de session / pas de vol de données).

## Config

```ts
interface CsrfConfig {
  cookieName?: string;        // défaut "csrf_token"
  headerName?: string;        // défaut "X-CSRF-Token"
  protectedMethods?: string[]; // défaut ["POST","PUT","PATCH","DELETE"]
  exemptedPaths?: string[];   // défaut ["/api/auth/login","/api/auth/logout","/api/auth/csrf"]
}
```

## Comment ça marche

1. Au login, l'app génère un token et le place dans un cookie `csrf_token` (**HttpOnly=false**, le JS doit pouvoir le lire) et le renvoie dans le header `X-CSRF-Token`.
2. Le frontend lit le cookie et envoie la valeur dans `X-CSRF-Token` à chaque mutation.
3. Le middleware vérifie (sur chaque mutation protégée) : `X-CSRF-Token` === `csrf_token` (cookie).
   - Égalité en temps constant (`timingSafeEqual`) — pas de fuite par timing.
   - Les deux doivent être présents : absence → rejet 403 `csrf_invalid`.
   - Ordre d'exécution : `requireAuth` d'abord (401), puis CSRF (403) — les requêtes non authentifiées sont rejetées avant même le CSRF.
   - GET/HEAD/OPTIONS ne sont jamais protégés (aucun effet de bord).
   - Les paths exemptés (login/logout/csrf) ne sont pas protégés.

## Pourquoi ce choix

- **Pas de confiance dans SameSite seul** : SameSite=Strict est un filet de sécurité, mais le token CSRF est la défense active.
- **Double-submit cookie** : simple, sans store côté serveur (stateless pour le token).
- **Le token est généré par le serveur** : pas de XSS-safe dû à un token devinable.

## Règles d'utilisation

- Les mutations **authentifiées** (change-password, MFA, CRUD admin) sont TOUTES protégées.
- **Ordre** : le middleware CSRF s'applique APRÈS `requireAuth` (auth → CSRF).
- Le **login** est exempté : pas encore de session → pas de cookie CSRF → un middleware bloquerait toujours.
- Le **logout** est exempté : une déconnexion forcée n'est pas un vol de données.
- `GET /api/auth/csrf` permet au frontend de récupérer un token frais (ex. après chargement de page).
- Au login, le serveur renvoie deux headers `Set-Cookie` **séparés** (`sid` + `csrf_token`) — RFC 6265, un cookie par header.

## Exemple d'import dans un autre projet

```ts
import { createCsrf } from "./src/libs/csrf";

const csrf = createCsrf({ cookieName: "my_csrf", headerName: "X-CSRF-Token" });

// Sur chaque mutation authentifiée, après l'auth :
app.post("/data", requireAuth, csrf.middleware, (req, res) => {
  // mutation protégée
});
```

## Structure

```
src/libs/csrf/
  index.ts    ← exports nommés (createCsrf, types)
  types.ts    ← Csrf, CsrfConfig
  csrf.ts     ← createCsrf (generate / verify / middleware)
  README.md
```
