# Wallet & Payments API

A NestJS wallet/payments API: register and log in, fund your wallet through Paystack, withdraw to a
bank account, or transfer to another user on the platform — built to survive a webhook firing twice
and two requests hitting the same balance at once.

**Deadline timezone note:** all dates in the brief are treated as **WAT (West Africa Time, UTC+1)**.

- **Repo:** (this repository)
- **Deployed API:** `<fill in after deploying — see Deployment>`
- **Swagger docs:** `<deployed-url>/docs` (OpenAPI JSON at `<deployed-url>/docs-json`, importable straight into Postman via *File → Import → Link*)
- **Health check:** `<deployed-url>/health`

## Stack

- **NestJS** (TypeScript) — one module per domain: `auth`, `users`, `wallets`, `deposits`, `withdrawals`,
  `transfers`, `webhooks`, `payments/paystack`, `queue`.
- **PostgreSQL** via TypeORM — all financial data, migrations checked in (no `synchronize: true`).
- **Redis + BullMQ** — background jobs (webhook processing, withdrawal payouts, deposit reconciliation).
- **Paystack** — the one fiat provider, chosen from the brief's list.
- **JWT** (passport-jwt) for auth, **bcrypt** for password hashing.
- **Swagger** (`@nestjs/swagger`) for interactive API docs.

## Data model

| Table | Purpose |
|---|---|
| `users` | email, username, bcrypt password hash |
| `wallets` | one per user, `balance` in kobo (bigint), `CHECK (balance >= 0)` |
| `ledger_entries` | **append-only** log of every money movement (`DEPOSIT`, `WITHDRAWAL`, `WITHDRAWAL_REVERSAL`, `TRANSFER_IN`, `TRANSFER_OUT`); unique `reference` |
| `deposit_requests` | one row per deposit attempt, `PENDING → SUCCESS/FAILED/EXPIRED`, unique `reference` |
| `withdrawal_requests` | one row per withdrawal, `PENDING → PROCESSING → SUCCESS/FAILED`, unique `reference` |
| `transfer_requests` | one row per wallet-to-wallet transfer, `PROCESSING → SUCCESS/FAILED` |
| `webhook_events` | dedupe log for inbound Paystack webhooks, unique `dedupe_key` |

## Decisions (ledger/balance modeling)

- `wallet.balance` is a cached integer (kobo, `bigint`) that is **only ever mutated in the same DB
  transaction that inserts an append-only `ledger_entries` row** for the movement — the two writes are
  atomic, so balance always reconciles with the sum of its entries.
- Every balance change takes a `SELECT … FOR UPDATE` pessimistic lock on the wallet row before
  checking/mutating balance. This is what makes two concurrent requests against a balance that only
  covers one resolve correctly: the second blocks until the first commits, re-reads the now-lower
  balance, and fails with `422` instead of racing it.
- Transfers lock both wallets in a **fixed global order (ascending id)**, regardless of debit/credit
  direction, so two transfers moving money in opposite directions between the same pair of wallets can
  never deadlock on each other's locks.
- Idempotency is enforced at the **database** layer, not just in application code: `webhook_events` has
  a unique dedupe key (`provider:providerTransactionId:event`), `ledger_entries.reference` is unique, and
  deposit/withdrawal rows are re-locked and re-checked for `PENDING`/`PROCESSING` status before any money
  moves — so a retried webhook, a re-run queue job, or a client retry all fail closed instead of
  double-crediting.
- Withdrawals reserve funds **synchronously** (debit + `withdrawal_requests` row, one transaction) before
  the slow external Paystack call happens in a background job. If the payout call fails permanently after
  retries, a compensating `WITHDRAWAL_REVERSAL` ledger entry credits the wallet back — money is never
  silently lost mid-flight.
- A deposit that's never confirmed is never guessed at: the wallet is only credited by a
  signature-verified webhook (or an explicit re-verification against Paystack's own
  `/transaction/verify` endpoint). A reconciliation job sweeps deposits past their expiry, double-checks
  with Paystack once, and marks them `EXPIRED` if still unconfirmed — it never assumes success.

## How the three graded scenarios are handled

1. **Same webhook fired twice** — `POST /webhooks/paystack` inserts a row into `webhook_events` keyed on
   `(provider, providerTransactionId, event)` *before* doing anything else. The second delivery hits the
   unique constraint, is logged as a duplicate, and returns `200` without ever reaching the queue. The
   processor also re-checks the deposit/withdrawal's own status under a row lock before crediting, as a
   second layer.
2. **Two concurrent transfer/withdrawal requests against a balance that covers one** — both requests hit
   the same locked-transaction path described above; exactly one commits, the other gets a clean `422
   Insufficient wallet balance`. Verified in `test/wallet-integrity.e2e-spec.ts` and manually against the
   live Paystack sandbox (see Testing).
