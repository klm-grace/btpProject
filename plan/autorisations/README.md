# Section 6 — Rôles, permissions et autorisations

## Objectif

Mettre en place un contrôle d’accès réel basé sur rôles et permissions, avec vérification par ressource.

---

## Périmètre

Cette section couvre :

- rôles,
- permissions,
- association rôles / permissions,
- middleware d’authentification,
- middleware d’autorisation,
- vérification par ressource.

---

## Rôles minimum

- owner
- admin
- editor
- viewer

---

## Règles

- être connecté ne suffit pas,
- chaque action doit vérifier une permission,
- chaque accès à une ressource doit vérifier le droit sur cette ressource,
- les permissions doivent être vérifiées côté serveur.

---

## Middlewares attendus

- `requireAuth`
- `requirePermission`
- helper de vérification par ressource

---

## Sécurité

- pas de contrôle uniquement côté frontend,
- pas d’autorisation implicite,
- refus explicite si permission manquante,
- journalisation des accès refusés si pertinent.

---

## Critères d’acceptation

- [ ] Les rôles existent.
- [ ] Les permissions existent.
- [ ] Les associations rôles / permissions fonctionnent.
- [ ] `requireAuth` fonctionne.
- [ ] `requirePermission` fonctionne.
- [ ] Les accès non autorisés sont refusés.
- [ ] Les permissions sont vérifiées côté serveur.
- [ ] Les tests d’accès non autorisé passent.

---

## Tests à effectuer

- accès avec rôle autorisé,
- accès avec rôle non autorisé,
- accès sans session,
- accès à une ressource d’un autre périmètre si applicable,
- refus journalisé si prévu.
