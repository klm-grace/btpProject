# Section 11 — Admin contenus éditoriaux

## Objectif

Rendre le site réellement administrable sans développeur en permettant la gestion des contenus principaux.

---

## Périmètre

Cette section couvre :

- informations entreprise,
- coordonnées,
- téléphone / WhatsApp,
- adresse / carte,
- services,
- équipe,
- mentions légales,
- politique de confidentialité,
- blocs de contenu,
- SEO de base.

---

## Contenus administrables

- nom de l’entreprise,
- slogan,
- texte de présentation,
- téléphone,
- WhatsApp,
- adresse,
- localisation Maps,
- liste des services,
- membres de l’équipe,
- pages légales.

---

## Règles techniques

- permissions,
- CSRF,
- validation Zod,
- transactions si nécessaire,
- audit logs,
- invalidation de cache après modification.

---

## Sécurité

- seules les personnes autorisées peuvent modifier,
- pas d’exposition de secrets,
- validation stricte des champs,
- journalisation des modifications.

---

## Critères d’acceptation

- [ ] Les informations entreprise sont modifiables.
- [ ] Les coordonnées sont modifiables.
- [ ] Téléphone / WhatsApp sont modifiables.
- [ ] Les services sont modifiables.
- [ ] L’équipe est modifiable.
- [ ] Les mentions légales sont modifiables.
- [ ] La politique de confidentialité est modifiable.
- [ ] Les modifications sont visibles côté public.
- [ ] Le cache est invalidé correctement.
- [ ] Les permissions sont respectées.
- [ ] Les mutations sont protégées par CSRF.

---

## Tests à effectuer

- modifier une information entreprise,
- modifier un service,
- modifier un membre de l’équipe,
- modifier une page légale,
- vérifier la visibilité côté public,
- vérifier l’audit log.
