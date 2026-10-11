export async function byReason(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, reason: string) {
  return db.query(`SELECT id FROM products WHERE reason = '${reason}'`)
}
