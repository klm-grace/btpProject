/**
 * Http — Helpers de réponse HTTP JSON standardisée pour Bun.js.
 *
 * Inspiré de Hono (c.json) et Express (res.json), mais avec un format
 * de réponse structuré et sécurisé (envelope { success, data/error }).
 *
 * ## Sérialisation sûre
 * - BigInt → string (évite crash JSON.stringify)
 * - Cycles → "[Circular]" (évite crash)
 * - undefined → supprimé (pas de null dans la réponse)
 * - Date → ISO string (natif JS)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────────────────

/** Options communes à toutes les réponses JSON. */
export interface JsonOptions {
  /** Statut HTTP (défaut: 200). */
  status?: number;
  /** Identifiant de requête (injecté automatiquement si disponible). */
  requestId?: string;
  /** En-têtes additionnels. */
  headers?: Record<string, string>;
  /** Métadonnées (ex. pagination). */
  meta?: Record<string, unknown>;
}

/** Options spécifiques à une réponse de succès. */
export interface JsonOkOptions extends JsonOptions {}

/** Options spécifiques à une réponse d'erreur. */
export interface JsonErrorDetails {
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

/** Options pour le streaming. */
export interface JsonStreamOptions {
  /** Type de contenu (défaut: application/json). */
  contentType?: string;
  /** Statut HTTP (défaut: 200). */
  status?: number;
  /** En-têtes additionnels. */
  headers?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sérialisation sûre
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valeur retournée pour les références cycliques lors de la sérialisation.
 */
const CIRCULAR_REPLACEMENT = "[Circular]";

/**
 * Replacer JSON sûr qui gère les cas edge:
 * - BigInt → string
 * - Références cycliques → "[Circular]"
 * - undefined → supprimé (return undefined supprime la clé)
 */
function safeStringify(value: unknown, replacer?: (key: string, value: unknown) => unknown): string {
  const seen = new WeakSet<object>();

  function serializer(key: string, value: unknown): unknown {
    // undefined → supprimer la clé
    if (value === undefined) return undefined;

    // BigInt → string
    if (typeof value === "bigint") return value.toString();

    // Objet/Nul → détection de cycle
    if (value !== null && typeof value === "object") {
      const obj = value as object;
      if (seen.has(obj)) return CIRCULAR_REPLACEMENT;
      seen.add(obj);
    }

    return replacer ? replacer(key, value) : value;
  }

  return JSON.stringify(value, serializer);
}

// ─────────────────────────────────────────────────────────────────────────────
// json() — Helper principal (style Hono, mais avec envelope structurée)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Réponse JSON unique — détecte automatiquement succès vs erreur.
 *
 * - Si body contient `{ error: ... }` → réponse d'erreur (4xx/5xx)
 * - Sinon → réponse de succès (2xx)
 *
 * @example
 *   json({ token: "abc" })                          // → 200, { success: true, data: {...} }
 *   json({ token: "abc" }, 201)                     // → 201
 *   json({ error: "Invalid" }, 400)                 // → 400, { success: false, error: {...} }
 *   json({ error: "Invalid" }, 400, { code: "ERR" }) // → 400 avec code explicite
 */
export function json<T>(
  body: T,
  statusOrOptions: number | JsonOptions = {},
  errorOptions?: { code?: string; requestId?: string },
): Response {
  const isNumber = typeof statusOrOptions === "number";
  const status: number = isNumber ? statusOrOptions : (statusOrOptions.status ?? 200);
  const options: JsonOptions = isNumber ? {} : statusOrOptions;
  const requestId = options.requestId ?? errorOptions?.requestId;
  const headers: Record<string, string> = {
    "Content-Type": "application/json;charset=utf-8",
    ...(options.headers ?? {}),
  };

  const bodyObj = body as Record<string, unknown>;

  // Détecte si c'est une erreur via la clé "error"
  // Attention: si body est null/undefined, bodyObj est {} après coercion → pas d'erreur
  if (body !== null && body !== undefined && bodyObj.error !== undefined) {
    const code = errorOptions?.code ?? "error";
    const errorStatus = status !== 200 ? status : 400;
    const error: Record<string, unknown> = { code, message: String(bodyObj.error) };
    if (requestId) error.requestId = requestId;
    return new Response(safeStringify({ success: false, error }), { status: errorStatus, headers });
  }

  // Succès
  const data: Record<string, unknown> = { success: true, data: bodyObj };
  if (requestId) data.requestId = requestId;
  if (options.meta) data.meta = options.meta;
  return new Response(safeStringify(data), { status, headers });
}

// ─────────────────────────────────────────────────────────────────────────────
// jsonOk() — Succès explicite (backward compatible)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Réponse JSON de succès : `{ success: true, data, requestId?, meta? }`
 *
 * @example
 *   jsonOk({ user: { id: 1 } })
 *   jsonOk({ user: { id: 1 } }, 201)
 *   jsonOk({ user: { id: 1 } }, { status: 201, requestId: "req-123", meta: { ... } })
 */
export function jsonOk<T>(data: T, options: JsonOkOptions | number = {}): Response {
  const statusOrOpts = typeof options === "number" ? { status: options } : options;
  const { status = 200, requestId, meta, headers } = statusOrOpts;
  const body: Record<string, unknown> = { success: true, data };
  if (requestId) body.requestId = requestId;
  if (meta) body.meta = meta;
  return new Response(safeStringify(body), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8", ...(headers ?? {}) },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// jsonError() — Error explicite simplifiée (nouveau, plus concis)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Réponse JSON d'erreur simplifiée : `{ success: false, error: { code, message, requestId?, details? } }`
 *
 * @example
 *   jsonError({ code: "AUTH_FAILED", message: "Invalid credentials" }, 401)
 *   jsonError({ code: "NOT_FOUND", message: "User not found" })
 */
export function jsonError(details: JsonErrorDetails, status: number = 400): Response {
  const error: Record<string, unknown> = { code: details.code, message: details.message };
  if (details.requestId) error.requestId = details.requestId;
  if (details.details && Object.keys(details.details).length > 0) error.details = details.details;
  return new Response(safeStringify({ success: false, error }), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8" },
  });
}

/**
 * Alias de jsonError pour compatibilité avec l'ancien nom.
 * @deprecated Utilisez jsonError à la place.
 */
export function jsonErrorResponse(details: JsonErrorDetails, status: number = 400): Response {
  return jsonError(details, status);
}

// ─────────────────────────────────────────────────────────────────────────────
// jsonPaginated() — Pagination (inchangé)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Réponse JSON paginée : `{ success: true, data: T[], meta: { page, pageSize, total, totalPages } }`
 *
 * @example
 *   jsonPaginated(users, 1, 20, 150)
 *   jsonPaginated(users, 1, 20, 150, { requestId: "req-123" })
 */
export function jsonPaginated<T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number,
  options: JsonOkOptions = {},
): Response {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return jsonOk(data, {
    ...options,
    meta: {
      page,
      pageSize,
      total,
      totalPages,
      ...(options.meta ?? {}),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// jsonStream() — Streaming binaire / SSE (nouveau)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * jsonStream() — Streaming binaire / SSE (nouveau)
 *
 * ⚠️  Security: Pas de limite de taille sur le body stream.
 *    Le caller doit s'assurer que le stream a une taille raisonnable.
 *    Pour les gros fichiers, utiliser un streaming chunké avec Content-Length.
 */
export function jsonStream(
  body: ReadableStream<Uint8Array> | Blob | string | Uint8Array,
  options: JsonStreamOptions = {},
): Response {
  const contentType = options.contentType ?? "application/json";
  const status = options.status ?? 200;
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    ...(options.headers ?? {}),
  };

  let bodyValue: string | Uint8Array | Blob | ReadableStream<Uint8Array>;
  if (typeof body === "string") {
    bodyValue = body;
  } else if (body instanceof Uint8Array) {
    bodyValue = body;
  } else if (body instanceof Blob) {
    bodyValue = body;
  } else if (body instanceof ReadableStream) {
    bodyValue = body;
  } else {
    // Fallback: stringifier
    bodyValue = safeStringify(body);
  }

  return new Response(bodyValue, { status, headers });
}

// ─────────────────────────────────────────────────────────────────────────────
// text() — Réponse texte brut (text/plain)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Réponse texte brut (text/plain).
 *
 * @example
 *   text("Hello World")
 *   text("Plain text", 200)
 *   text("Created", 201)
 */
export function text(body: string, status: number = 200, options: { headers?: Record<string, string> } = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
      ...(options.headers ?? {}),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// html() — Réponse HTML (text/html)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Réponse HTML (text/html).
 *
 * @example
 *   html("<h1>Hello</h1>")
 *   html("<h1>Hello</h1>", 200)
 *   html("<h1>Created</h1>", 201)
 */
export function html(body: string, status: number = 200, options: { headers?: Record<string, string> } = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html;charset=utf-8",
      ...(options.headers ?? {}),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// xml() — Réponse XML (application/xml)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Réponse XML (application/xml).
 * Note: ne fait PAS d'échappement — le caller doit s'assurer que le XML est valide.
 *
 * @example
 *   xml("<root><item>test</item></root>")
 *   xml("<root>data</root>", 200)
 */
export function xml(body: string, status: number = 200, options: { headers?: Record<string, string> } = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/xml;charset=utf-8",
      ...(options.headers ?? {}),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// notFound() — Réponse 404 standardisée
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Réponse 404 standardisée (JSON avec envelope).
 *
 * @example
 *   notFound()
 *   notFound("Resource not found")
 *   notFound({ code: "USER_NOT_FOUND", message: "User not found" })
 */
export function notFound(
  messageOrDetails: string | { code: string; message: string; requestId?: string; details?: Record<string, unknown> } = "Not found",
  options: { requestId?: string; headers?: Record<string, string> } = {}
): Response {
  const details = typeof messageOrDetails === "string"
    ? { code: "NOT_FOUND", message: messageOrDetails }
    : messageOrDetails;
  return jsonError(details, 404);
}

// ─────────────────────────────────────────────────────────────────────────────
// send() — Auto-détection du format (style Express res.send)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envoie une réponse avec auto-détection du format (style Express res.send).
 *
 * Détection:
 * - string commençant par < → html()
 * - string XML valide → xml()
 * - object/array → json()
 * - string → text()
 * - autre → json() (tentative)
 *
 * @example
 *   send("Hello")                    → text()
 *   send("<h1>Hello</h1>")           → html()
 *   send("<root>data</root>")        → xml()
 *   send({ user: { id: 1 } })        → json()
 *   send([1, 2, 3])                  → json()
 *   send(123)                        → json()
 */
export function send(
  body: unknown,
  status: number = 200,
  options: { headers?: Record<string, string> } = {}
): Response {
  // null/undefined → empty 204
  if (body === null || body === undefined) {
    return new Response(null, { status: 204, headers: { ...options.headers } });
  }

  // string → détection format
  if (typeof body === "string") {
    const trimmed = body.trimStart();
    if (trimmed.startsWith("<")) {
      // Probablement HTML ou XML
      // XML si commence par <?xml ou <root> (heuristique simple)
      if (trimmed.startsWith("<?xml") || trimmed.startsWith("<root") || trimmed.startsWith("<Root")) {
        return xml(body, 200, { headers: options.headers });
      }
      return html(body, 200, { headers: options.headers });
    }
    return text(body, status, { headers: options.headers });
  }

  // Object/Array → json
  if (typeof body === "object") {
    return json(body, status);
  }

  // number, boolean, bigint → json (via safeStringify)
  return json(body, status);
}
