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
}

export type RouteHandler = (req: Request, ctx: RouteContext) => Response | Promise<Response>;

export interface RouterOptions {
  /** Longueur maximale acceptée pour le path (octets). */
  maxPathLength?: number;
  /** Vrai pour logger en debug les routes enregistrées. */
  debug?: boolean;
  logger?: Logger;
}

export interface RegisteredRoute {
  method: HttpMethod;
  /** Segments du chemin découpé. ':' préfixe = paramètre. */
  segments: string[];
  /** Positions des segments paramétrés. */
  paramIndexes: number[];
  handler: RouteHandler;
  /** Nom de méthode+path pour messages d'erreur. */
  key: string;
}

export interface Router {
  /** Enregistre une route. Erreur au démarrage si doublon exact. */
  route(method: HttpMethod, path: string, handler: RouteHandler): Router;
  get(path: string, handler: RouteHandler): Router;
  post(path: string, handler: RouteHandler): Router;
  put(path: string, handler: RouteHandler): Router;
  patch(path: string, handler: RouteHandler): Router;
  delete(path: string, handler: RouteHandler): Router;
  /** Dispatch d'une requête. Renvoie 404/405 si pas de correspondance. */
  handle(req: Request): Promise<Response>;
  /** Nombre de routes enregistrées. */
  size(): number;
}
