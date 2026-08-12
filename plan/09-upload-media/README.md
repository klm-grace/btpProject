# Section 9 — Upload et pipeline médias

## Objectif

Gérer les fichiers et images de façon sécurisée, fiable et compatible avec une administration depuis téléphone.

---

## Périmètre

Cette section couvre :

- upload d'images,
- validation MIME réelle,
- validation magic bytes,
- taille maximale,
- extensions autorisées,
- renommage système,
- stockage S3,
- statut média,
- variantes,
- nettoyage des fichiers orphelins.

---

## Règles de sécurité

- jamais de fichier utilisateur stocké durablement sur le disque applicatif,
- jamais de nom de fichier utilisateur utilisé tel quel,
- vérifier le contenu réel du fichier,
- limiter la taille avant traitement,
- rejeter les fichiers non autorisés.

### Bibliothèque `upload` / médias

- Pipeline upload, validation MIME/magic bytes, client S3, variantes : fichiers sous `src/libs/` (ex. `upload`, `media`) en **bibliothèque**.
- `createUpload(deps, config)` — client S3 et limites **injectés** ; pas de `process.env` dans la bibliothèque ; **pas** de serveur upload autonome.
- L'API expose les routes d'upload en composant la bibliothèque.
- Réutilisable hors BTP ; README de bibliothèque + exemple d'import autre projet.

---

## Pipeline attendu

1. réception contrôlée,
2. validation MIME / magic bytes,
3. statut `uploading`,
4. stockage S3,
5. traitement image,
6. variantes,
7. statut `ready`,
8. association au contenu.

---

## Images

- resize,
- compression,
- conversion WebP,
- suppression des métadonnées sensibles si possible,
- cas HEIC géré ou rejet explicite.

---

## Fichiers orphelins

- les fichiers non confirmés doivent être nettoyés,
- une stratégie automatique doit être prévue,
- aucun fichier orphelin ne doit rester indéfiniment.

---

## Critères d'acceptation

- [ ] L'upload valide fonctionne.
- [ ] L'upload invalide est rejeté.
- [ ] MIME réel vérifié.
- [ ] Magic bytes vérifiés.
- [ ] Taille maximale respectée.
- [ ] Extensions autorisées respectées.
- [ ] Fichiers renommés.
- [ ] Stockage S3 fonctionnel.
- [ ] Variantes générées.
- [ ] Statuts média gérés.
- [ ] Fichiers orphelins nettoyés.
- [ ] Upload utilisable depuis mobile.

---

## Tests à effectuer

- upload image valide,
- upload fichier invalide,
- upload trop lourd,
- mauvais MIME,
- magic bytes incorrects,
- fichier orphelin non confirmé,
- génération de variantes.
