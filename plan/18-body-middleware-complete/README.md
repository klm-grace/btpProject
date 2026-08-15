# Plan Section 18 — Bibliothèque `@libs/body` : Parsing multi-format

> **Dépendances** : sections 03 (API base), 04 (sécurité HTTP)
> **Durée estimée** : 2-3 heures

---

## Objectif

Étendre la bibliothèque `@libs/body` pour supporter **tous les types de body courants** tout en maintenant une **sécurité renforcée** contre les attaques les plus connues.

### Formats à supporter

| Content-Type | Action | Sécurité critique |
|---|---|---|
| `application/json` | Parse → `ctx.state.body` | Prototype pollution, taille |
| `application/x-www-form-urlencoded` | Parse → `ctx.state.body` | Prototype pollution, taille, encoding |
| `text/plain` | Parse → `ctx.state.body` comme `{ _text: "..." }` | Taille |
| `application/xml`, `text/xml` | Parse → `ctx.state.body` comme objet | XXE, billion laughs, DOCTYPE |
| `multipart/form-data` | Skip (laisse au handler), vérifie taille | Taille |
| `*/*` (autre) | Skip | — |

---

## Architecture de la bibliothèque

```
src/libs/body/
  index.ts           ← exports nommés
  types.ts           ← interfaces publiques
  body.ts            ← middleware principal (création + orchestration)
  parsers/
    json.ts          ← parser JSON + prototype pollution
    form.ts          ← parser form-urlencoded
    text.ts          ← parser text/plain
    xml.ts           ← parser XML sécurisé
  readers/
    stream.ts        ← lecteur streaming avec timeout
  index.ts
  README.md
  body.test.ts
  parsers/
    json.test.ts
    form.test.ts
    text.test.ts
    xml.test.ts
  readers/
    stream.test.ts
```

---

## Détails par format

### 1. `application/json` (déjà existant, amélioré)

| Aspect | Détail |
|---|---|
| Parser | `JSON.parse()` |
| Validation | Clés interdites : `__proto__`, `constructor`, `prototype` |
| Taille | `config.jsonMaxBytes` (4 Ko par défaut) |
| Error | `INVALID_JSON`, `BODY_TOO_LARGE`, `PROTOTYPE_POLLUTION` |
| **Sécurité supplémentaire** | Profondeur max de récursion JSON (`config.jsonMaxDepth`, défaut 32) |

#### Attaque JSON depth
Un JSON comme `{"a":{"b":{"c":...}}}` peut causer une stack overflow. On limite la profondeur.

```ts
// json.ts
function parseJsonSafe(text: string, maxDepth = 32): Record<string, unknown> {
  // Vérifie la profondeur avant parsing
  let depth = 0;
  let maxSeen = 0;
  for (const ch of text) {
    if (ch === '{' || ch === '[') {
      depth++;
      maxSeen = Math.max(maxSeen, depth);
      if (depth > maxDepth) throw new Error("JSON_MAX_DEPTH");
    } else if (ch === '}' || ch === ']') {
      depth--;
    }
  }
  return JSON.parse(text) as Record<string, unknown>;
}
```

---

### 2. `application/x-www-form-urlencoded`

| Aspect | Détail |
|---|---|
| Parser | `new URLSearchParams(text)` |
| Conversion | Transforme en objet simple (pas de tableau) |
| Validation | Clés interdites : `__proto__`, `constructor`, `prototype` |
| Taille | `config.formMaxBytes` (4 Ko par défaut) |
| Error | `INVALID_FORM`, `BODY_TOO_LARGE`, `PROTOTYPE_POLLUTION` |
| **Sécurité** | Null bytes dans les clés, clés trop longues |

#### Attaques form-urlencoded
- **Null byte injection** : `key=\x00value` — bloqué par `URLSearchParams`
- **Clé trop longue** : `config.formKeyMaxBytes` (100 par défaut)
- **Nombre de clés** : `config.formMaxKeys` (100 par défaut) — DoS via loop

```ts
// form.ts
export function parseForm(text: string, config: FormConfig): Record<string, string> {
  if (text.length > config.maxBytes) throw new Error("FORM_TOO_LARGE");
  
  const params = new URLSearchParams(text);
  const result: Record<string, string> = {};
  let keyCount = 0;
  
  for (const [key, value] of params.entries()) {
    if (key.length > config.keyMaxBytes) throw new Error("FORM_KEY_TOO_LONG");
    if (PROHIBITED_KEYS.has(key)) throw new Error("PROTOTYPE_POLLUTION");
    if (keyCount >= config.maxKeys) throw new Error("FORM_TOO_MANY_KEYS");
    result[key] = value;
    keyCount++;
  }
  
  return result;
}
```

