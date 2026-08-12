# Section 5 — Authentification, sessions et MFA

## Objectif

Mettre en place un accès administrateur sécurisé, avec sessions opaques, protection brute-force et MFA.

---

## Périmètre

Cette section couvre :

- login,
- logout,
- hachage des mots de passe,
- sessions Redis,
- cookies sécurisés,
- changement de mot de passe,
- réinitialisation sécurisée si nécessaire,
- protection brute-force,
- MFA TOTP,
- audit des connexions.

---

## Règles d’authentification

- hachage avec `Bun.password`,
- algorithme `argon2id`,
- paramètres alignés OWASP,
- pas de JWT,
- session opaque stockée dans Redis,
- session révocable côté serveur,
- rotation de session après login.

---

## Cookies

Les cookies doivent être :

- HttpOnly,
- Secure,
- SameSite=Strict.

---

## MFA

- TOTP obligatoire pour les comptes admin,
- implémentation propre via crypto native ou solution validée,
- vérification stricte du code,
- protection contre le brute-force du code TOTP.

---

## Protection des comptes

- messages d’erreur génériques,
- pas d’énumération d’email,
- limitation des tentatives,
- lockout progressif ou délais croissants,
- journalisation des succès et échecs.

---

## Sécurité

- aucune donnée sensible dans le cookie,
- session expirable,
- révocation immédiate possible,
- audit des connexions.

---

## Critères d’acceptation

- [ ] Login fonctionnel.
- [ ] Logout fonctionnel.
- [ ] Mot de passe haché avec argon2id.
- [ ] Session opaque Redis fonctionnelle.
- [ ] Cookie sécurisé correctement défini.
- [ ] Session expire.
- [ ] Session est révoquée après logout.
- [ ] Rotation de session après login.
- [ ] MFA fonctionnel.
- [ ] Brute-force limité.
- [ ] Les échecs sont journalisés.
- [ ] Les messages d’erreur ne révèlent pas d’informations sensibles.

---

## Tests à effectuer

- login valide,
- login invalide,
- logout,
- expiration de session,
- tentative brute-force,
- MFA valide,
- MFA invalide,
- changement de mot de passe.
