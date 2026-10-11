const ACTIVE_SQL = 'sold_at IS NULL'

export async function active(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, reason: string) {
  return db.query(`SELECT id FROM listings WHERE ${ACTIVE_SQL} AND reason = $1`, [reason])
}
