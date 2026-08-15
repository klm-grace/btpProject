/**
 * Ouvre un client SQL PostgreSQL via le constructeur natif `new Bun.SQL(url)`.
 * La configuration (url) est INJECTÉE : aucune lecture de process.env.
 */
export function createDb(config: DbConfig): Db {
  const sql = new Bun.SQL(config.url) as unknown as SqlClientLike;

  async function ping(): Promise<boolean> {
    try {
      const rows = await sql`SELECT 1 AS ok`;
      return Array.isArray(rows) && rows.length === 1;
    } catch {
      return false;
    }
  }

  async function queryOne<T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...params: unknown[]
  ): Promise<T | null> {
    const rows = await sql<T>(strings, ...params);
    return rows.length > 0 ? (rows[0] as T) : null;
  }

  return {
    sql,
    unsafe: sql.unsafe.bind(sql),
    ping,
    queryOne,
    close: () => sql.close(),
  };
}
