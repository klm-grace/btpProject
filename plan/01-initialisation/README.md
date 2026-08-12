# Section 1 — Initialisation du projet

## Objectif

Mettre en place la base technique du projet afin de démarrer le développement sur des fondations propres, sécurisées et reproductibles.

---

## Périmètre

Cette section couvre uniquement :

- la structure du repository,
- la configuration Bun / TypeScript,
- la configuration backend,
- la configuration frontend minimale,
- les variables d’environnement d’exemple,
- les scripts de développement,
- la connexion à PostgreSQL,
- la connexion à Redis,
- un healthcheck simple.

---

## Hors périmètre

- logique métier,
- routes API complexes,
- authentification,
- base de données complète,
- frontend avancé.

---

## Livrables attendus

- arborescence claire du projet,
- fichier `.env.example`,
- scripts `dev`, `test`, `build`, `start`,
- configuration TypeScript,
- connexion PostgreSQL fonctionnelle,
- connexion Redis fonctionnelle,
- endpoint ou script de healthcheck.

---

## Règles techniques

- Bun doit être utilisé comme runtime backend.
- TypeScript doit être configuré proprement.
- Les secrets ne doivent jamais être commités.
- Les variables d’environnement doivent être documentées dans `.env.example`.
- Le projet doit pouvoir démarrer en local avec une commande simple.

---

## Sécurité

- aucun secret réel dans le dépôt,
- `.env` ignoré par Git,
- pas de dépendances inutiles,
- structure prête pour conteneurs non-root.

---

## Critères d’acceptation

- [ ] Le repository possède une structure claire.
- [ ] Bun démarre sans erreur.
- [ ] TypeScript est configuré.
- [ ] `.env.example` liste toutes les variables nécessaires.
- [ ] La connexion PostgreSQL fonctionne.
- [ ] La connexion Redis fonctionne.
- [ ] Un healthcheck simple est disponible.
- [ ] Aucun secret réel n’est présent dans le code.
- [ ] Les commandes de développement sont documentées.

---

## Tests à effectuer

- démarrer le backend,
- vérifier la connexion PostgreSQL,
- vérifier la connexion Redis,
- vérifier que `.env` n’est pas commité,
- vérifier que `.env.example` est complet.
