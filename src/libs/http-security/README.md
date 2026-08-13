# http-security

Bibliothèque de sécurité HTTP réutilisable pour backend Bun.js.

## Rôle

- **Security Headers** : HSTS, CSP (stricte `default-src 'none'` par défaut pour API JSON), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- **CORS** : liste blanche stricte d'origines, gère le preflight `OPTIONS`, `credentials` sécurisé (jamais `*` avec cookies).
- **Trusted Proxy** : extraction sécurisée de l'IP client (`X-Forwarded-For` dernier élément / `X-Real-IP`), uniquement si `trustProxy: true`.

**Aucun port, aucune lecture `process.env`, extraction possible.**

## API publique

`src/libs/http-security/index.ts` :

```ts
import { createSecurityHeaders, createCors, createTrustedProxy } from "./src/libs/http-security/index.ts";
```

### createSecurityHeaders(config?)

- `config.csp` — Content-Security-Policy (défaut : `default-src 'none'`)
- `config.hstsMaxAge` — HSTS max-age en secondes (défaut : 31536000 = 1 an)
- `config.frameOptions` — X-Frame-Options (défaut : DENY)
- `config.referrerPolicy`, `config.permissionsPolicy`, `config.contentTypeOptions`
- Retourne `{ buildHeaders(), applyHeaders(res) }`

### createCors(config)

- `config.origins` — **liste obligatoire** des origines autorisées (jamais `["*"]` en prod)
- `config.credentials` — active `Access-Control-Allow-Credentials: true` (défaut : false)
- `config.methods`, `config.allowedHeaders`, `config.exposedHeaders`, `config.maxAge`
- Retourne `{ resolve(req) → CorsResult, handlePreflight(req) → Response|null }`

### createTrustedProxy(config)

- `config.trustProxy` — `true` si derrière un reverse proxy, `false` sinon
- Retourne `{ getClientIp(req) → string|null }`
- **Règle** : ne jamais faire confiance aveuglément à X-Forwarded-For

## Exemple d'import dans un autre projet

```ts
import { createSecurityHeaders, createCors, createTrustedProxy } from "./src/libs/http-security/index.ts";

const sec = createSecurityHeaders({ csp: "default-src 'none'" });
const cors = createCors({ origins: ["https://example.com"], credentials: true });
const proxy = createTrustedProxy({ trustProxy: true });

// Dans le fetch handler :
const preflight = cors.handlePreflight(req);
if (preflight) return preflight;

const { headers } = cors.resolve(req);
const clientIp = proxy.getClientIp(req);

const res = await router.handle(req);
return sec.applyHeaders(res);
```

## Notes

- **Pas** de `process.env` ; **aucun** port ; pas d'effet de bord à l'import.
- CSP par défaut `default-src 'none'` : le plus sûr pour une API qui ne sert que du JSON.
- CORS : `Access-Control-Allow-Credentials` n'est jamais envoyé si l'origine n'est pas dans la liste blanche.
- Trusted proxy : prend le dernier élément de X-Forwarded-For (IP la plus distante = client réel), pas le premier.
- Extractible en package sans réécriture.
