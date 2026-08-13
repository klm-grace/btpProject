import type { HttpMethod, Middleware, RegisteredRoute, RouteContext, RouteHandler, Router, RouterOptions } from "./types.ts";

const SUPPORTED_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function normalizeMethod(method: string): HttpMethod | null {
  const upper = method.toUpperCase() as HttpMethod;
  return SUPPORTED_METHODS.includes(upper) ? upper : null;
}

function jsonError(
  status: number,
  code: string,
  message: string,
  requestId?: string,
  extraHeaders?: Record<string, string>,
): Response {
  const body = requestId
    ? { success: false, error: { code, message, requestId } }
    : { success: false, error: { code, message } };
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(extraHeaders ?? {}) };
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Découpe un path en segments propres.
 * - Rejette path vide non racine, double slash, segments '.', '..' (traversal).
 * - Décodage URL par segment (rejet si encodage malformé).
 * - Limite de longueur appliquée par l'appelant.
 */
function splitPath(rawPath: string, maxLength: number): string[] | null {
  if (rawPath.length === 0) return null;
  if (rawPath.length > maxLength) return null;
  if (rawPath[0] !== "/") return null;

  const parts = rawPath.slice(1).split("/");
  // Gestion racine : '/' → []
  if (parts.length === 1 && parts[0] === "") return [];

  const segments: string[] = [];
  for (const part of parts) {
    if (part === "") return null; // double slash → 400
    if (part === "." || part === "..") return null; // traversal → 400
    let decoded: string;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      return null; // encodage malformé → 400
    }
    if (decoded === "." || decoded === "..") return null;
    segments.push(decoded);
  }
  return segments;
}

function matchRoute(route: RegisteredRoute, segments: string[]): Record<string, string> | null {
  if (route.segments.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i++) {
    const routeSegment = route.segments[i]!;
    if (routeSegment.startsWith(":")) {
      params[routeSegment.slice(1)] = segments[i]!;
    } else if (routeSegment !== segments[i]) {
      return null;
    }
  }
  return params;
}

/** Routes plus spécifiques (moins de paramètres) d'abord. */
function sortRoutes(routes: RegisteredRoute[]): RegisteredRoute[] {
  return [...routes].sort((a, b) => a.paramIndexes.length - b.paramIndexes.length);
}

