# @libs/body — Middleware de parsing multi-format

Bibliothèque de parsing et validation des corps de requête HTTP. Supporte JSON, form-urlencoded, text/plain et XML.

## Rôle

Ce middleware s'intercepte avant les routes pour :
- Parser automatiquement le body selon le Content-Type
- Attacher le résultat à `ctx.state.body`
- Vérifier la taille selon le format
- Protéger contre les attaques (prototype pollution, XXE, billion laughs, chunked encoding)

## Usage

```ts
import { createBodyMiddleware } from "@libs/body";

const bodyMiddleware = createBodyMiddleware({
  jsonMaxBytes: 4_096,          // 4 Ko pour JSON
  jsonMaxDepth: 32,             // Profondeur max JSON
  formMaxBytes: 4_096,          // 4 Ko pour form
  formMaxKeys: 100,             // Max 100 champs
  formKeyMaxBytes: 100,         // Clé max 100 bytes
  textMaxBytes: 1_024,          // 1 Ko pour text
  xmlMaxBytes: 100 * 1024,      // 100 Ko pour XML
  xmlMaxDepth: 16,              // Profondeur max XML
  xmlMaxElements: 1_000,        // Anti billion laughs
  multipartMaxBytes: 10 * 1024 * 1024, // 10 Mo pour uploads
  readTimeoutMs: 5_000,         // Timeout 5s
});

// Dans l'app :
router.use(bodyMiddleware);
```

## Formats supportés

| Content-Type | Action | ctx.state.body |
|---|---|---|
| `application/json` | Parse → objet | `{ email: "...", ... }` |
| `application/x-www-form-urlencoded` | Parse → objet | `{ email: "...", ... }` |
| `text/plain` | Stocke brut | `"texte brut"` |
| `application/xml`, `text/xml` | Parse → objet | `{ name: "...", ... }` |
| `multipart/form-data` | Skip (taille vérifiée) | `undefined` |
| Autre | Skip | `undefined` |

## Sécurité

| Menace | Protection |
|---|---|
| **Prototype pollution** | Clés `__proto__`, `constructor`, `prototype` rejetées (JSON + form) |
| **XXE** | DOCTYPE et entités SYSTEM/PUBLIC strictement interdits |
| **Billion laughs** | Limite éléments XML (1000) + profondeur (16) |
| **JSON depth overflow** | Limite profondeur JSON (32) |
| **DoS par taille** | Limite par Content-Type |
| **DoS par chunked** | Rejet explicite de `Transfer-Encoding: chunked` |
| **DoS par streaming lent** | Timeout 5s sur la lecture |
| **Null byte injection** | Bloqué par `URLSearchParams` |

## Erreurs renvoyées

| Code | Statut | Signification |
|---|---|---|
| `CHUNKED_ENCODING_NOT_ALLOWED` | 400 | En-tête Transfer-Encoding: chunked détecté |
| `INVALID_CONTENT_LENGTH` | 400 | Content-Length invalide |
| `BODY_TOO_LARGE` | 413 | Body dépasse la limite |
| `INVALID_JSON` | 400 | JSON malformé ou pas un objet |
| `JSON_MAX_DEPTH` | 400 | JSON trop profond |
| `PROTOTYPE_POLLUTION` | 400 | Clé interdite détectée |
| `INVALID_FORM` | 400 | Form-encoded invalide |
| `FORM_TOO_LARGE` | 400 | Form trop grand |
| `FORM_KEY_TOO_LONG` | 400 | Clé de formulaire trop longue |
| `FORM_TOO_MANY_KEYS` | 400 | Trop de champs dans le formulaire |
| `TEXT_TOO_LARGE` | 400 | Texte trop long |
| `INVALID_XML` | 400 | XML malformé |
| `XML_TOO_LARGE` | 413 | XML trop grand |
| `XML_DOCTYPE_NOT_ALLOWED` | 400 | DOCTYPE détecté (anti-XXE) |
| `XML_EXTERNAL_ENTITY_NOT_ALLOWED` | 400 | Entité externe détectée (anti-XXE) |
| `XML_PROCESSING_INSTRUCTION_NOT_ALLOWED` | 400 | Instruction processing détectée |
| `XML_MAX_DEPTH` | 400 | XML trop profond |
| `XML_TOO_COMPLEX` | 400 | Trop d'éléments XML (anti billion laughs) |
| `READ_TIMEOUT` | 408 | Timeout de lecture |

## Tests

```bash
# Tous les tests body
bun test src/libs/body/

# Parser unitaire
bun test src/libs/body/parsers/json.test.ts
bun test src/libs/body/parsers/form.test.ts
bun test src/libs/body/parsers/text.test.ts
bun test src/libs/body/parsers/xml.test.ts
bun test src/libs/body/readers/stream.test.ts

# Tests intégration
bun test src/libs/body/body.test.ts
```

## Architecture

```
src/libs/body/
  index.ts           ← exports nommés
  types.ts           ← interfaces publiques + defaults
  body.ts            ← middleware orchestrateur
  parsers/
    json.ts          ← parser JSON + profondeur + prototype
    form.ts          ← parser form-urlencoded
    text.ts          ← parser text/plain
    xml.ts           ← parser XML SAX maison (anti XXE)
  readers/
    stream.ts        ← lecteur streaming avec timeout
  body.test.ts       ← tests intégration
  parsers/*.test.ts  ← tests unitaires
  readers/*.test.ts  ← tests streaming
  README.md
```

## Exemple d'intégration

```ts
// apps/api/index.ts
import { createBodyMiddleware } from "@libs/body";

const bodyMiddleware = createBodyMiddleware({
  jsonMaxBytes: 4 * 1024,
  multipartMaxBytes: config.storage.maxFileSizeBytes,
  // ... autres configs
});

router.use(bodyMiddleware);

// Dans un handler :
export const handleLogin: RouteHandler = async (req, ctx) => {
  const body = ctx.state.body as Record<string, unknown> ?? {};
  const { email, password } = body;
  // ...
};
```
