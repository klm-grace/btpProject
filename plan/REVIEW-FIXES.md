# Corrections différées issues des audits sécurité/perf

> Ce fichier est le **mémo de suivi** des corrections décidées mais NON implémentées
> immédiatement (réserve pour les prochaines sections). À LIRE au début de chaque
> nouvelle section pour appliquer les corrections qui deviennent pertinentes.

---

## Audit round 2 (2026-08-13) — après section 4

### ✅ Corrections APPLIQUÉES (commit à venir)

| # | Correction | Statut |
|---|---|---|
| 1 | `bun test` vert sans infra : skip gracieux `security.test.ts` + 2 tests `migrations.test.ts` + script `test:integration` | ✅ Fait |
| 2 | `Vary: Origin` dans `http-security/cors.ts` + plus de `ACAO: null` sur refus | ✅ Fait |
| 3 | `corsHeaders()` supprimé de `src/libs/http` (plus importable) | ✅ Fait |
| 4 | `redact()` sérialise les objets `Error` (`name`, `message`, `stack`) | ✅ Fait |
| 5 | `timingSafeEqual` (node:crypto) pour le monitoring token — helper réutilisable en section 5 | ✅ Fait |
| 6 | IPv4 bornée 0-255 + rejet des zéros de tête dans `proxy.ts` | ✅ Fait |

### ⏳ Points DIFFÉRÉS — à appliquer dans les sections indiquées

#### IPv6 : validation RFC complète — **AVANT la section 13**
- **Problème** : `isValidIp()` dans `src/libs/http-security/proxy.ts` valide IPv6 de
  façon basique (`^[0-9a-fA-F:]+$` + au moins 3 segments). Les colonnes
  `audit_logs.ip_address` et `security_events.ip_address` sont typées `INET` en base.
- **Décision** : implémenter une vraie validation IPv6 (RFC 4291 / IPaddr.js en interne
  ou regex complète) quand la section 13 (rate limiting / événements de sécurité)
  écrira dans ces tables. Utiliser aussi ce moment pour valider que les IP écrites
  passent bien par `isValidIp()`.

#### Logger : nouveaux champs sensibles auth — **AU DÉBUT de la section 5**
- Vérifier que `session_id`, `csrf_token`, `mfa_secret`, `otp`, `recovery_code`,
  `refresh_token_hash`… sont dans `SENSITIVE_KEYS` de `src/libs/logger/logger.ts`.
- **Règle** : toute nouvelle donnée d'auth loggée doit être soit redactée, soit
  hashée (jamais le token brut).

#### `timingSafeEqual` : généraliser aux futurs tokens — **EN section 5+**
- Le helper `timingSafeEqual` de `src/libs/http-security/timing-safe.ts` est le
  **modèle obligatoire** pour toute comparaison de token (API keys, webhooks,
  sessions, MFA). Ne jamais utiliser `!==` sur un secret.
- **Important** : le helper compare les longueurs en OCTETS UTF-8 encodés, pas en
  caractères (sinon RangeError sur unicode). Ne pas « simplifier ».

---

## Section 4 — Sécurité HTTP, CORS, proxy

### ✅ FAIT (commits sections 4 + fixes audit round 2)
- CORS liste blanche stricte via `createCors(config)` (bibliothèque
  `src/libs/http-security/cors.ts`) — préflight OPTIONS, `credentials` sécurisé,
  `Vary: Origin`, pas de `ACAO: null` sur refus.
- `/api/health` public minimal `{ ready: true }` ; `/api/health/detail` protégé par
  `x-monitoring-token` (comparaison `timingSafeEqual`, fail-closed si vide).
- `/api/ready` public minimal (ready + status, sans dependencies).
- `corsHeaders()` avec défaut `"*"` **supprimée** de `src/libs/http`.
- Security headers sur toutes les réponses (HSTS, CSP `default-src 'none'`,
  X-Frame-Options, X-Content-Type-Options, Referrer-Policy).
- `createTrustedProxy(config)` : dernier élément X-Forwarded-For (jamais le premier),
  IPv4 strict (0-255), IPv6 basique.

---

## Section 5+ — Auth / Sessions / Logs (À FAIRE AU DÉBUT DE LA SECTION 5)

### Logger : redaction automatique
- **État** : ✅ DÉJÀ FAIT (`src/libs/logger/logger.ts`), incluant la sérialisation
  des objets `Error` (name/message/stack).
- **Vérifier** en section 5 que les nouveaux champs sensibles de l'auth
  (`session_id`, `csrf_token`, `mfa_secret`, `otp`…) sont bien dans `SENSITIVE_KEYS`.

### `x-request-id` : validation de format
- **État** : ✅ DÉJÀ FAIT (`apps/api/index.ts`).
  Regex `^[a-zA-Z0-9_-]{1,64}$`, sinon UUID généré. Ne pas toucher.

---

## Perf — optimisations non urgentes (à faire quand pertinent)

### Pré-trier les routes une seule fois
- **Problème** : `src/libs/router/router.ts` trie les routes à chaque `handle()`.
- **Décision** : PAS urgent (peu de routes, O(n log n) sur n≈30).
  À faire si on dépasse ~50 routes, en pré-trisant à l'enregistrement.

### Cache TTL sur `/api/health` et `/api/ready`
- **Problème** : double ping DB+Redis à chaque appel.
- **Décision** : ajouter un cache TTL court (ex. 5 s) quand le rate limiting
  (section 13) sera en place, ou si ces endpoints sont appelés en boucle.

### Reconnexion Redis en troupeau (thundering herd)
- **Problème** : si Redis tombe, chaque requête concurrente tente sa propre
  reconnexion.
- **Décision** : mutualiser la reconnexion (un seul timer partagé) quand Redis aura
  des dépendances critiques (sessions en section 5+). Garder la résilience actuelle.
