import { hasDatabaseUrl, sql } from "@/lib/db/raw";
import { syncPlaidTransactionsIfDue } from "@/lib/plaid/bank-store";
import {
  decodeTransactionCursor,
  encodeTransactionCursor,
  internalTransferWindowDays,
} from "@/lib/plaid/transaction-page";

export type PlaidTransactionRow = {
  date: string;
  authorized_date: string | null;
  amount: number;
  name: string;
  merchant_name: string | null;
  payee: string | null;
  check_number: string | null;
  mask: string | null;
  account_id: string;
  pending: boolean;
  pending_transaction_id: string | null;
  payment_channel: string | null;
  personal_finance_category: unknown;
  counterparties: unknown;
  transfer: {
    transaction_code: string | null;
    payment_meta: unknown;
  } | null;
  is_internal_transfer: boolean;
};

type FeedQuery = {
  accountId: string | null;
  mask: string | null;
  from: string | null;
  to: string | null;
  cursor: { date: string; id: string } | null;
  offset: number;
  limit: number;
};

type SqlTransactionRow = {
  txn_date: Date | string;
  authorized_date: Date | string | null;
  amount: string;
  name: string;
  merchant_name: string | null;
  payee: string | null;
  check_number: string | null;
  mask: string | null;
  account_id: string;
  pending: boolean;
  pending_transaction_id: string | null;
  payment_channel: string | null;
  personal_finance_category: unknown;
  counterparties: unknown;
  transaction_code: string | null;
  payment_meta: unknown;
  is_internal_transfer: boolean;
  plaid_transaction_id: string;
};

function isoDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function toRow(row: SqlTransactionRow): PlaidTransactionRow {
  const paymentMeta = row.payment_meta ?? null;
  const transactionCode = row.transaction_code;

  return {
    date: isoDate(row.txn_date) ?? "",
    authorized_date: isoDate(row.authorized_date),
    amount: Number(row.amount),
    name: row.name,
    merchant_name: row.merchant_name,
    payee: row.payee,
    check_number: row.check_number,
    mask: row.mask,
    account_id: row.account_id,
    pending: row.pending,
    pending_transaction_id: row.pending_transaction_id,
    payment_channel: row.payment_channel,
    personal_finance_category: row.personal_finance_category,
    counterparties: row.counterparties,
    transfer:
      transactionCode || paymentMeta
        ? { transaction_code: transactionCode, payment_meta: paymentMeta }
        : null,
    is_internal_transfer: row.is_internal_transfer,
  };
}

// One page only. postgres.js streams the rows; the LIMIT keeps the page in bounds.
async function streamPage(query: FeedQuery) {
  const statement = sql()<SqlTransactionRow[]>`
    with preferred as (
      select distinct on (
        coalesce(i.institution_id, i.institution_name, a.item_id),
        coalesce(a.mask, a.plaid_account_id),
        coalesce(a.account_type, '')
      )
        a.plaid_account_id
      from plaid_accounts a
      join plaid_items i on i.item_id = a.item_id
      order by
        coalesce(i.institution_id, i.institution_name, a.item_id),
        coalesce(a.mask, a.plaid_account_id),
        coalesce(a.account_type, ''),
        (a.qbo_bank_account_id is not null or a.house_name is not null) desc,
        i.connected_at desc,
        a.updated_at desc
    )
    select
      t.txn_date,
      coalesce(t.authorized_date, (t.raw->>'authorized_date')::date) as authorized_date,
      t.amount,
      t.name,
      coalesce(t.merchant_name, t.raw->>'merchant_name') as merchant_name,
      coalesce(t.payee, t.raw #>> '{payment_meta,payee}') as payee,
      coalesce(t.check_number, t.raw->>'check_number') as check_number,
      a.mask,
      t.plaid_account_id as account_id,
      t.pending,
      coalesce(t.pending_transaction_id, t.raw->>'pending_transaction_id') as pending_transaction_id,
      coalesce(t.payment_channel, t.raw->>'payment_channel') as payment_channel,
      coalesce(t.personal_finance_category, t.raw->'personal_finance_category') as personal_finance_category,
      coalesce(t.counterparties, t.raw->'counterparties') as counterparties,
      coalesce(t.transaction_code, t.raw->>'transaction_code') as transaction_code,
      coalesce(t.payment_meta, t.raw->'payment_meta') as payment_meta,
      t.plaid_transaction_id,
      exists (
        select 1
        from plaid_transactions other
        join plaid_accounts other_account
          on other_account.plaid_account_id = other.plaid_account_id
        where other.removed_at is null
          and other.plaid_transaction_id <> t.plaid_transaction_id
          and t.amount <> 0
          and other.amount = -t.amount
          and other_account.mask is not null
          and a.mask is not null
          and other_account.mask <> a.mask
          and other.txn_date between t.txn_date - ${internalTransferWindowDays}::integer
            and t.txn_date + ${internalTransferWindowDays}::integer
      ) as is_internal_transfer
    from plaid_transactions t
    join plaid_accounts a on a.plaid_account_id = t.plaid_account_id
    where t.removed_at is null
      and (
        ${query.accountId}::text is not null
        or t.plaid_account_id in (select plaid_account_id from preferred)
      )
      and (${query.accountId}::text is null or t.plaid_account_id = ${query.accountId})
      and (${query.mask}::text is null or a.mask = ${query.mask})
      and (${query.from}::date is null or t.txn_date >= ${query.from})
      and (${query.to}::date is null or t.txn_date <= ${query.to})
      and (
        ${query.cursor?.date ?? null}::date is null
        or (t.txn_date, t.plaid_transaction_id) < (${query.cursor?.date ?? null}::date, ${query.cursor?.id ?? null})
      )
    order by t.txn_date desc, t.plaid_transaction_id desc
    limit ${query.limit + 1}
    offset ${query.cursor ? 0 : query.offset}
  `;
  const rows: SqlTransactionRow[] = [];

  for await (const batch of statement.cursor(250)) {
    rows.push(...batch);
  }

  return rows;
}

export async function listPlaidTransactions(query: FeedQuery) {
  if (!hasDatabaseUrl()) {
    return {
      transactions: [] as PlaidTransactionRow[],
      hasMore: false,
      nextCursor: null as string | null,
      syncWarnings: [] as string[],
    };
  }

  const sync = await syncPlaidTransactionsIfDue().catch((error: unknown) => {
    console.error("Plaid transaction sync before read failed", {
      message: error instanceof Error ? error.message : "unknown",
    });

    return { synced: false as const, failures: [] };
  });
  const stored = await streamPage(query);
  const page = stored.slice(0, query.limit);
  const last = page.at(-1);

  return {
    transactions: page.map(toRow),
    hasMore: stored.length > query.limit,
    nextCursor: stored.length > query.limit && last
      ? encodeTransactionCursor(isoDate(last.txn_date) ?? "", last.plaid_transaction_id)
      : null,
    syncWarnings: sync.failures.map((failure) => failure.message),
  };
}

export function cursorFromParam(value: string | null) {
  if (!value) {
    return { ok: true as const, cursor: null };
  }

  const cursor = decodeTransactionCursor(value);

  if (!cursor) {
    return { ok: false as const };
  }

  return { ok: true as const, cursor };
}
