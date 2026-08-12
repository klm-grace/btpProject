# Section 4 — Sécurité HTTP, CORS et proxy

## Objectif

Durcir la couche HTTP et préparer proprement l'API derrière un reverse proxy.

---

## Périmètre

Cette section couvre :

- headers de sécurité,
- CSP,
- HSTS,
- CORS,
- trusted proxy,
- extraction sécurisée de l'IP réelle,
- limites de requêtes.

---

## Headers obligatoires

- Strict-Transport-Security
- Content-Security-Policy
- X-Content-Type-Options
- X-Frame-Options
- Referrer-Policy
- Permissions-Policy si pertinent

---

## Règles CORS

- liste blanche stricte,
- jamais `*` avec cookies/session,
- méthodes autorisées explicites,
- origines validées.

### Bibliothèques sécurité HTTP

- Headers, CORS, trusted proxy, extraction IP : code sous `src/libs/` (ex. `http-security`, `cors`) — **bibliothèques**, pas de process sur un port.
- `createSecurityHeaders(config)`, `createCors(config)`, etc. ; config injectée (origines, proxy trust) — pas de `process.env` dans la bibliothèque.
- L'app compose ces middlewares sur `Bun.serve`. Réutilisable hors BTP ; README de bibliothèque obligatoire.

---

## Règles proxy

- l'IP réelle doit être extraite uniquement derrière proxy de confiance,
- ne jamais faire aveuglément confiance à `X-Forwarded-For`,
- configuration documentée pour dev et production.

---

## Sécurité

- headers appliqués à toutes les réponses,
- aucune permissivité inutile,
- protection contre expositions inutiles,
- base solide pour cookies sécurisés.

---

## Critères d'acceptation

- [ ] Tous les headers de sécurité sont appliqués.
- [ ] CSP est configurée.
- [ ] HSTS est présent.
- [ ] CORS est strict.
- [ ] Le trusted proxy est configuré correctement.
- [ ] L'IP réelle est extraite proprement.
- [ ] Les headers sont testés.
- [ ] Aucune configuration dangereuse n'est présente.

---

## Tests à effectuer

- vérifier les headers sur une réponse,
- tester une origine CORS autorisée,
- tester une origine CORS non autorisée,
- vérifier l'IP extraite derrière proxy,
- vérifier les réponses 404/500 avec headers.
