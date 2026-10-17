// The only DB surface the rest of the code sees: one method, so tests fake it in a few lines.
export interface DbClient {
  query(sql: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}
