# Section 12 — Admin gestion des leads

## Objectif

Permettre au client de suivre et gérer les demandes entrantes.

---

## Périmètre

Cette section couvre :

- liste des demandes de contact,
- liste des demandes de devis,
- détail d’une demande,
- changement de statut,
- notes internes,
- assignation éventuelle,
- filtrage,
- pagination.

---

## Règles fonctionnelles

- les demandes doivent être consultables,
- les statuts doivent être modifiables,
- les notes internes ne doivent pas être publiques,
- la suppression définitive doit être évitée.

---

## Règles techniques

- permissions,
- CSRF,
- validation,
- pagination,
- audit logs.

---

## Sécurité

- accès réservé,
- pas d’exposition publique des leads,
- pas de suppression incontrôlée,
- journalisation des changements de statut.

---

## Critères d’acceptation

- [ ] La liste des contacts fonctionne.
- [ ] La liste des devis fonctionne.
- [ ] Le détail d’une demande fonctionne.
- [ ] Le changement de statut fonctionne.
- [ ] Les notes internes fonctionnent.
- [ ] La pagination fonctionne.
- [ ] Les filtres fonctionnent.
- [ ] Les accès non autorisés sont bloqués.
- [ ] Les actions sont journalisées.

---

## Tests à effectuer

- consulter les demandes,
- filtrer par statut,
- changer un statut,
- ajouter une note,
- accéder sans permission.