export function createRouter(options: RouterOptions = {}): Router {
  const maxPathLength = options.maxPathLength ?? 1024;
  const routesByMethod = new Map<HttpMethod, RegisteredRoute[]>();
  for (const m of SUPPORTED_METHODS) routesByMethod.set(m, []);
  const globalMiddleware: Middleware[] = options.middleware ?? [];

  function normalizePath(path: string): string[] | null {
    if (path !== "/" && path.endsWith("/")) {
      // On accepte un slash final en normalisant (pas de route dupliquée).
      return splitPath(path.replace(/\/+$/, "") || "/", maxPathLength);
    }
    return splitPath(path, maxPathLength);
  }

  function parseRouteArgs(args: (RouteHandler | Middleware)[]): { handler: RouteHandler; middleware: Middleware[] } {
    if (args.length === 0) {
      throw new Error("Router: au moins un handler est requis");
    }
    const last = args[args.length - 1]!;
    // Handler = fonction avec 2 paramètres max (req, ctx)
    if (typeof last !== "function" || last.length > 2) {
      throw new Error("Router: le dernier argument doit être un handler (req, ctx) => Response");
    }
    const handler = last as RouteHandler;
    const middleware = args.slice(0, -1).map((arg, i) => {
      if (typeof arg !== "function" || arg.length !== 3) {
        throw new Error(`Router: l'argument ${i + 1} n'est pas un middleware valide (3 params requis)`);
      }
      return arg as Middleware;
    });
    return { handler, middleware };
  }

  function register(method: HttpMethod, path: string, ...args: (RouteHandler | Middleware)[]): void {
    const { handler, middleware } = parseRouteArgs(args);
    const segments = normalizePath(path);
    if (segments === null) {
      throw new Error(`Router: chemin invalide "${path}"`);
    }
    const route: RegisteredRoute = {
      method,
      segments,
      paramIndexes: segments
        .map((s, i) => (s.startsWith(":") ? i : -1))
        .filter((i) => i >= 0),
      handler,
      middleware,
      key: `${method} ${path}`,
    };

    const list = routesByMethod.get(method)!;
    if (list.some((r) => r.key === route.key)) {
      throw new Error(`Router: route dupliquée "${route.key}"`);
    }
    list.push(route);
    options.logger?.debug("router: route registered", { route: route.key });
  }

  function buildMethodNotAllowed(path: string, requestId?: string): Response {
    // Collecte les méthodes supportant ce path.
    const segments = splitPath(path, maxPathLength) ?? [];
    if (segments === null) return jsonError(400, "bad_request", "Invalid path", requestId);
    const allowed: HttpMethod[] = [];
    for (const m of SUPPORTED_METHODS) {
      const anyMatch = routesByMethod.get(m)!.some((r) => matchRoute(r, segments) !== null);
      if (anyMatch) allowed.push(m);
    }
    if (allowed.length === 0) return jsonError(404, "not_found", "Route not found", requestId);
    return jsonError(
      405,
      "method_not_allowed",
      `Method not allowed. Allowed: ${allowed.join(", ")}`,
      requestId,
      { Allow: [...new Set(allowed)].join(", ") },
    );
  }

  async function handle(req: Request): Promise<Response> {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    const url = new URL(req.url);
    const path = url.pathname;
    const method = normalizeMethod(req.method);

    if (method === null) {
      return jsonError(405, "method_not_allowed", "Method not supported", requestId);
    }

    if (path.length > maxPathLength) {
      return jsonError(414, "uri_too_long", "Request path too long", requestId);
    }

    const segments = splitPath(path, maxPathLength);
    if (segments === null) {
      return jsonError(400, "bad_request", "Malformed request path", requestId);
    }

    // OPTIONS : renvoyer Allow si la route existe (même si aucune méthode OPTIONS enregistrée).
    if (method === "OPTIONS") {
      return buildMethodNotAllowed(path, requestId);
    }

    const routes = sortRoutes(routesByMethod.get(method)!);

    for (const route of routes) {
      const params = matchRoute(route, segments);
      if (params !== null) {
        const ctx: RouteContext = {
          params,
          query: url.searchParams,
          requestId,
          method,
          path,
          signal: req.signal,
          state: {},
        };
        try {
          // Exécuter les middlewares (globaux puis route) en séquence, puis le handler.
          // Chaque middleware peut court-circuiter (Response) ou appeler next().
          const allMiddleware = [...globalMiddleware, ...route.middleware];
          let index = 0;
          const runPipeline = async (): Promise<Response> => {
            if (index < allMiddleware.length) {
              const mw = allMiddleware[index]!;
              index++;
              return mw(req, ctx, runPipeline);
            }
            return route.handler(req, ctx);
          };
          return await runPipeline();
        } catch (err) {
          // Si le handler a été interrompu par un abort, on remonte tel quel.
          throw err;
        }
      }
    }

    // Aucune route pour cette méthode → 405 si le path existe pour d'autres méthodes.
    return buildMethodNotAllowed(path, requestId);
  }

  const router: Router = {
    route: (method, path, ...args) => {
      register(method, path, ...args);
      return router;
    },
    get: (path, ...args) => {
      register("GET", path, ...args);
      return router;
    },
    post: (path, ...args) => {
      register("POST", path, ...args);
      return router;
    },
    put: (path, ...args) => {
      register("PUT", path, ...args);
      return router;
    },
    patch: (path, ...args) => {
      register("PATCH", path, ...args);
      return router;
    },
    delete: (path, ...args) => {
      register("DELETE", path, ...args);
      return router;
    },
    use: (middleware) => {
      globalMiddleware.push(middleware);
      return router;
    },
    handle,
    size: () => SUPPORTED_METHODS.reduce((acc, m) => acc + routesByMethod.get(m)!.length, 0),
  };
  return router;
}
