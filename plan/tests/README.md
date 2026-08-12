# Section 16 — Tests, sécurité et charge

## Objectif

Garantir la fiabilité, la sécurité et la robustesse du projet avant production.

---

## Types de tests

- tests unitaires,
- tests d’intégration,
- tests de sécurité,
- tests de charge basiques.

---

## Tests fonctionnels

- login / logout,
- MFA,
- contact,
- devis,
- upload,
- CRUD projets,
- CRUD contenus,
- gestion leads.

---

## Tests sécurité

- injection SQL,
- accès non autorisé,
- IDOR,
- CSRF absent,
- rate limit dépassé,
- upload malveillant,
- session expirée,
- headers manquants.

---

## Tests de charge

- /login
- /contact
- /devis
- liste projets publique
- upload

---

## Règles

- les tests doivent être reproductibles,
- les tests critiques doivent être automatisés,
- les rapports doivent être exploitables,
- aucun test ne doit dépendre de secrets réels.

---

## Critères d’acceptation

- [ ] Les tests unitaires passent.
- [ ] Les tests d’intégration passent.
- [ ] Les tests sécurité sont présents.
- [ ] Les tests de charge basiques sont présents.
- [ ] Les endpoints critiques sont couverts.
- [ ] Les cas d’abus sont testés.
- [ ] Un rapport de tests est disponible.

---

## Tests à effectuer

- suite complète locale,
- tests sécurité ciblés,
- test de charge minimal,
- vérification des logs pendant tests.