3. **A deposit that never gets confirmed** — the wallet is never touched. A repeatable BullMQ job
   (`deposit-reconciliation`, every 5 min) finds deposits past their `expiresAt`, asks Paystack directly in
   case the webhook was lost, and marks them `EXPIRED` otherwise.

## Background jobs (BullMQ + Redis)

| Queue | Trigger | Does |
|---|---|---|
| `webhook-processing` | every inbound webhook | parses `charge.success` / `transfer.success` / `transfer.failed` / `transfer.reversed` and applies the ledger effect, with retry + exponential backoff |
| `withdrawal-processing` | every withdrawal request | calls Paystack's recipient + transfer API; on final failure, reverses the reserved debit |
| `deposit-reconciliation` | repeatable, every 5 min | sweeps expired pending deposits (see above) |

## Running locally

Requires Docker (for Postgres/Redis) and Node 22+.

```bash
git clone <repo-url> && cd wallet-and-payments-api
cp .env.example .env        # fill in your own Paystack test keys
docker compose up -d        # Postgres on localhost:5433, Redis on localhost:6380
npm install
npm run migration:run       # or just start the app — migrationsRun: true applies them on boot too
npm run start:dev
```

Visit `http://localhost:3000/docs` for Swagger. `docker-compose.yml` maps Postgres/Redis to **5433/6380**
on the host (not 5432/6379) to avoid clashing with any Postgres/Redis you already have running locally —
adjust `DATABASE_URL`/`REDIS_URL` in `.env` if you change that.

### Environment variables

See `.env.example` for the full list with defaults. The ones you must supply yourself:

- `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` — from your Paystack dashboard, test mode.
- `JWT_SECRET` — any long random string.
- `DATABASE_URL` / `REDIS_URL` — connection strings (docker-compose values work out of the box locally).

### Registering the webhook with Paystack

In the Paystack dashboard (Settings → API Keys & Webhooks), set the webhook URL to
`<your-base-url>/webhooks/paystack`. Locally, use a tunnel (ngrok, etc.) if you want Paystack's real
servers to reach you; otherwise you can simulate deliveries directly (see Testing).

## Testing

```bash
npm run test:e2e
```

`test/wallet-integrity.e2e-spec.ts` boots the full Nest app against a real Postgres+Redis (stubbing only
the outbound Paystack HTTP calls, since those depend on Paystack's own sandbox availability) and asserts
all three graded scenarios directly:

- a webhook delivered twice credits the wallet exactly once,
- two concurrent transfers against a balance that covers one leave exactly one successful and the
  balances reconciled,
- an expired, never-confirmed deposit is marked `EXPIRED` without ever touching the wallet.

These were also exercised manually end-to-end against the **live Paystack test sandbox** (real
`/transaction/initialize`, a hand-signed `charge.success` webhook replayed twice, real concurrent HTTP
requests, and a real withdrawal through `/transfer`) before submission.

## Assumptions

- Single currency: **NGN**, all amounts are integers in **kobo** (minor units) everywhere in the API, to
  avoid floating-point money.
- Paystack was the provider chosen from the brief's list (Flutterwave/Paystack/Fincra).
- Withdrawals validate the destination account via Paystack's account-resolution endpoint before creating
  a transfer recipient, mirroring what a real product would show the user for confirmation.
- Deposits expire (and stop being payable) after 30 minutes by default (`DEPOSIT_EXPIRY_MINUTES`).
- Auth is deliberately minimal per the brief: email + username + password + JWT access token, no
  refresh-token rotation, OTP, or 2FA — out of scope.
- A basic global rate limiter (60 req/min/IP by default) is applied as a baseline abuse guard, not a
  full production rate-limiting strategy.
- Crypto, frontend, multi-currency, KYC, and an admin dashboard are all out of scope per the brief and
  were not built.
- **Paystack account tier note:** the Paystack test/starter account used for this submission cannot
  actually complete third-party payouts (`transfer_unavailable` from Paystack's own API — an account
  upgrade requirement on their side, not a bug here). This was used as a real test of the
  retry-then-reverse path: after 5 retries with exponential backoff, the withdrawal is marked `FAILED`
  and the reserved funds are credited back automatically. The balance-locking behavior graded in scenario
  2 above happens synchronously before this external call, so it is unaffected by this limitation.

## Deployment

Built as a small multi-stage Docker image (see `Dockerfile`). `render.yaml` describes a Render Blueprint
(web service + managed Postgres + managed Redis) — from the Render dashboard, *New → Blueprint*, point it
at this repo, and set the `sync: false` secrets (`APP_BASE_URL`, `PAYSTACK_SECRET_KEY`,
`PAYSTACK_PUBLIC_KEY`) once the services exist. Migrations run automatically on boot
(`migrationsRun: true`), so no separate migration step is needed after each deploy.
