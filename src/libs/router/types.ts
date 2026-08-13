/** Méthodes HTTP supportées par le routeur. */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/** Contexte passé à chaque handler. */
export interface RouteContext {
  /** Paramètres de chemin (:id, :slug…). */
  params: Record<string, string>;
  /** Paramètres de query string (décodés, sans doublon résolu). */
  query: URLSearchParams;
  /** Identifiant de requête généré par le middleware. */
  requestId: string;
  /** Méthode HTTP brute (ex. "GET"). */
  method: HttpMethod;
  /** Chemin d'origine (sans query string). */
  path: string;
  /**
   * Signal d'abort lié à la requête (timeout serveur, déconnexion client).
   * Les handlers peuvent l'écouter via `signal.addEventListener("abort", …)`
   * ou utiliser `throwIfAborted(signal)` pour vérifier le statut entre
   * les étapes d'un traitement long.
   */
  signal: AbortSignal;
  /**
   * État partagé entre les middlewares et le handler.
   * Les middlewares y stockent des données (ex. ctx.state.user = authUser).
   * Les handlers les lisent (ex. const user = ctx.state.user as AuthUser).
   */
  state: Record<string, unknown>;
}

export type RouteHandler = (req: Request, ctx: RouteContext) => Response | Promise<Response>;

/**
 * Middleware : exécuté avant le handler.
 * - Peut retourner une Response pour court-circuiter (401, 403…).
 * - Peut modifier ctx.state (ex. ajouter l'utilisateur authentifié).
 * - Appelle next() pour passer au middleware/handler suivant.
 */
export type Middleware = (
  req: Request,
  ctx: RouteContext,
  next: () => Promise<Response>,
) => Response | Promise<Response>;

export interface RouterOptions {
  /** Longueur maximale acceptée pour le path (octets). */
  maxPathLength?: number;
  /** Vrai pour logger en debug les routes enregistrées. */
  debug?: boolean;
  logger?: Logger;
  /** Middlewares exécutés AVANT chaque handler (ordre d'inscription). */
  middleware?: Middleware[];
}

export interface RegisteredRoute {
  method: HttpMethod;
  /** Segments du chemin découpé. ':' préfixe = paramètre. */
  segments: string[];
  /** Positions des segments paramétrés. */
  paramIndexes: number[];
  handler: RouteHandler;
  /** Middlewares spécifiques à cette route (après les globaux). */
  middleware: Middleware[];
  /** Nom de méthode+path pour messages d'erreur. */
  key: string;
}

/**
 * Argument route : soit un handler (2 params), soit un middleware (3 params).
 * Pattern Express : router.get(path, mw1, mw2, handler)
 * Le dernier argument doit être un handler ; les autres sont des middlewares.
 */
type RouteArg = RouteHandler | Middleware;

export interface Router {
  /** Enregistre une route. Erreur au démarrage si doublon exact. */
  route(method: HttpMethod, path: string, ...args: [...Middleware[], RouteHandler]): Router;
  get(path: string, ...args: [...Middleware[], RouteHandler]): Router;
  post(path: string, ...args: [...Middleware[], RouteHandler]): Router;
  put(path: string, ...args: [...Middleware[], RouteHandler]): Router;
  patch(path: string, ...args: [...Middleware[], RouteHandler]): Router;
  delete(path: string, ...args: [...Middleware[], RouteHandler]): Router;
  /** Ajoute un middleware global (exécuté sur TOUTES les routes). */
  use(middleware: Middleware): Router;
  /** Dispatch d'une requête. Renvoie 404/405 si pas de correspondance. */
  handle(req: Request): Promise<Response>;
  /** Nombre de routes enregistrées. */
  size(): number;
}
