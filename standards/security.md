# Security: examples

Rules live in `CODING_STANDARDS.md` → Security.

## No secrets in the repo

Don't:
```ts
const client = createPaymentClient('sk_live_51H...')
```

Do: read at the entry point, commit only the shape.
```ts
const client = createPaymentClient(env.PAYMENTS_KEY)
```
```
# .env.example (committed; .env* is gitignored)
PAYMENTS_KEY=
DATABASE_URL=
```

## Never log secrets or personal data

Don't:
```ts
logger.info(`charging ${JSON.stringify(req.body)}`) // card token, email, address
```

Do: log ids and outcomes; redact at the logger as a backstop.
```ts
logger.info(`order ${order.id}: charged`)
```

## Parameterized queries and argument arrays

Don't:
```ts
db.query(`SELECT * FROM orders WHERE email = '${email}'`)
exec(`convert ${filename} out.png`)
```

Do:
```ts
db.query('SELECT * FROM orders WHERE email = $1', [email])
execFile('convert', [filename, 'out.png'])
```

## Least privilege

- CI reads another repo with a read-only token, or none when the repo is public.
- A reporting job connects as a read-only DB role, not the app's owner role.
