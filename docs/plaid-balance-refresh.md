# Plaid balances and transactions

This app reads bank data from Plaid. It does not move money. Access tokens stay in the database, sealed. They are not written to logs and they are not included in any API response.

There is no environment variable named `STB_READONLY_KEY`. Read-only routes use the same key as the other `/api/readonly/v1` routes: `Authorization: Bearer stb_ro_...`. The key is stored as a hash in `app_api_keys`.

## When balances refresh

Opening the app, while signed in, asks Plaid for live balances in the background. The page renders first. The dashboard shows "Checking bank balances…" and then "Bank balances updated …" in America/Chicago time.

A successful refresh inside the last 5 minutes is reused. A failed attempt inside that window is also reused, so a bank error does not turn into a burst of paid calls. Opening the app all day is at most one successful balance call per bank institution every 5 minutes.

The same 5-minute window is shared by:

- the page-open refresh
- `POST /api/readonly/v1/plaid/refresh-balances`
- Bank Feed "Check again"

## Read-only balance route

`POST /api/readonly/v1/plaid/refresh-balances`

Auth: `Authorization: Bearer stb_ro_...`

It calls Plaid `/accounts/balance/get` for one login per institution, stores the numbers, and returns:

- `cached` — true when the 5-minute window skipped a new Plaid call
- `refreshed_at` — when the last successful refresh finished
- `accounts` — `name`, `mask`, `type`, `current`, `available`, `iso_currency`

Inside the window it returns the saved balances with `cached: true`.

## Read-only transactions route

`GET /api/readonly/v1/plaid/transactions`

Auth: the same `stb_ro_` bearer key.

Query:

| Param | Meaning |
| --- | --- |
| `mask` | Last 4 of the account, optional |
| `account_id` | Exact Plaid account id. When set, that account is returned even if a newer login of the same mask exists |
| `from`, `to` | `YYYY-MM-DD`, optional, inclusive |
| `limit` | Page size. Default 500. Maximum 2000 |
| `cursor` | Opaque cursor from `next_cursor`. Preferred for paging |
| `offset` | Used only when `cursor` is omitted |

Response: `transactions`, `limit`, `offset` (0 when a cursor was used), `has_more`, `next_cursor`, and `sync_warnings` when a bank could not be synced. Each row has `date`, `authorized_date`, `amount`, `name`, `merchant_name`, `payee`, `check_number`, `mask`, `account_id`, `pending`, `pending_transaction_id`, `payment_channel`, `personal_finance_category`, `counterparties`, `transfer`, and `is_internal_transfer`.

Plaid's amount sign is kept: positive is money out, negative is money in.

`is_internal_transfer` is a hint computed in SQL, not stored. It is true when another non-removed row on a different mask of our own accounts has the opposite amount and a date within 3 days either way.

### How rows are stored

The source is Plaid `/transactions/sync`. Each Plaid item keeps its own cursor. Added and modified rows are upserted on Plaid `transaction_id`. Removed rows are marked removed and left in the table. A login with no cursor is walked until Plaid has no more history, which is the backfill. The cursor is saved only after the last page, so a crash replays instead of leaving a gap.

A read, and the scheduled job, pull new transactions at most once every 5 minutes. If that pull fails, the route still returns the rows already stored and lists the problem in `sync_warnings`.

Duplicate logins of the same bank are collapsed on this read: one row per institution, mask, and type, preferring a linked account and then the newer login. Pass `account_id` to see one specific account.

## Scheduled job

`POST /api/cron/plaid-refresh`

Auth: header `x-cron-secret` must match the `CRON_SECRET` environment variable. If `CRON_SECRET` is unset the route returns 503. A missing or wrong header returns 401. Set `CRON_SECRET` on both the web service and the cron service. Do not put the secret in the repo.

The job:

1. Reads balances with `/accounts/balance/get` (same 5-minute window).
2. Calls `/item/get`. If Transactions is enabled, it calls `/transactions/refresh` (its own 5-minute window). `PRODUCT_NOT_READY` is reported as `not_ready` and does not fail the job.
3. Stores new transactions with `/transactions/sync` (its own 5-minute window).

The response has `accounts`, `transactions`, and `transaction_sync`. It does not contain access tokens.

Render cron uses UTC and one expression per service. It cannot switch for daylight saving on its own.

While Chicago is on CDT (UTC−5), through Sunday 1 November 2026:

```text
25 9,20 * * 1-6
```

That is 4:25 AM and 3:25 PM America/Chicago, Monday through Saturday.

While Chicago is on CST (UTC−6), from 1 November 2026 until Sunday 14 March 2027, change it to:

```text
25 10,21 * * 1-6
```

An example service is in `docs/render-plaid-cron.example.yaml`. This app does not create the cron job. The live URL is `https://bonalti-cashflow-intelligence.onrender.com/api/cron/plaid-refresh`.

A first backfill of a login that has no cursor can take longer than the request limit. The cursor is saved at the end of that login, so the next run continues from the start of the unfinished login. Logins that already have a cursor only download what is new.

## What Plaid charges

Plaid does not publish one dollar amount for these calls. The contract on the Plaid dashboard is the price.

- Each successful `/accounts/balance/get` is one per-request flat fee. Failed calls are not billed.
- Each successful `/transactions/refresh` is a separate per-request flat fee. It is not included in the Transactions subscription.
- `/item/get` and `/transactions/sync` are not those per-request fees. Sync is included with the Transactions product.

Page-open and the read-only balance route share one 5-minute window, so a busy day is at most one successful balance fee per institution every 5 minutes. The schedule is twice a day, Monday through Saturday: one balance fee and, when Transactions is enabled, one transactions-refresh fee per institution, plus the included sync.

Only one login per institution is billed. Older logins of the same bank are skipped.

## Duplicate accounts

The same mask, including 7523, was showing more than once because there are six Plaid logins for Lone Star National Bank, not because one sync inserted the same row twice. `plaid_accounts.plaid_account_id` is already the primary key. Five of those logins were connected on 13 October 2026. The oldest, from 19 June 2026, still has ten masks the later logins do not have: 1625, 2144, 2151, 2169, 2557, 2573, 3381, 3621, 3647, and 8650.

Reads collapse accounts by Plaid account id, then by institution + mask + type. Live balances are copied onto the older rows that share that institution, mask, and type, so a project linked to an older copy does not stay stale. No accounts were deleted.

A unique index stops one login from storing two rows for the same mask and type. A unique key across logins was not added, because that would require deleting the June accounts and their transactions.

The SQL below is optional and is not run by the app. It deletes older logins when a newer login exists for the same institution. Account and transaction rows for those logins are removed by the foreign key. The ten masks that exist only on the June login would be deleted.

```sql
-- OPTIONAL. Not run by the app.
begin;
delete from plaid_items older
using plaid_items newer
where older.institution_id = newer.institution_id
  and older.institution_id is not null
  and older.connected_at < newer.connected_at;
commit;
```

## Memory

The web service is a Render Starter instance (512 MB). This follows the same limits as the memory work already on main:

- One shared database pool, max 5 connections.
- Table setup runs once when the process starts, not on each request.
- `/transactions/sync` writes each page and then drops it. It does not keep the whole history in Node.
- The transactions route streams one SQL page. It does not select the raw Plaid JSON into Node. Historical fields that are not columns yet are extracted in SQL.
