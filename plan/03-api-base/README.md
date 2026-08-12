# Section 3 — API de base

## Objectif

Créer le socle HTTP de l’API Bun : routage, erreurs, logs, structure JSON et endpoints techniques.

---

## Périmètre

Cette section couvre :

- serveur `Bun.serve`,
- routeur maison,
- gestion centralisée des erreurs,
- structure JSON standardisée,
- request ID,
- logging structuré,
- endpoints techniques.

---

## Endpoints attendus

- `GET /api/health`
- `GET /api/ready`
- route 404 propre
- gestion 405 si nécessaire

---

## Règles techniques

- routeur simple, lisible et strict,
- méthodes HTTP vérifiées,
- aucune erreur technique brute renvoyée au client,
- chaque réponse doit avoir un format JSON cohérent,
- chaque requête doit recevoir un `requestId`.

---

## Logs

Logger au minimum :

- méthode,
- chemin,
- statut,
- durée,
- requestId,
- erreur éventuelle.

Ne jamais logger :

- mots de passe,
- tokens,
- corps de requête sensible.

---

## Sécurité

- pas de fuite d’erreurs internes,
- body size limits,
- timeouts,
- gestion propre des routes inconnues,
- pas de dépendance de routing.

---

## Critères d’acceptation

- [ ] Le serveur démarre.
- [ ] Le routeur fonctionne.
- [ ] Les 404 sont propres.
- [ ] Les erreurs sont centralisées.
- [ ] Les réponses JSON sont standardisées.
- [ ] Chaque requête possède un requestId.
- [ ] Les logs sont structurés.
- [ ] Aucune erreur brute n’est renvoyée au client.
- [ ] Les méthodes non autorisées sont gérées.

---

## Tests à effectuer

- appeler une route existante,
- appeler une route inconnue,
- provoquer une erreur interne,
- vérifier les logs,
- vérifier la structure JSON.
