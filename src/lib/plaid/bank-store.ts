import { seal, unseal } from "@/lib/crypto/seal";
import { hasDatabaseUrl, sql } from "@/lib/db/raw";
import {
  exchangePublicToken,
  getPlaidAccounts,
  plaidConfigured,
  plaidEnvironmentLabel,
  syncPlaidTransactions,
  type PlaidAccount,
  type PlaidTransaction,
} from "@/lib/plaid/client";

export type PlaidBankAccount = {
  id: string;
  itemId: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  availableBalance: number | null;
  currentBalance: number | null;
  currency: string | null;
  houseName: string | null;
  qboBankAccountId: string | null;
  updatedAt: string;
};

export type PlaidBankTransaction = {
  id: string;
  accountId: string;
  itemId: string;
  date: string;
  authorizedDate: string | null;
  name: string;
  merchantName: string | null;
  amount: number;
  direction: "money_in" | "money_out";
  pending: boolean;
  paymentChannel: string | null;
  category: string[];
  currency: string | null;
  updatedAt: string;
};

export type PlaidConnectionStatus = {
  configured: boolean;
  connected: boolean;
  environment: string;
  items: number;
  accounts: number;
  transactions: number;
  lastSyncedAt: string | null;
};

async function ensurePlaidTables() {
  await sql()`
    create table if not exists plaid_items (
      item_id text primary key,
      access_token_encrypted text not null,
      institution_id text,
      institution_name text,
      environment text not null,
      cursor text,
      connected_at timestamptz not null default now(),
      last_synced_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `;
  await sql()`
    create table if not exists plaid_accounts (
      plaid_account_id text primary key,
      item_id text not null references plaid_items(item_id) on delete cascade,
      name text not null,
      official_name text,
      mask text,
      account_type text,
      account_subtype text,
      available_balance numeric,
      current_balance numeric,
      iso_currency_code text,
      qbo_bank_account_id text,
      house_name text,
      raw jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql()`
    create table if not exists plaid_transactions (
      plaid_transaction_id text primary key,
      plaid_account_id text not null,
      item_id text not null references plaid_items(item_id) on delete cascade,
      txn_date date not null,
      authorized_date date,
      name text not null,
      merchant_name text,
      amount numeric not null,
      iso_currency_code text,
      payment_channel text,
      pending boolean not null default false,
      category text[] not null default '{}',
      personal_finance_category jsonb,
      raw jsonb not null,
      removed_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `;
}

function normalizeAccount(account: PlaidAccount) {
  return {
    availableBalance: account.balances.available ?? null,
    currentBalance: account.balances.current ?? null,
    currency: account.balances.iso_currency_code ?? null,
    mask: account.mask ?? null,
    officialName: account.official_name ?? null,
    subtype: account.subtype ?? null,
    type: account.type ?? null,
  };
}

function databaseJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

async function saveAccounts({
  accounts,
  itemId,
}: {
  accounts: PlaidAccount[];
  itemId: string;
}) {
  await ensurePlaidTables();

  for (const account of accounts) {
    const normalized = normalizeAccount(account);

    await sql()`
      insert into plaid_accounts (
        plaid_account_id,
        item_id,
        name,
        official_name,
        mask,
        account_type,
        account_subtype,
        available_balance,
        current_balance,
        iso_currency_code,
        raw,
        updated_at
      )
      values (
        ${account.account_id},
        ${itemId},
        ${account.name},
        ${normalized.officialName},
        ${normalized.mask},
        ${normalized.type},
        ${normalized.subtype},
        ${normalized.availableBalance},
        ${normalized.currentBalance},
        ${normalized.currency},
        ${sql().json(databaseJson(account))},
        now()
      )
      on conflict (plaid_account_id) do update set
        item_id = excluded.item_id,
        name = excluded.name,
        official_name = excluded.official_name,
        mask = excluded.mask,
        account_type = excluded.account_type,
        account_subtype = excluded.account_subtype,
        available_balance = excluded.available_balance,
        current_balance = excluded.current_balance,
        iso_currency_code = excluded.iso_currency_code,
        raw = excluded.raw,
        updated_at = now()
    `;
  }
}

async function getStoredItems() {
  await ensurePlaidTables();

  const rows = await sql()<
    Array<{
      item_id: string;
      access_token_encrypted: string;
      cursor: string | null;
    }>
  >`
    select item_id, access_token_encrypted, cursor
    from plaid_items
    order by connected_at desc
  `;

  return rows.map((row) => ({
    itemId: row.item_id,
    accessToken: unseal(row.access_token_encrypted),
    cursor: row.cursor,
  }));
}

export async function savePlaidPublicToken({
  institutionId,
  institutionName,
  publicToken,
}: {
  institutionId: string | null;
  institutionName: string | null;
  publicToken: string;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required before connecting Plaid.");
  }

  const exchanged = await exchangePublicToken(publicToken);
  const accessTokenEncrypted = seal(exchanged.access_token);

  await ensurePlaidTables();
  await sql()`
    insert into plaid_items (
      item_id,
      access_token_encrypted,
      institution_id,
      institution_name,
      environment,
      connected_at,
      updated_at
    )
    values (
      ${exchanged.item_id},
      ${accessTokenEncrypted},
      ${institutionId},
      ${institutionName},
      ${plaidEnvironmentLabel()},
      now(),
      now()
    )
    on conflict (item_id) do update set
      access_token_encrypted = excluded.access_token_encrypted,
      institution_id = excluded.institution_id,
      institution_name = excluded.institution_name,
      environment = excluded.environment,
      updated_at = now()
  `;

  const accountSnapshot = await getPlaidAccounts(exchanged.access_token);
  await saveAccounts({
    accounts: accountSnapshot.accounts,
    itemId: exchanged.item_id,
  });
  await syncAllPlaidItems();

  return {
    accounts: accountSnapshot.accounts.length,
    itemId: exchanged.item_id,
  };
}

export async function syncAllPlaidItems() {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required before syncing Plaid.");
  }

  await ensurePlaidTables();
  const items = await getStoredItems();
  let accountsSynced = 0;
  let transactionsAdded = 0;
  let transactionsModified = 0;
  let transactionsRemoved = 0;

  for (const item of items) {
    let cursor = item.cursor;
    let hasMore = true;

    while (hasMore) {
      const page = await syncPlaidTransactions(item.accessToken, cursor);

      await saveAccounts({ accounts: page.accounts, itemId: item.itemId });
      accountsSynced += page.accounts.length;

      for (const transaction of [...page.added, ...page.modified]) {
        await savePlaidTransaction(transaction, item.itemId);
      }

      for (const removed of page.removed) {
        await sql()`
          update plaid_transactions
          set removed_at = now(), updated_at = now()
          where plaid_transaction_id = ${removed.transaction_id}
        `;
      }

      transactionsAdded += page.added.length;
      transactionsModified += page.modified.length;
      transactionsRemoved += page.removed.length;
      cursor = page.next_cursor;
      hasMore = page.has_more;
    }

    await sql()`
      update plaid_items
      set cursor = ${cursor}, last_synced_at = now(), updated_at = now()
      where item_id = ${item.itemId}
    `;
  }

  return {
    accountsSynced,
    items: items.length,
    transactionsAdded,
    transactionsModified,
    transactionsRemoved,
  };
}

async function savePlaidTransaction(transaction: PlaidTransaction, itemId: string) {
  await sql()`
    insert into plaid_transactions (
      plaid_transaction_id,
      plaid_account_id,
      item_id,
      txn_date,
      authorized_date,
      name,
      merchant_name,
      amount,
      iso_currency_code,
      payment_channel,
      pending,
      category,
      personal_finance_category,
      raw,
      removed_at,
      updated_at
    )
    values (
      ${transaction.transaction_id},
      ${transaction.account_id},
      ${itemId},
      ${transaction.date},
      ${transaction.authorized_date ?? null},
      ${transaction.name},
      ${transaction.merchant_name ?? null},
      ${transaction.amount},
      ${transaction.iso_currency_code ?? null},
      ${transaction.payment_channel ?? null},
      ${transaction.pending},
      ${transaction.category ?? []},
      ${sql().json(databaseJson(transaction.personal_finance_category))},
      ${sql().json(databaseJson(transaction))},
      null,
      now()
    )
    on conflict (plaid_transaction_id) do update set
      plaid_account_id = excluded.plaid_account_id,
      item_id = excluded.item_id,
      txn_date = excluded.txn_date,
      authorized_date = excluded.authorized_date,
      name = excluded.name,
      merchant_name = excluded.merchant_name,
      amount = excluded.amount,
      iso_currency_code = excluded.iso_currency_code,
      payment_channel = excluded.payment_channel,
      pending = excluded.pending,
      category = excluded.category,
      personal_finance_category = excluded.personal_finance_category,
      raw = excluded.raw,
      removed_at = null,
      updated_at = now()
  `;
}

export async function getPlaidConnectionStatus(): Promise<PlaidConnectionStatus> {
  if (!hasDatabaseUrl()) {
    return {
      accounts: 0,
      configured: plaidConfigured(),
      connected: false,
      environment: plaidEnvironmentLabel(),
      items: 0,
      lastSyncedAt: null,
      transactions: 0,
    };
  }

  try {
    await ensurePlaidTables();
    const [items, accounts, transactions, lastSync] = await Promise.all([
      sql()<Array<{ count: string }>>`select count(*) from plaid_items`,
      sql()<Array<{ count: string }>>`select count(*) from plaid_accounts`,
      sql()<Array<{ count: string }>>`
        select count(*) from plaid_transactions where removed_at is null
      `,
      sql()<Array<{ last_synced_at: Date | null }>>`
        select max(last_synced_at) as last_synced_at from plaid_items
      `,
    ]);

    return {
      accounts: Number(accounts[0]?.count ?? 0),
      configured: plaidConfigured(),
      connected: Number(items[0]?.count ?? 0) > 0,
      environment: plaidEnvironmentLabel(),
      items: Number(items[0]?.count ?? 0),
      lastSyncedAt: lastSync[0]?.last_synced_at?.toISOString() ?? null,
      transactions: Number(transactions[0]?.count ?? 0),
    };
  } catch {
    return {
      accounts: 0,
      configured: plaidConfigured(),
      connected: false,
      environment: plaidEnvironmentLabel(),
      items: 0,
      lastSyncedAt: null,
      transactions: 0,
    };
  }
}

export async function getPlaidBankAccounts() {
  if (!hasDatabaseUrl()) {
    return [] as PlaidBankAccount[];
  }

  await ensurePlaidTables();
  const rows = await sql()<
    Array<{
      plaid_account_id: string;
      item_id: string;
      name: string;
      official_name: string | null;
      mask: string | null;
      account_type: string | null;
      account_subtype: string | null;
      available_balance: string | null;
      current_balance: string | null;
      iso_currency_code: string | null;
      qbo_bank_account_id: string | null;
      house_name: string | null;
      updated_at: Date;
    }>
  >`
    select
      plaid_account_id,
      item_id,
      name,
      official_name,
      mask,
      account_type,
      account_subtype,
      available_balance,
      current_balance,
      iso_currency_code,
      qbo_bank_account_id,
      house_name,
      updated_at
    from plaid_accounts
    order by name
  `;

  return rows.map((row) => ({
    id: row.plaid_account_id,
    itemId: row.item_id,
    name: row.name,
    officialName: row.official_name,
    mask: row.mask,
    type: row.account_type,
    subtype: row.account_subtype,
    availableBalance: row.available_balance === null ? null : Number(row.available_balance),
    currentBalance: row.current_balance === null ? null : Number(row.current_balance),
    currency: row.iso_currency_code,
    qboBankAccountId: row.qbo_bank_account_id,
    houseName: row.house_name,
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function getRecentPlaidTransactions(limit = 50) {
  if (!hasDatabaseUrl()) {
    return [] as PlaidBankTransaction[];
  }

  await ensurePlaidTables();
  const rows = await sql()<
    Array<{
      plaid_transaction_id: string;
      plaid_account_id: string;
      item_id: string;
      txn_date: Date;
      authorized_date: Date | null;
      name: string;
      merchant_name: string | null;
      amount: string;
      iso_currency_code: string | null;
      payment_channel: string | null;
      pending: boolean;
      category: string[];
      updated_at: Date;
    }>
  >`
    select
      plaid_transaction_id,
      plaid_account_id,
      item_id,
      txn_date,
      authorized_date,
      name,
      merchant_name,
      amount,
      iso_currency_code,
      payment_channel,
      pending,
      category,
      updated_at
    from plaid_transactions
    where removed_at is null
    order by txn_date desc, updated_at desc
    limit ${limit}
  `;

  return rows.map((row): PlaidBankTransaction => {
    const amount = Number(row.amount);

    return {
      id: row.plaid_transaction_id,
      accountId: row.plaid_account_id,
      itemId: row.item_id,
      date: row.txn_date.toISOString().slice(0, 10),
      authorizedDate: row.authorized_date?.toISOString().slice(0, 10) ?? null,
      name: row.name,
      merchantName: row.merchant_name,
      amount,
      direction: amount < 0 ? "money_in" : "money_out",
      pending: row.pending,
      paymentChannel: row.payment_channel,
      category: row.category,
      currency: row.iso_currency_code,
      updatedAt: row.updated_at.toISOString(),
    };
  });
}
