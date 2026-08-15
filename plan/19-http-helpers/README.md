# Proposal: Amélioration de @libs/http — Helpers JSON style Hono/Express

## Problématique actuelle

Notre API actuelle est verbeuse et différente des standards du marché :

```ts
// Nous (verbeux)
jsonOk({ token: "abc" }, { status: 200 })
jsonErrorResponse({ code: "AUTH_FAILED", message: "..." }, 401)

// Hono (concis)
c.json({ token: "abc" }, 200)
c.json({ error: "..." }, 401)

// Express (chainable)
res.status(401).json({ error: "..." })
```

Notre format avec `success/data` et `error/code` est **supérieur** pour une API BTP (standardisation, typing, debugging), mais l'API d'appel est trop lourde.

---

## Proposition: 3 niveaux d'abstraction

### Niveau 1: `json()` — Shortcut style Hono (le plus utilisé)

```ts
// Succès simple (status 200 auto)
json({ token: "abc" })
// → { "success": true, "data": { "token": "abc" }, "requestId": "req-123" }

// Succès avec status custom
json({ user: { id: 1 } }, 201)
// → status 201, même envelope

// Erreur simple
json({ error: "Invalid credentials" }, 401)
// → { "success": false, "error": { "code": "invalid_credentials", "message": "Invalid credentials" } }

// Erreur avec code explicite
json({ error: "Session expired" }, 401, { code: "SESSION_EXPIRED" })
```

**Principe** : Si le premier argument a `{ error: ... }`, c'est une erreur. Sinon, c'est un succès.

### Niveau 2: `jsonOk()` / `jsonError()` — API explicite (backwards compatible)

```ts
// Success explicite
jsonOk({ token: "abc" })          // → status 200
jsonOk({ token: "abc" }, 201)     // → status 201
jsonOk({ token: "abc" }, { status: 201, meta: { ... } })

// Error explicite
jsonError({ code: "AUTH_FAILED", message: "..." }, 401)
jsonError({ code: "AUTH_FAILED", message: "..." }, 401, { requestId: "xxx" })
```

### Niveau 3: `jsonPaginated()` / `jsonStream()` — Spécialisés

```ts
// Pagination
jsonPaginated(items, 1, 20, 150)

// Stream binaire (images, PDFs)
json(new Blob([buffer]), { status: 200, headers: { "Content-Type": "image/png" } })
```

---

## Nouvelles fonctionnalités

### 1. Serialization avancée

```ts
// Date → ISO string automatiquement
json({ created: new Date() })
// → { "success": true, "data": { "created": "2024-01-01T00:00:00.000Z" } }

// BigInt → string (évite JSON.stringify crash)
json({ count: BigInt(9007199254740991) })
// → { "success": true, "data": { "count": "9007199254740991" } }

// undefined → supprimé
json({ name: "Jean", secret: undefined })
// → { "success": true, "data": { "name": "Jean" } }
```

### 2. Content-Type auto

```ts
// Tous les helpers settent automatiquement Content-Type: application/json
// Pas besoin de spécifier
```

### 3. RequestId auto (si dans le contexte)

```ts
// Dans un handler:
json({ user })  // requestId auto injecté depuis ctx.requestId
// vs
json({ user }, { requestId: ctx.requestId })  // explicite
```

---

## Migration: 0 breaking change

Toutes les fonctions existantes restent identiques :
- `jsonOk()` → inchangé
- `jsonErrorResponse()` → inchangé  
- `jsonPaginated()` → inchangé

Nouveau ajout :
- `json()` → nouveau helper principal

---

## Usage dans les handlers (exemple auth.ts)

```ts
// AVANT (18 appels jsonErrorResponse + 7 jsonOk = 25 lignes)
return jsonErrorResponse({ message: "Invalid request body", code: "INVALID_BODY" }, 400);
return jsonOk({ token: result.token, user: result.user });

// APRÈS (même logique, mais plus concis)
return json({ error: "Invalid request body" }, 400, { code: "INVALID_BODY" });
return json({ token: result.token, user: result.user });
```

---

## Interface publique proposée

```ts
// ============================================================================
// json() — Helper principal (style Hono)
// ============================================================================
export function json<T>(
  body: T,
  statusOrOptions?: number | JsonOptions,
  errorOptions?: { code?: string; requestId?: string },
): Response;

// ============================================================================
// jsonOk() — Success explicite (backward compatible)
// ============================================================================
export function jsonOk<T>(
  data: T,
  options?: JsonOkOptions,
): Response;

// ============================================================================
// jsonError() — Error explicite (simplifié vs jsonErrorResponse)
// ============================================================================
export function jsonError(
  details: JsonErrorDetails,
  status?: number,
): Response;

// ============================================================================
// jsonPaginated() — Pagination (inchangé)
// ============================================================================
export function jsonPaginated<T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number,
  options?: JsonOkOptions,
): Response;
```

---

## Checklist de sécurité

| Point | Implémentation |
|-------|---------------|
| Date serialization | Custom replacer → ISO string |
| BigInt serialization | Custom replacer → string |
| undefined suppression | Custom replacer → skip |
| Prototype pollution protection | Garde le format envelope `{ success, data }` |
| Fuites stack trace | `jsonError` n'inclut jamais le message de l'erreur interne |
| Content-Type auto | `application/json;charset=utf-8` |
| requestId auto | Injecté depuis `ctx.requestId` si disponible |

---

## Questions pour validation

1. **Garder le format envelope** `{ success, data }` / `{ success, false, error }` ? (recommandé: OUI)
2. **Nouveau helper `json()`** comme primary API ? (recommandé: OUI)
3. **Serialization Date/BigInt** dans `json()` ? (recommandé: OUI)
4. **RequestId auto** via closure sur `ctx.requestId` ? (recommandé: OUI)
5. **Breaking change** sur `jsonOk`/`jsonError` ? (recommandé: NON, backward compatible)
