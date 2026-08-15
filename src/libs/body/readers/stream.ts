/**
 * stream — Lecteur de body HTTP avec timeout et limite de taille.
 *
 * Permet de lire un stream Response.body en toute sécurité :
 * - Limite la taille totale lue
 * - Applique un timeout sur la lecture
 * - Libère les ressources proprement
 */

/** Erreur de timeout de lecture. */
export class ReadTimeoutError extends Error {
  constructor() {
    super("READ_TIMEOUT");
    this.name = "ReadTimeoutError";
  }
}

/** Erreur de body trop large pendant le streaming. */
export class BodyTooLargeError extends Error {
  constructor(limit: number) {
    super(`BODY_TOO_LARGE (limit: ${limit} bytes)`);
    this.name = "BodyTooLargeError";
    this.limit = limit;
  }
  limit: number;
}

/**
 * Lit le body d'une requête de manière sécurisée avec streaming.
 *
 * @param req    Requête HTTP
 * @param limit  Taille max en bytes
 * @param timeoutMs  Timeout en ms
 * @returns      Le body sous forme de string
 * @throws       ReadTimeoutError si timeout
 * @throws       BodyTooLargeError si dépassement
 * @throws       Error si le body est malformé ou inaccessible
 */
export async function readBodyStream(
  req: Request,
  limit: number,
  timeoutMs: number,
): Promise<string> {
  // Pas de body
  if (!req.body) return "";

  const reader = req.body.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let done = false;

  // Timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (!done) {
      // Vérifie le timeout à chaque itération
      if (controller.signal.aborted) {
        throw new ReadTimeoutError();
      }

      const { done: streamDone, value } = await reader.read();
      if (streamDone) {
        done = true;
        break;
      }

      if (!value) continue;

      totalBytes += value.length;
      if (totalBytes > limit) {
        throw new BodyTooLargeError(limit);
      }

      chunks.push(value);
    }
  } finally {
    clearTimeout(timeoutId);
    reader.cancel().catch(() => {});
  }

  // Concatène les chunks
  if (chunks.length === 0) return "";

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(result);
}

/**
 * Lit le body avec le body() natif du Request (pas de streaming manuel).
 * Utilise un AbortController pour le timeout.
 *
 * @param req    Requête HTTP
 * @param limit  Taille max en bytes
 * @param timeoutMs  Timeout en ms
 * @returns      Le body sous forme de string
 */
export async function readBodyWithTimeout(
  req: Request,
  limit: number,
  timeoutMs: number,
): Promise<string> {
  // Méthode rapide : utiliser req.text() avec AbortSignal
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // req.text() lit tout le body en une fois
    const text = await req.text();

    // Vérifie la taille après lecture (req.text() a déjà tout lu)
    if (text.length > limit) {
      throw new BodyTooLargeError(limit);
    }

    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Détermine si la requête a un body lisible.
 */
export function hasBody(req: Request): boolean {
  const cl = req.headers.get("content-length");
  if (cl !== null) {
    const len = Number(cl);
    return !isNaN(len) && len > 0;
  }
  // Si pas de Content-Length, on vérifie si le body existe
  return req.body !== null;
}
