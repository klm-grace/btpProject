# Section 13 — Rate limiting avancé et événements de sécurité

## Objectif

Renforcer la protection anti-abus et journaliser les événements de sécurité.

---

## Périmètre

Cette section couvre :

- rate limiting par IP,
- rate limiting par utilisateur,
- rate limiting par endpoint,
- réponse 429,
- header Retry-After,
- événements de sécurité,
- comportement en cas d’indisponibilité Redis.

---

## Endpoints sensibles

- /login
- /logout
- /contact
- /devis
- /upload
- mutations admin sensibles

---

## Règles

- limites explicites par endpoint,
- limites progressives si pertinent,
- jamais d’ouverture silencieuse si Redis est indisponible,
- prévoir une dégradation contrôlée.

---

## Sécurité

- journalisation des dépassements,
- détection des abus,
- possibilité de bannissement temporaire,
- événements stockés dans `security_events`.

---

## Critères d’acceptation

- [ ] Rate limiting par IP fonctionnel.
- [ ] Rate limiting par endpoint fonctionnel.
- [ ] Rate limiting par utilisateur fonctionnel si applicable.
- [ ] Réponse 429 propre.
- [ ] Header Retry-After présent.
- [ ] Dépassements journalisés.
- [ ] Événements de sécurité enregistrés.
- [ ] Comportement défini si Redis tombe.

---

## Tests à effectuer

- dépasser une limite,
- vérifier la réponse 429,
- vérifier Retry-After,
- vérifier les security events,
- tester le comportement avec Redis indisponible.
