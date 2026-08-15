# Comparaison des helpers JSON: Notre implémentation vs Hono/Express

## Notre API actuelle (@libs/http)

```ts
// Succès
jsonOk({ user: { id: 1 } })
→ { "success": true, "data": { "user": { "id": 1 } }, "requestId": "xxx" }

jsonOk({ user: { id: 1 } }, { status: 201, meta: { ... } })
→ { "success": true, "data": { "user": { "id": 1 } }, "requestId": "xxx", "meta": { ... } }

// Erreur
jsonErrorResponse({ code: "INVALID_BODY", message: "Bad request" }, 400)
→ { "success": false, "error": { "code": "INVALID_BODY", "message": "Bad request" } }
```

## Hono (c.json)

```ts
c.json({ user: { id: 1 } })
→ { "user": { "id": 1 } }  // raw, no envelope

c.json({ user: { id: 1 } }, 201)
→ { "user": { "id": 1 } } avec status 201

c.json({ error: "msg" }, 400)
→ { "error": "msg" } avec status 400
```

## Express (res.json)

```ts
res.json({ user: { id: 1 } })
→ { "user": { "id": 1 } }  // status auto 200

res.status(400).json({ error: "msg" })
→ { "error": "msg" } avec status 400

res.json({ success: true, data: { user: 1 } })
→ même format que nous, mais pas automatique
```

## Différences clés

| Feature | Nous | Hono | Express |
|---------|------|------|---------|
| Format de réponse | `{ success, data }` envelope | Raw data | Raw data |
| Status auto | Must specify | Auto 200 | Auto 200 |
| requestId auto | ✅ | ❌ | ❌ |
| Pagination native | ✅ `jsonPaginated` | ❌ | ❌ |
| Error code standardisé | ✅ `code` field | ❌ | ❌ |
| Content-Type auto | ✅ | ✅ | ✅ |
| Chaining | ❌ | ❌ | ✅ `res.status(400).json()` |
| Serialize Date | ❌ (native JSON.stringify) | ❌ | ❌ |
| Serialize BigInt | ❌ | ❌ | ❌ |
| Compression | ❌ | via middleware | via middleware |
