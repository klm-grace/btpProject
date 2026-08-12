# Section 7 — CSRF et protection des mutations

## Objectif

Protéger toutes les actions sensibles contre les attaques CSRF.

---

## Périmètre

Cette section couvre :

- token CSRF,
- association token / session,
- vérification sur mutations admin,
- transmission propre côté frontend,
- rejet des requêtes non conformes.

---

## Règles

- toutes les mutations admin doivent être protégées,
- le token doit être lié à la session,
- le token doit être vérifié côté serveur,
- l'absence de token doit provoquer un rejet,
- les formulaires publics peuvent utiliser :
  - rate limiting,
  - honeypot,
  - validation,
  - captcha invisible si nécessaire.

### Bibliothèque `csrf`

- Token CSRF = code sous `src/libs/csrf/` : `createCsrf(deps, config)` (generate / verify / middleware factory).
- **Pas** de service CSRF sur un port ; l'app applique le middleware sur les mutations.
- Config et store (Redis/session) **injectés** ; pas de `process.env` dans la bibliothèque.
- Réutilisable dans un autre projet ; README de bibliothèque obligatoire.

---

## Sécurité

- CSRF token obligatoire sur actions sensibles,
- pas de confiance dans SameSite seul,
- rejet clair mais non verbeux côté client.

---

## Critères d'acceptation

- [ ] Un token CSRF peut être généré.
- [ ] Le token est lié à la session.
- [ ] Les mutations admin exigent le token.
- [ ] Une requête sans token est refusée.
- [ ] Une requête avec token invalide est refusée.
- [ ] Les tests CSRF sont présents.

---

## Tests à effectuer

- mutation admin avec token valide,
- mutation admin sans token,
- mutation admin avec token invalide,
- vérification du comportement côté frontend.
