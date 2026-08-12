# Section 15 — Frontend admin Next.js

## Objectif

Livrer un espace admin simple, sécurisé et utilisable depuis téléphone.

---

## Périmètre

Cette section couvre :

- login,
- MFA,
- dashboard,
- gestion réalisations,
- gestion catégories,
- gestion contenus entreprise/services/équipe,
- gestion contact/devis,
- upload photos,
- responsive mobile.

---

## Règles UX

- interface simple,
- formulaires courts,
- boutons lisibles,
- feedback clair,
- navigation mobile facile,
- upload photos depuis téléphone.

---

## Règles de sécurité

- routes protégées,
- session vérifiée,
- permissions vérifiées,
- CSRF sur mutations,
- pas d’action destructrice sans confirmation.

---

## Règles techniques

- pas d’accès direct DB,
- appels API server-side si nécessaire,
- gestion propre des erreurs,
- revalidation/cache invalidation si nécessaire.

---

## Critères d’acceptation

- [ ] Login fonctionnel.
- [ ] MFA fonctionnel.
- [ ] Dashboard accessible.
- [ ] Gestion des réalisations fonctionnelle.
- [ ] Gestion des catégories fonctionnelle.
- [ ] Gestion des contenus fonctionnelle.
- [ ] Gestion des leads fonctionnelle.
- [ ] Upload photos fonctionnel.
- [ ] Admin responsive mobile.
- [ ] Les permissions sont respectées.
- [ ] Les mutations sont protégées.

---

## Tests à effectuer

- login admin,
- MFA,
- créer un projet,
- uploader une image,
- modifier un contenu,
- consulter un devis,
- utiliser l’admin sur mobile.
