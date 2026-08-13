/**
 * Lance une AbortError si le signal a été déclenché.
 *
 * À utiliser dans les handlers/loops longs pour interrompre
 * un travail en arrière-plan quand le client a annulé ou que
 * le timeout serveur a expiré.
 *
 * @example
 * ```ts
 * router.get("/api/heavy", async (_req, ctx) => {
 *   for (let i = 0; i < 1_000_000; i++) {
 *     throwIfAborted(ctx.signal);
 *     // ... travail long
 *   }
 * });
 * ```
 */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Request aborted", "AbortError");
  }
}

/**
 * Promesse qui rejette dès que le signal est déclenché.
 * Utile pour `Promise.race` avec un travail long.
 */
export function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Request aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Request aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
