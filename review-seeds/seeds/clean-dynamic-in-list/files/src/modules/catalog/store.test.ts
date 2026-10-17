import { findProductId, findProductIds } from './store'

describe('findProductId', () => {
  it('findProductId looks the product up by normalized name as a bound parameter', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 7 }] }) }
    expect(await findProductId(db, 'iphone 12')).toBe(7)
    expect(db.query).toHaveBeenCalledWith('SELECT id FROM products WHERE normalized_name = $1', ['iphone 12'])
  })
})

describe('findProductIds', () => {
  it('findProductIds binds each name to its own placeholder and keys the ids by name', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 7, normalized_name: 'iphone 12' }, { id: 9, normalized_name: 'pixel 8' }] }) }
    const ids = await findProductIds(db, ['iphone 12', 'pixel 8', 'unknown'])
    expect(ids).toEqual(new Map([['iphone 12', 7], ['pixel 8', 9]]))
    expect(db.query).toHaveBeenCalledWith(
      'SELECT id, normalized_name FROM products WHERE normalized_name IN ($1, $2, $3)',
      ['iphone 12', 'pixel 8', 'unknown'],
    )
  })

  it('findProductIds answers an empty map without querying when given no names', async () => {
    const db = { query: vi.fn() }
    expect(await findProductIds(db, [])).toEqual(new Map())
    expect(db.query).not.toHaveBeenCalled()
  })
})
