# Rate Limit Library

Rate limiter à fenêtre glissante (sliding window log) pour Redis.

## Usage

```typescript
import { createRateLimiter, createRateLimitMiddleware } from "@libs/rate-limit";

// Création du limiter
const rateLimiter = createRateLimiter(
  { redis },  // Dépendances injectées
  { maxRequests: 100, windowSeconds: 60, keyPrefix: "rl:api:" }
);

// Vérification manuelle
const result = await rateLimiter.check("user:123");
if (!result.allowed) {
  throw new Error("Rate limit exceeded");
}

// Middleware pour routeur
const rateLimitMiddleware = createRateLimitMiddleware(rateLimiter, {
  keyGenerator: (req) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    return `${ip}:${new URL(req.url).pathname}`;
  },
  message: "Trop de requêtes",
  errorCode: "RATE_LIMIT_EXCEEDED",
});

router.post("/api/endpoint", rateLimitMiddleware, handler);
```

## Caractéristiques

- **Algorithme** : Sliding window log (précis, pas de burst au bord de fenêtre)
- **Stockage** : Redis avec TTL automatique (fenêtre + 60s marge)
- **Headers standards** : `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
- **Clé configurable** : IP, userId, IP+endpoint, etc.
- **Aucune dépendance externe** : Redis natif via injection
- **Extractible** : Copiable dans un autre projet sans modification

## Configuration

| Paramètre | Défaut | Description |
|-----------|--------|-------------|
| `maxRequests` | requis | Requêtes max dans la fenêtre |
| `windowSeconds` | requis | Fenêtre en secondes |
| `keyPrefix` | `"rl:"` | Préfixe clés Redis |

## Sécurité

- Protection DoS / brute-force / abus API
- TTL borné sur toutes les clés Redis
- Pas de données sensibles loggées
- Comparaison timing-safe non nécessaire (compteurs)