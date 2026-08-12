# Section 8 — Formulaires publics contact / devis

## Objectif

Créer les endpoints publics de collecte de leads, avec validation, consentement, anti-abus et stockage fiable.

---

## Périmètre

Cette section couvre :

- endpoint contact,
- endpoint devis,
- validation Zod,
- consentement RGPD,
- honeypot anti-bot,
- rate limiting,
- stockage en base,
- outbox email,
- réponse publique propre.

---

## Règles fonctionnelles

- un formulaire valide doit être enregistré,
- un formulaire invalide doit être rejeté,
- un formulaire abusif doit être limité,
- le consentement doit être stocké,
- les erreurs ne doivent pas fuiter.

---

## Bibliothèques vs métier

- Validation, honeypot, helpers de consentement / anti-abus **génériques** → sous `src/libs/` (bibliothèques, injection, pas de port).
- Endpoints contact/devis et mapping vers le schéma leads → **couche app** (métier BTP), qui compose les bibliothèques.
- Réutiliser rate-limit / validation déjà livrés ; ne pas recréer un mini-serveur formulaires.

## Règles de sécurité

- validation serveur systématique,
- pas d'exécution de HTML,
- pas de confiance dans les champs cachés,
- rate limiting par IP et par endpoint,
- journalisation des abus.

---

## RGPD

- case de consentement,
- version du consentement,
- horodatage,
- minimisation des données,
- possibilité d'archiver / purger plus tard.

---

## Email / notification

- ne pas bloquer la réponse utilisateur sur l'envoi email,
- utiliser une outbox,
- réessayer en cas d'échec,
- ne jamais exposer d'erreur SMTP au client.

---

## Critères d'acceptation

- [ ] L'endpoint contact fonctionne.
- [ ] L'endpoint devis fonctionne.
- [ ] La validation Zod est en place.
- [ ] Le consentement est enregistré.
- [ ] Le honeypot est présent.
- [ ] Le rate limiting fonctionne.
- [ ] Les abus sont journalisés.
- [ ] Les réponses sont propres.
- [ ] L'outbox email est utilisée.
- [ ] Aucune erreur technique n'est renvoyée au client.

---

## Tests à effectuer

- soumission valide,
- soumission invalide,
- email invalide,
- message trop long,
- soumissions répétées,
- honeypot rempli,
- vérification du stockage en base,
- vérification de l'outbox.
