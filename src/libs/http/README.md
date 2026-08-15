# Http

Helpers de réponse HTTP JSON standardisée pour backend **Bun.js**.
Inspiré de Hono (`c.json`) et Express (`res.json`), avec un format de réponse structuré et sécurisé.

## Rôle

- `json(body, status?, errorOptions?)` — helper principal (style Hono)
- `jsonOk(data, options?)` — succès explicite
- `jsonError(details, status?)` — erreur explicite
- `jsonPaginated(data, page, pageSize, total, options?)` — pagination
- `jsonStream(body, options?)` — streaming binaire/SSE
- **Injection** : aucune dépendance d'environnement, aucun port.
- **Sérialisation sûre** : BigInt, cycles, undefined gérés automatiquement.

## API publique

`src/libs/http/index.ts` :

```ts
// Succès simple (status 200 auto)
json({ token: "abc" })

// Succès avec status
json({ user: { id: 1 } }, 201)

// Erreur simple
json({ error: "Invalid" }, 401)

// Erreur avec code explicite
json({ error: "Session expired" }, 401, { code: "SESSION_EXPIRED" })

// Succès explicite
jsonOk({ user: { id: 1 } })
jsonOk({ user: { id: 1 } }, 201)
jsonOk({ user: { id: 1 } }, { status: 201, requestId: "req-123", meta: { ... } })

// Erreur explicite
jsonError({ code: "AUTH_FAILED", message: "..." }, 401)
jsonError({ code: "NOT_FOUND", message: "..." })

// Pagination
jsonPaginated(users, 1, 20, 150)

// Streaming binaire
jsonStream(blob, { contentType: "image/png" })
jsonStream(readableStream, { contentType: "application/octet-stream" })
```

## Sérialisation sûre

| Type | Comportement |
|------|-------------|
| `BigInt` | → `string` (évite crash) |
| Références cycliques | → `"[Circular]"` (évite crash) |
| `undefined` | → supprimé de la réponse |
| `Date` | → ISO string (natif JS) |
| `Symbol` / `Function` | → ignorés (comportement natif) |

## Format de réponse

```json
// Succès
{ "success": true, "data": { ... }, "requestId": "..." }

// Erreur
{ "success": false, "error": { "code": "...", "message": "...", "requestId": "..." } }

// Pagination
{ "success": true, "data": [...], "meta": { "page": 1, "pageSize": 20, "total": 150, "totalPages": 8 } }
```

## Exemple

```ts
import { json, jsonOk, jsonError } from "@libs/http";

// Succès
return json({ token: result.token, user: result.user });
return json({ user: result.user }, 201);

// Erreur
return json({ error: "Invalid credentials" }, 401, { code: "AUTH_FAILED" });
return jsonError({ code: "NOT_FOUND", message: "User not found" }, 404);
```

## Sécurité

- L'enveloppe `{ success, data/error }` empêche les fuites directes de données brutes
- `jsonError` n'inclut jamais le message d'erreur interne
- Aucune stack trace n'est exposée
- Content-Type : `application/json;charset=utf-8` sur toutes les réponses
- Aucun `process.env`, aucun port, aucun effet de bord

## Tests

```bash
bun test src/libs/http/http.test.ts
```
