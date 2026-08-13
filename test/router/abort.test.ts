import { describe, expect, it } from "bun:test";
import { createRouter } from "@libs/router";
import { throwIfAborted, abortPromise } from "@libs/router/abort";
import { jsonOk } from "@libs/http";

function buildReq(method: string, url: string, signal?: AbortSignal): Request {
  return new Request(url, { method, signal });
}

describe("router abort/timeout", () => {
  it("ctx.signal est abortable", async () => {
    const controller = new AbortController();
    const router = createRouter();
    let signalReceived: AbortSignal | null = null;

    router.get("/api/test", (_req, ctx) => {
      signalReceived = ctx.signal;
      return jsonOk({ ok: true });
    });

    const req = buildReq("GET", "http://localhost/api/test", controller.signal);
    await router.handle(req);
    expect(signalReceived).not.toBeNull();
    expect(signalReceived!.aborted).toBe(false);

    controller.abort();
    expect(signalReceived!.aborted).toBe(true);
  });

  it("throwIfAborted ne lance rien si non aborté", () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
  });

  it("throwIfAborted lance AbortError si aborté", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(/abort/i);
  });

  it("abortPromise rejette immédiatement si déjà aborté", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(abortPromise(controller.signal)).rejects.toThrow(/abort/i);
  });

  it("abortPromise rejette quand abort() est appelé", async () => {
    const controller = new AbortController();
    const promise = abortPromise(controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow(/abort/i);
  });

  it("handler interrompu via throwIfAborted dans une boucle", async () => {
    const router = createRouter();
    const controller = new AbortController();

    router.get("/api/loop", async (_req, ctx) => {
      let count = 0;
      for (let i = 0; i < 1000; i++) {
        throwIfAborted(ctx.signal);
        count++;
        if (i === 5) controller.abort(); // abort au 6ème itération
      }
      return jsonOk({ count });
    });

    const req = buildReq("GET", "http://localhost/api/loop", controller.signal);
    // Le routeur propage l'AbortError — c'est au middleware global de le gérer
    try {
      await router.handle(req);
      // Si on arrive ici, le handler n'a pas été interrompu (impossible)
      expect(true).toBe(false);
    } catch (err) {
      // L'AbortError est bien propagé par le routeur
      expect((err as Error).name).toBe("AbortError");
    }
  });

  it("timeout abort Propage le signal aux handlers", async () => {
    const router = createRouter();
    let signalAborted = false;

    router.get("/api/slow", async (_req, ctx) => {
      // Simule un travail long qui vérifie le signal
      await new Promise((resolve) => {
        const check = () => {
          if (ctx.signal.aborted) {
            signalAborted = true;
            resolve(undefined);
            return;
          }
          setTimeout(check, 5);
        };
        check();
      });
      return jsonOk({ done: true });
    });

    // Simule un abort rapide (comme un timeout)
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);

    const req = buildReq("GET", "http://localhost/api/slow", controller.signal);
    await router.handle(req);
    expect(signalAborted).toBe(true);
  });
});
