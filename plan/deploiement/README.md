# Section 17 — Déploiement, observabilité et sauvegardes

## Objectif

Rendre le projet exploitable en production avec supervision, sauvegardes et restauration.

---

## Périmètre

Cette section couvre :

- Dockerfiles,
- configuration reverse proxy,
- variables d’environnement production,
- TLS,
- logs structurés,
- monitoring de base,
- alertes simples,
- sauvegarde PostgreSQL,
- sauvegarde S3,
- procédure de restauration,
- rollback.

---

## Infrastructure

- conteneurs non-root,
- PostgreSQL privé,
- Redis privé,
- API derrière reverse proxy,
- frontend derrière reverse proxy,
- secrets injectés proprement.

---

## Observabilité

- logs structurés,
- request ID,
- statut HTTP,
- durée,
- erreurs,
- événements de sécurité,
- métriques minimales.

---

## Sauvegardes

- sauvegarde PostgreSQL,
- sauvegarde médias S3,
- chiffrement si possible,
- rétention définie,
- test de restauration obligatoire.

---

## Déploiement

- procédure documentée,
- rollback possible,
- variables d’environnement documentées,
- healthchecks vérifiés.

---

## Critères d’acceptation

- [ ] Docker fonctionne.
- [ ] Les conteneurs sont non-root.
- [ ] Reverse proxy configuré.
- [ ] TLS actif.
- [ ] Secrets injectés proprement.
- [ ] Logs structurés exploitables.
- [ ] Monitoring minimal présent.
- [ ] Sauvegarde DB fonctionnelle.
- [ ] Sauvegarde S3 fonctionnelle.
- [ ] Restauration testée.
- [ ] Procédure de rollback documentée.

---

## Tests à effectuer

- déploiement local,
- vérification TLS,
- vérification des logs,
- vérification des sauvegardes,
- test de restauration,
- test de rollback.
