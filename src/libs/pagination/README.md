# `@libs/pagination` — Keyset Pagination avec Token Signé

## Rôle

Fournit un système de pagination par curseur signé (keyset pagination)
évitant les problèmes de performance et de drift du OFFSET/LIMIT.

## API

```ts
import { createPagination } from "@libs/pagination";

const { createCursor, decodeCursor, getNextCursor, buildQuery } = createPagination({
  secret: "mon-secret-cryptographique",
  pageSize: 20,
});
```

### `createCursor(payload)`
Génère un token signé HMAC-SHA256 :
```
cursor_{16-bytes-salt}|{value}|{id}.{signature}
```

### `decodeCursor(token)`
Decode et vérifie le token. Retourne `CursorPayload | { code, message }`.

### `getNextCursor(row)`
Expose le cursor depuis une ligne : `{ value: row.created_at, id: row.id }`.

### `buildQuery(cursor, limit)`
Génère le SQL keyset :
```sql
SELECT * FROM __TABLE__
WHERE (created_at, id) < ($1, $2)
ORDER BY created_at DESC, id DESC
LIMIT $3
```

## Prérequis

- Node.js ou Bun (Web Crypto API)
- Un secret cryptographique robuste (≥32 caractères)

## Exemple d'import dans un autre projet

```ts
import { createPagination } from "@libs/pagination";

const pagination = createPagination({
  secret: process.env.PAGINATION_SECRET!,
  pageSize: 20,
});

// Dans un handler :
const decoded = await pagination.decodeCursor(req.query.cursor as string);
if ("code" in decoded) return errorResponse(decoded.code, 400);

const { sql, params } = pagination.buildQuery(decoded, 20);
const rows = await db.sql.unsafe(sql, params);
const hasMore = rows.length > 20;
const nextCursor = hasMore ? pagination.getNextCursor(rows[20]) : null;
```
