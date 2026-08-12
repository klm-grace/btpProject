# Section 10 — Admin portfolio : réalisations et catégories

## Objectif

Permettre la gestion complète du portfolio depuis l’espace admin.

---

## Périmètre

Cette section couvre :

- CRUD catégories,
- CRUD réalisations,
- association projet / catégories,
- gestion images,
- statut de publication,
- slug unique,
- couverture de projet,
- positionnement des images,
- publication / dépublication,
- soft delete.

---

## Règles fonctionnelles

- un projet peut être brouillon, publié ou archivé,
- un projet peut avoir plusieurs catégories,
- un projet peut avoir plusieurs images,
- une image peut être réordonnée,
- une suppression doit être douce ou contrôlée.

---

## Règles techniques

- transactions pour écritures multiples,
- validation Zod,
- vérification des permissions,
- CSRF sur mutations,
- audit logs.

---

## Sécurité

- accès réservé aux utilisateurs autorisés,
- contrôle des ressources,
- pas de suppression définitive non contrôlée,
- slug protégé contre doublons.

---

## Critères d’acceptation

- [ ] Création de catégorie fonctionnelle.
- [ ] Édition de catégorie fonctionnelle.
- [ ] Création de réalisation fonctionnelle.
- [ ] Édition de réalisation fonctionnelle.
- [ ] Association catégories fonctionnelle.
- [ ] Images associées correctement.
- [ ] Slug unique respecté.
- [ ] Publication / dépublication fonctionnelle.
- [ ] Soft delete fonctionnel.
- [ ] Transactions utilisées.
- [ ] Audit logs présents.

---

## Tests à effectuer

- créer un projet,
- éditer un projet,
- ajouter des images,
- changer l’ordre des images,
- publier / dépublier,
- supprimer doucement,
- accéder sans permission.