---

### 3. `text/plain`

| Aspect | Détail |
|---|---|
| Parser | `req.text()` (stockage brut) |
| Stockage | `ctx.state.body = { _text: text }` |
| Taille | `config.textMaxBytes` (1 Ko par défaut) |
| Error | `BODY_TOO_LARGE` |

Trivial — juste une limite de taille.

---

### 4. `application/xml` / `text/xml`

| Aspect | Détail |
|---|---|
| Parser | Bibliothèque XML externe ou parsing natif |
| Conversion | XML → objet JavaScript |
| Validation | Profondeur max, nombre max d'éléments |
| Taille | `config.xmlMaxBytes` (100 Ko par défaut) |
| Error | `INVALID_XML`, `BODY_TOO_LARGE`, `XML_XEE`, `XML_MAX_DEPTH` |
| **Sécurité critique** | XXE, billion laughs, DOCTYPE |

#### Attaques XML critiques

**XXE (XML External Entity)**
```xml
<!-- Attaque : lecture de fichier local -->
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<root>&xxe;</root>
```

**Billion laughs**
```xml
<!DOCTYPE foo [<!ENTITY a "lol"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">...]>
<root>&b;</root>
```

**Protection :**
1. **Bloquer DOCTYPE** : toute occurrence de `<!DOCTYPE` → 400
2. **Bloquer entités externes** : tout `SYSTEM` ou `PUBLIC` → 400
3. **Profondeur max** : `config.xmlMaxDepth` (défaut 16)
4. **Taille max** : `config.xmlMaxBytes` (défaut 100 Ko)
5. **Nombre max d'éléments** : `config.xmlMaxElements` (défaut 1000)

```ts
// xml.ts — parsing sécurisé
export function parseXmlSafe(xml: string, config: XmlConfig): Record<string, unknown> {
  // 1. Vérifier taille
  if (xml.length > config.maxBytes) throw new Error("XML_TOO_LARGE");
  
  // 2. Bloquer DOCTYPE (XXE)
  if (/<!DOCTYPE/i.test(xml)) throw new Error("XML_DOCTYPE_NOT_ALLOWED");
  
  // 3. Bloquer entités externes
  if (/SYSTEM\s+["']/i.test(xml)) throw new Error("XML_EXTERNAL_ENTITY_NOT_ALLOWED");
  
  // 4. Parser avec limit de profondeur
  const obj = xmlToObj(xml, { maxDepth: config.maxDepth });
  
  // 5. Compter les éléments (anti billion laughs)
  if (countElements(obj) > config.maxElements) throw new Error("XML_TOO_COMPLEX");
  
  return obj;
}

// xmlToObj utilise un parser SAX simple pour éviter les entités
function xmlToObj(xml: string, options: { maxDepth: number }): Record<string, unknown> {
  // Parser caractère par caractère, pas de système d'entités
  // ...
}
```

> **Note** : Pour le parsing XML, on utilise un **parser SAX maison** (pas de bibliothèque externe) pour éviter les vulnérabilités des parsers XML tiers. Le parser construit un objet JavaScript brut sans résoudre les entités.

---

### 5. Streaming (sans Content-Length)

| Aspect | Détail |
|---|---|
| Problème | `Content-Length` manquant → impossible de vérifier la taille avant lecture |
| Solution | Lecture chunk par chunk avec compteur + timeout |
| Timeout | `config.readTimeoutMs` (défaut 5000 ms) |
| Error | `READ_TIMEOUT` |
| Implémentation | `AbortController` + boucle de lecture |

```ts
// stream.ts
export async function readBodySafe(
  req: Request,
  config: { maxBytes: number; timeoutMs: number }
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  
  let totalBytes = 0;
  const chunks: Uint8Array[] = [];
  
  try {
    const reader = req.body?.getReader();
    if (!reader) return "";
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      totalBytes += value.length;
      if (totalBytes > config.maxBytes) {
        controller.abort();
        throw new Error("BODY_TOO_LARGE");
      }
      
      chunks.push(value);
    }
  } finally {
    clearTimeout(timeout);
  }
  
  // Concaténer les chunks
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return new TextDecoder().decode(result);
}
```

---

## Configuration finale

```ts
// types.ts
export interface BodyMiddlewareConfig {
  // Taille
  jsonMaxBytes: number;        // 4 Ko
  formMaxBytes: number;        // 4 Ko
  textMaxBytes: number;        // 1 Ko
  xmlMaxBytes: number;         // 100 Ko
  multipartMaxBytes: number;   // 10 Mo (lecture seulement, parsing handler)
  
  // Profondeur
  jsonMaxDepth: number;        // 32
  xmlMaxDepth: number;         // 16
  xmlMaxElements: number;      // 1000
  
  // Form
  formMaxKeys: number;         // 100
  formKeyMaxBytes: number;     // 100
  
  // Streaming
  readTimeoutMs: number;       // 5000
}
```

