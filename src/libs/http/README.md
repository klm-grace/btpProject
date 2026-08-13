# Http

Helpers de réponse HTTP JSON standardisée pour backend **Bun.js**.

## Rôle

- `jsonOk(data, options?)` : réponse `{ success: true, data, requestId?, meta? }`
- `jsonErrorResponse(details, status)` : réponse `{ success: false, error: { code, message, requestId?, details? } }`
- `jsonPaginated(data, page, pageSize, total)` : réponse paginée avec métadonnées
- **Injection** : aucune dépendance d'environnement, aucun port.

## API publique

`src/libs/http/index.ts` :

- `jsonOk<T>(data, options?)` → `Response`
- `jsonErrorResponse(details, status)` → `Response`
- `jsonPaginated<T>(data, page, pageSize, total, options?)` → `Response`
- `corsHeaders(origin?, methods?)` → `Record<string, string>`

## Exemple

```ts
import { jsonOk, jsonErrorResponse } from "@libs/http";

// Succès
return jsonOk({ users: [...] }, { requestId: ctx.requestId });

// Erreur
return jsonErrorResponse({ code: "not_found", message: "User not found" }, 404);
```
