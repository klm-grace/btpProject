# Corrections différées issues de l'audit sécurité/perf

> Ce fichier est le **mémo de suivi** des corrections décidées mais NON implémentées
> immédiatement (réserve pour les prochaines sections). À LIRE au début de chaque
> nouvelle section pour appliquer les corrections qui deviennent pertinentes.

## Section 4 — Sécurité HTTP, CORS, proxy (À FAIRE DANS CETTE SECTION)

### CORS : politique stricte, pas de défaut `"*"`
- **Problème** : `src/libs/http/http.ts` → `corsHeaders(origin = "*", ...)` a une
  origine par défaut `"*"`. Combiné à `credentials: include` (sessions, section 5),
  c'est une faille classique (CORS `*` + credentials est interdit par les navigateurs
  mais révèle une mauvaise config).
- **Décision** : ne PAS laisser de valeur par défaut permissive. Créer une config
  CORS injectée (liste blanche d'origines, `methods`, `allowedHeaders`, `credentials`)
  et passer par `createCors(config)` (bibliothèque `src/libs/cors` ou extension de
  `src/libs/http`). Le composant `apps/api` lit `CORS_ORIGINS` (séparé par virgules)
  et l'injecte.
- **À ne pas oublier** : gérer le preflight `OPTIONS` dans le middleware HTTP, et
  ne renvoyer `Access-Control-Allow-Credentials: true` que si l'origine est dans la
  liste blanche.

### `/api/health` : restreindre le détail interne
- **Problème** : `apps/api/index.ts` expose latence/état PG+Redis publiquement.
- **Décision** : exposer publiquement un `/api/ready` minimal (`{ ready: true|false }`
  sans détail) ; garder le détail interne de `/api/health` pour un accès interne ou
  un token de monitoring (header secret, ou restriction réseau au reverse proxy).
- **Note** : les deux endpoints doivent rester sans auth (liveness standard), mais
  le **détail** ne doit pas être public.

### Triple vérification : prévoir un middleware body limit réutilisable
- **Décision** : quand les routes qui lisent le body arrivent (sections 8-9),
  extraire la vérification `isBodyTooLarge` de `apps/api/index.ts` dans une
  bibliothèque réutilisable (`src/libs/http` ou `src/libs/body-limit`), testée
  unitairement, avec `maxRequestBodySize` Bun toujours en garde-fou runtime.

---

## Section 5+ — Auth / Sessions / Logs (À FAIRE AVANT/AU DÉBUT DE LA SECTION 5)

### Logger : redaction automatique
- **État** : ✅ DÉJÀ FAIT dans le fix du 2026-08-13 (`src/libs/logger/logger.ts`).
- **Vérifier** en section 5 que les nouveaux champs sensibles de l'auth
  (`session_id`, `csrf_token`, `mfa_secret`, `otp`…) sont bien dans `SENSITIVE_KEYS`.

### `x-request-id` : validation de format
- **État** : ✅ DÉJÀ FAIT dans le fix du 2026-08-13 (`apps/api/index.ts`).
  Regex `^[a-zA-Z0-9_-]{1,64}$`, sinon UUID généré. Ne pas toucher.

---

## Perf — optimisations non urgentes (à faire quand pertinent)

### Pré-trier les routes une seule fois
- **Problème** : `src/libs/router/router.ts` trie les routes à chaque `handle()`.
- **Décision** : ce n'est PAS urgent (peu de routes, O(n log n) sur n≈30).
  À faire si on dépasse ~50 routes, en pré-trisant à l'enregistrement et en
  mémorisant l'ordre dans le routeur.

### Cache TTL sur `/api/health` et `/api/ready`
- **Problème** : double ping DB+Redis à chaque appel.
- **Décision** : ajouter un cache TTL court (ex. 5 s) quand le rate limiting
  (section 13) sera en place, ou si ces endpoints sont appelés en boucle.

### Reconnexion Redis en troupeau (thundering herd)
- **Problème** : si Redis tombe, chaque requête concurrente tente sa propre
  reconnexion (`src/libs/redis/redis.ts`, `autoReconnect + if (!connected) connect`).
- **Décision** : à revoir en section 13 (rate limiting) avec un mécanisme de
  reconnexion unique / circuit breaker. Pour l'instant pas d'impact (Redis n'est
  utilisé que pour le ping santé).

### Dégradation gracieuse Redis
- **Problème** : `get`/`set`/`del` ne sont pas en try/catch ; une panne Redis
  remonte en 500.
- **Décision** : à traiter en section 13. Si Redis n'est utilisé qu'en cache
  (pas pour les sessions), une panne Redis ne doit pas faire tomber l'API.
  Si utilisé pour les sessions (section 5), un 500 est acceptable MAIS doit être
  loggé proprement avec un message dédié « Redis indisponible ».

---

## Contrat bibliothèques — rappel
- Aucune bibliothèque ne lit `process.env` (l'app lit et injecte).
- Aucune bibliothèque n'ouvre de port.
- Toujours paramétrer les requêtes SQL (même dans les scripts).
- Ne jamais logguer de donnée sensible (redaction automatique en défense profonde).