---

## Plan de tests

### Tests unitaires par parser

| Fichier | Tests |
|---|---|
| `parsers/json.test.ts` | Parse valide, JSON vide, JSON malformé, prototype pollution, depth max, taille max |
| `parsers/form.test.ts` | Parse valide, vide, clés doubles, clé trop longue, trop de clés, prototype pollution, null byte |
| `parsers/text.test.ts` | Texte valide, vide, trop long |
| `parsers/xml.test.ts` | XML valide, DOCTYPE, entité externe, billion laughs, profondeur max, taille max |
| `readers/stream.test.ts` | Lecture normale, timeout, taille max dépassée, corps vide |
| `body.test.ts` | Intégration complète : chaque Content-Type, erreurs, middleware chain |

### Tests d'intégration API (MCP Bruno)

Collection Bruno `bruno/collections/section18-body/` :

| Test | Méthode | Endpoint | Attendu |
|---|---|---|---|
| JSON valide | POST | `/api/test/body` | 200, body parsé |
| JSON trop gros | POST | `/api/test/body` | 413 |
| JSON malformé | POST | `/api/test/body` | 400 |
| Prototype pollution JSON | POST | `/api/test/body` | 400, PROTOTYPE_POLLUTION |
| JSON depth max | POST | `/api/test/body` | 400, JSON_MAX_DEPTH |
| Form valide | POST | `/api/test/body` | 200, body parsé |
| Form trop de clés | POST | `/api/test/body` | 400, FORM_TOO_MANY_KEYS |
| Form null byte | POST | `/api/test/body` | 400 |
| Text valide | POST | `/api/test/body` | 200, `_text` présent |
| Text trop gros | POST | `/api/test/body` | 413 |
| XML valide | POST | `/api/test/body` | 200, body parsé |
| XML DOCTYPE | POST | `/api/test/body` | 400, XML_DOCTYPE_NOT_ALLOWED |
| XML entité externe | POST | `/api/test/body` | 400, XML_EXTERNAL_ENTITY_NOT_ALLOWED |
| XML billion laughs | POST | `/api/test/body` | 400, XML_TOO_COMPLEX |
| Chunked rejected | POST | `/api/test/body` | 400, CHUNKED_ENCODING_NOT_ALLOWED |
| Streaming timeout | POST | `/api/test/body` | 408 (timeout) |

---

## Étapes d'implémentation

| # | Étape | Fichiers |
|---|---|---|
| 1 | `types.ts` — interfaces publiques | `src/libs/body/types.ts` |
| 2 | `parsers/json.ts` — parser JSON avec depth limit | `src/libs/body/parsers/json.ts` |
| 3 | `parsers/form.ts` — parser form | `src/libs/body/parsers/form.ts` |
| 4 | `parsers/text.ts` — parser text/plain | `src/libs/body/parsers/text.ts` |
| 5 | `parsers/xml.ts` — parser XML SAX maison sécurisé | `src/libs/body/parsers/xml.ts` |
| 6 | `readers/stream.ts` — lecteur streaming avec timeout | `src/libs/body/readers/stream.ts` |
| 7 | `body.ts` — middleware orchestrateur | `src/libs/body/body.ts` |
| 8 | `index.ts` — exports | `src/libs/body/index.ts` |
| 9 | Tests unitaires par parser | `**/*.test.ts` |
| 10 | Tests d'intégration + collection Bruno | `test/api/body.test.ts`, `bruno/collections/section18-body/` |
| 11 | README bibliothèque | `src/libs/body/README.md` |

---

## Sécurité checklist

- [ ] **Prototype pollution** : bloqué pour JSON, form, XML
- [ ] **XXE** : DOCTYPE et entités externes bloqués
- [ ] **Billion laughs** : limite éléments XML + profondeur
- [ ] **Depth overflow** : limite profondeur JSON et XML
- [ ] **Body size** : toutes les tailles sont limitées
- [ ] **Chunked encoding** : rejeté
- [ ] **Streaming** : timeout + taille limitée
- [ ] **Null byte** : bloqué dans les clés form
- [ ] **Aucune dépendance externe** : parser XML maison
- [ ] **Aucun `process.env`** : config injectée
- [ ] **Aucun port** : bibliothèque pure
- [ ] **Pas de side-effect à l'import** : factory pattern
