# auth — Bibliothèque d'authentification

Sessions opaques Redis + DB, MFA TOTP, brute-force, CSRF. **Bibliothèque réutilisable.**

## Rôle

Fournir un moteur d'authentification complet, injectable et sans port HTTP.

## API publique

```ts
import { createAuth } from "@libs/auth";

const auth = createAuth(deps, config);

// Login (résultat union type)
const result = await auth.login(email, password, { ip, userAgent });
// → { success: true, token, user } | { success: false, error: "mfa_required", pendingToken }

// Login MFA (2e étape)
const mfaResult = await auth.completeMfaLogin(pendingToken, code, { ip, userAgent });

// Session
const user = await auth.getSession(sessionToken);
await auth.logout(sessionToken);

// MFA
const setup = await auth.setupMfa(userId);
const ok = await auth.verifyMfa(userId, code);
await auth.enableMfa(userId, code);
await auth.disableMfa(userId, code);

// Change password (révoque toutes les sessions)
await auth.changePassword(userId, currentPassword, newPassword);

// CSRF : voir src/libs/csrf (bibliothèque dédiée)
import { createCsrf } from "../csrf";
const csrf = createCsrf({ cookieName: "csrf_token", headerName: "X-CSRF-Token" });
```

## Dépendances injectées

```ts
interface AuthDeps {
  db: Db;        // tables users, sessions, roles, user_roles
  redis: Redis;  // sessions actives + brute-force
  hasher?: PasswordHasher;  // défaut: Bun.password (argon2id)
  tokenGenerator?: () => string;  // défaut: crypto.randomBytes(32)
}
```

## Config

```ts
interface AuthConfig {
  sessionSecret: string;         // HMAC des tokens de session (requis en prod)
  sessionExpiryHours: number;    // durée de vie session
  mfaIssuer: string;             // nom issuer TOTP
  bruteForceMaxAttempts: number; // lockout après N échecs
  bruteForceLockoutHours: number;
}
```

## Sécurité

- **Cookies** : HttpOnly, Secure, SameSite=Strict, Path=/
- **Session opaque** : token random 256 bits en cookie, stocké en DB via HMAC-SHA256 (lookup), Redis comme cache de présence
- **Révocation** : `revoked_at` au lieu de DELETE (audit conservé)
- **Brute-force** : compteur Redis par email, lockout progressif
- **CSRF** : double-submit cookie (`csrf_token` HttpOnly=false + header `X-CSRF-Token`), comparaison en temps constant
- **MFA TOTP** : RFC 6238, fenêtre ±1 pas (30s), secret en base32
- **Messages génériques** : pas d'énumération d'emails ou de comptes
- **Redaction** : les champs `sid`, `csrf_token`, `mfa_secret`, `otp`, `recovery_code` sont automatiquement masqués par le logger

## Prérequis

- PostgreSQL : tables `users`, `sessions`, `roles`, `user_roles` (migrations 003, 004, 012)
- Redis : clés `session:<token>`, `bf:<email>`, `pending_mfa:<token>`, `mfa_setup:<userId>`

## Exemple d'import dans un autre projet

```ts
// Copier src/libs/auth/ dans votre projet
// Ajouter les types AuthDeps, AuthConfig dans vos types globaux
// Adapter les requêtes SQL si le schéma diffère

const auth = createAuth(
  { db, redis },
  { sessionSecret: "votre-secret", sessionExpiryHours: 24, mfaIssuer: "Votre App", bruteForceMaxAttempts: 5, bruteForceLockoutHours: 1 }
);

// Brancher sur vos routes HTTP
router.post("/login", async (req) => {
  const { email, password } = await req.json();
  const result = await auth.login(email, password);
  // ...
});
```

## Structure

```
src/libs/auth/
  index.ts        ← createAuth() + exports nommés
  types.ts        ← AuthDeps, AuthConfig, AuthEngine, LoginResult, AuthUser
  password.ts     ← hash/verify (argon2id) + generateToken
  session.ts      ← createSessionStore (Redis + DB)
  brute-force.ts  ← createBruteForceStore (Redis)
  mfa.ts          ← generateSecret, getOtpauthUri, verifyCode (TOTP RFC 6238)
```
