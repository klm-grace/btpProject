# Errors

Bibliothèque de gestion d'erreurs applicatives pour un backend **Bun.js**.

## Rôle

- Hiérarchie d'erreurs typées (`AppError`, `HttpError`, `ValidationError`, `NotFoundError`, `ConflictError`, `InternalError`).
- Traduction erreur → réponse HTTP : statut, code machine stable, `requestId`.
- Formateur de réponse JSON **sûr** : n'expose **jamais** le stack ni la cause technique brute (erreurs SQL, réseau).

## API publique

Créée via `src/libs/errors/index.ts` :

- `AppError` / `HttpError` / `ValidationError` / `NotFoundError` / `ConflictError` / `InternalError`
- `errorToHttpStatus(err)` → `number`
- `isHttpError(err)` → type guard
- `formatError(err, requestId?)` → `{ status, error: { code, message, requestId?, details? } }`

## Prérequis

- Bun.js (aucune dépendance externe).

## Exemple d'import dans un autre projet

```ts
import { ValidationError, formatError } from "./src/libs/errors/index.ts";

throw new ValidationError("Email invalide", {
  context: { field: "email" },
  requestId: "req-123",
});

// Dans le handler HTTP :
const body = formatError(err, reqId); // JSON sûr, jamais de stack / SQL brut
```

## Exemple de réponse JSON produite

```json
{
  "status": 400,
  "error": { "code": "validation_error", "message": "Email invalide", "requestId": "req-123", "details": { "field": "email" } }
}
```

## Notes

- **Pas** de `process.env` lu dans la bibliothèque.
- **Aucun** port ouvert, aucun effet de bord à l'import.
- Extractible en package sans réécriture.