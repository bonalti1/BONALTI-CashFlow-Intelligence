import { seal, unseal } from "@/lib/crypto/seal";
import { hasDatabaseUrl, sql } from "@/lib/db/raw";
import { dedupeInflight } from "@/lib/performance/ttl-cache";
import {
  exchangePublicToken,
  getPlaidAccounts,
  getPlaidItemStatus,
  getPlaidLiveBalances,
  plaidConfigured,
  PlaidApiError,
  plaidEnvironmentLabel,
  refreshPlaidTransactions,
  syncPlaidTransactions,
  type PlaidAccount,
  type PlaidTransaction,
} from "@/lib/plaid/client";
import {
  dedupePlaidAccounts,
  pickCanonicalItems,
  toPublicBalance,
  withinRefreshWindow,
  type PublicBalance,
} from "@/lib/plaid/dedupe-accounts";

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
  lastSyncedAt: string | null;
  updatedAt: string;
  institutionId: string | null;
  institutionName: string | null;
  // When the balance shown was true at the bank, and whether it came from a live check.
  balanceAsOf: string | null;
  balanceSource: "live" | "bank_update" | "unknown";
  // False when the latest live check of this bank login did not return the account.
  reportedByBank: boolean;
  connectionStatus: PlaidConnectionHealth;
  connectionMessage: string | null;
};

export type PlaidConnectionHealth = "live" | "last_known" | "needs_sign_in" | "error" | "unchecked";

export type LiveBalanceBank = {
  itemId: string;
  institutionName: string | null;
  status: PlaidConnectionHealth;
  message: string | null;
  reused: boolean;
};

export type LiveBalanceCheck = {
  checkedAt: string;
  banks: LiveBalanceBank[];
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
  duplicateItems: number;
};

let plaidTablesReady: Promise<void> | null = null;

export function ensurePlaidTables() {
  plaidTablesReady ??= initializePlaidTables().catch((error) => {
    plaidTablesReady = null;
    throw error;
  });

  return plaidTablesReady;
}

async function initializePlaidTables() {
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
  // Live balances are kept apart from Plaid's cached copy so a later sync cannot pass off
  // an older cached number as the live one. Readers show whichever is newer.
  await sql()`alter table plaid_accounts add column if not exists live_available_balance numeric`;
  await sql()`alter table plaid_accounts add column if not exists live_current_balance numeric`;
  await sql()`alter table plaid_accounts add column if not exists live_checked_at timestamptz`;
  await sql()`alter table plaid_items add column if not exists balance_status text`;
  await sql()`alter table plaid_items add column if not exists balance_status_message text`;
  await sql()`alter table plaid_items add column if not exists balance_checked_at timestamptz`;
  await sql()`alter table plaid_items add column if not exists live_checked_at timestamptz`;
  await sql()`alter table plaid_items add column if not exists bank_updated_at timestamptz`;
  await sql()`alter table plaid_transactions add column if not exists pending_transaction_id text`;
  await sql()`alter table plaid_transactions add column if not exists payee text`;
  await sql()`alter table plaid_transactions add column if not exists check_number text`;
  await sql()`alter table plaid_transactions add column if not exists counterparties jsonb`;
  await sql()`alter table plaid_transactions add column if not exists payment_meta jsonb`;
  await sql()`alter table plaid_transactions add column if not exists transaction_code text`;
  await sql()`
    create index if not exists plaid_transactions_account_date_idx
      on plaid_transactions (plaid_account_id, txn_date desc, plaid_transaction_id desc)
      where removed_at is null
  `.catch((error) => {
    console.error("Could not add the Plaid transaction date index", { code: databaseErrorCode(error) });
  });
  await sql()`
    create index if not exists plaid_transactions_amount_date_idx
      on plaid_transactions (amount, txn_date)
      where removed_at is null
  `.catch((error) => {
    console.error("Could not add the Plaid transaction amount index", { code: databaseErrorCode(error) });
  });
  // One row per refresh kind. The timestamp is what the 5-minute throttle reads.
  await sql()`
    create table if not exists plaid_refresh_state (
      scope text primary key,
      last_success_at timestamptz,
      last_attempt_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `;
  // Same login cannot store two rows for one mask and type. This does not collapse
  // the same mask across two logins: those rows have different Plaid account ids,
  // and a unique key there would require deleting accounts. See the optional SQL
  // in docs/plaid-balance-refresh.md.
  await sql()`
    create unique index if not exists plaid_accounts_item_mask_type_key
      on plaid_accounts (item_id, mask, account_type)
      where mask is not null and account_type is not null
  `.catch((error) => {
    console.error("Could not add the Plaid account unique index", {
      code: databaseErrorCode(error),
    });
  });
}

function databaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }

  return typeof error.code === "string" ? error.code : null;
}

function isUniqueViolation(error: unknown) {
  return databaseErrorCode(error) === "23505";
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

    try {
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
    } catch (error) {
      if (!isUniqueViolation(error) || !normalized.mask || !normalized.type) {
        throw error;
      }

      // This login already has this mask and type under a different Plaid account id.
      // Keep that row (and the transactions that point at it) and refresh its numbers.
      await sql()`
        update plaid_accounts
        set
          name = ${account.name},
          official_name = ${normalized.officialName},
          account_subtype = ${normalized.subtype},
          available_balance = ${normalized.availableBalance},
          current_balance = ${normalized.currentBalance},
          iso_currency_code = ${normalized.currency},
          raw = ${sql().json(databaseJson(account))},
          updated_at = now()
        where item_id = ${itemId}
          and mask = ${normalized.mask}
          and account_type = ${normalized.type}
      `;
    }
  }
}

type StoredPlaidItem = {
  itemId: string;
  accessToken: string;
  cursor: string | null;
  institutionId: string | null;
  institutionName: string | null;
  connectedAt: Date;
  balanceStatus: string | null;
  balanceCheckedAt: Date | null;
};

async function getStoredItems(): Promise<StoredPlaidItem[]> {
  await ensurePlaidTables();

  const rows = await sql()<
    Array<{
      item_id: string;
      access_token_encrypted: string;
      cursor: string | null;
      institution_id: string | null;
      institution_name: string | null;
      connected_at: Date;
      balance_status: string | null;
      balance_checked_at: Date | null;
    }>
  >`
    select item_id, access_token_encrypted, cursor, institution_id, institution_name,
      connected_at, balance_status, balance_checked_at
    from plaid_items
    order by connected_at desc
  `;

  return rows.map((row) => ({
    itemId: row.item_id,
    accessToken: unseal(row.access_token_encrypted),
    cursor: row.cursor,
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    connectedAt: row.connected_at,
    balanceStatus: row.balance_status,
    balanceCheckedAt: row.balance_checked_at,
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

  // The bank is connected at this point. Pull only this bank's transactions; if that
  // fails (Plaid is often still loading history right after linking), report it as a
  // warning instead of a failed connection. The next Sync Bank picks it up.
  const storedItem = (await getStoredItems()).find((item) => item.itemId === exchanged.item_id);
  let syncWarning: string | null = null;

  if (storedItem) {
    try {
      await syncPlaidItem(storedItem);
    } catch (error) {
      console.error("Initial Plaid sync failed", { itemId: exchanged.item_id, error });
      syncWarning = plaidSyncProblem(error);
    }
  }

  return {
    accounts: accountSnapshot.accounts.length,
    itemId: exchanged.item_id,
    syncWarning,
  };
}

const liveReuseMs = 60_000;
const signInCodes = new Set([
  "ITEM_LOGIN_REQUIRED",
  "ITEM_LOCKED",
  "INVALID_CREDENTIALS",
  "INVALID_MFA",
  "USER_SETUP_REQUIRED",
]);

function liveFailureMessage(error: unknown) {
  const code = error instanceof PlaidApiError ? error.code : null;

  if (code === "INVALID_PRODUCT" || code === "PRODUCTS_NOT_SUPPORTED" || code === "PRODUCT_NOT_ENABLED") {
    return "Live balance checks are not turned on for this bank in Plaid, so this is the last balance Plaid got from the bank.";
  }

  if (
    code === "CLIENT_TIMEOUT" ||
    code === "INSTITUTION_DOWN" ||
    code === "INSTITUTION_NOT_RESPONDING" ||
    code === "INSTITUTION_NOT_AVAILABLE" ||
    code === "PLANNED_MAINTENANCE" ||
    code === "INTERNAL_SERVER_ERROR" ||
    code === "RATE_LIMIT_EXCEEDED"
  ) {
    return "The bank did not answer a live check just now, so this is the last balance Plaid got from the bank.";
  }

  return `Live check failed (${error instanceof Error ? error.message : "unknown error"}), so this is the last balance Plaid got from the bank.`;
}

async function saveLiveAccounts(accounts: PlaidAccount[], itemId: string, checkedAt: Date) {
  for (const account of accounts) {
    const normalized = normalizeAccount(account);

    // New accounts get the live numbers as their cached copy too; existing rows only get
    // their live columns, so Plaid's cached copy keeps its own timing.
    try {
      await sql()`
        insert into plaid_accounts (
          plaid_account_id, item_id, name, official_name, mask, account_type, account_subtype,
          available_balance, current_balance, iso_currency_code, raw,
          live_available_balance, live_current_balance, live_checked_at, updated_at
        )
        values (
          ${account.account_id}, ${itemId}, ${account.name}, ${normalized.officialName},
          ${normalized.mask}, ${normalized.type}, ${normalized.subtype},
          ${normalized.availableBalance}, ${normalized.currentBalance}, ${normalized.currency},
          ${sql().json(databaseJson(account))},
          ${normalized.availableBalance}, ${normalized.currentBalance}, ${checkedAt}, now()
        )
        on conflict (plaid_account_id) do update set
          item_id = excluded.item_id,
          name = excluded.name,
          official_name = excluded.official_name,
          mask = excluded.mask,
          account_type = excluded.account_type,
          account_subtype = excluded.account_subtype,
          iso_currency_code = excluded.iso_currency_code,
          live_available_balance = excluded.live_available_balance,
          live_current_balance = excluded.live_current_balance,
          live_checked_at = excluded.live_checked_at,
          updated_at = now()
      `;
    } catch (error) {
      if (!isUniqueViolation(error) || !normalized.mask || !normalized.type) {
        throw error;
      }

      await sql()`
        update plaid_accounts
        set
          name = ${account.name},
          official_name = ${normalized.officialName},
          account_subtype = ${normalized.subtype},
          iso_currency_code = ${normalized.currency},
          live_available_balance = ${normalized.availableBalance},
          live_current_balance = ${normalized.currentBalance},
          live_checked_at = ${checkedAt},
          updated_at = now()
        where item_id = ${itemId}
          and mask = ${normalized.mask}
          and account_type = ${normalized.type}
      `;
    }

    if (normalized.mask) {
      // Older logins of the same bank keep their own rows. Copy the live numbers onto
      // them so a linked copy of this mask does not stay on yesterday's balance.
      await sql()`
        update plaid_accounts other
        set
          live_available_balance = ${normalized.availableBalance},
          live_current_balance = ${normalized.currentBalance},
          live_checked_at = ${checkedAt},
          iso_currency_code = coalesce(${normalized.currency}, other.iso_currency_code),
          updated_at = now()
        from plaid_items self_item, plaid_items other_item
        where self_item.item_id = ${itemId}
          and other.item_id = other_item.item_id
          and self_item.institution_id is not null
          and other_item.institution_id = self_item.institution_id
          and other.mask = ${normalized.mask}
          and other.account_type is not distinct from ${normalized.type}
          and other.plaid_account_id <> ${account.account_id}
      `;
    }
  }
}

async function saveItemBalanceStatus({
  itemId,
  status,
  message,
  checkedAt,
  liveCheckedAt,
  bankUpdatedAt,
}: {
  itemId: string;
  status: PlaidConnectionHealth;
  message: string | null;
  checkedAt: Date;
  liveCheckedAt: Date | null;
  bankUpdatedAt: string | null;
}) {
  await sql()`
    update plaid_items
    set
      balance_status = ${status},
      balance_status_message = ${message},
      balance_checked_at = ${checkedAt},
      live_checked_at = coalesce(${liveCheckedAt}, live_checked_at),
      bank_updated_at = coalesce(${bankUpdatedAt}::timestamptz, bank_updated_at),
      updated_at = now()
    where item_id = ${itemId}
  `;
}

async function refreshItemBalances(item: StoredPlaidItem, reuseWithinMs: number): Promise<LiveBalanceBank> {
  const base = { itemId: item.itemId, institutionName: item.institutionName };

  if (
    item.balanceStatus === "live" &&
    item.balanceCheckedAt &&
    Date.now() - item.balanceCheckedAt.getTime() < reuseWithinMs
  ) {
    return { ...base, status: "live", message: null, reused: true };
  }

  const checkedAt = new Date();
  const [statusResult, liveResult] = await Promise.allSettled([
    getPlaidItemStatus(item.accessToken),
    getPlaidLiveBalances(item.accessToken),
  ]);
  const itemStatus = statusResult.status === "fulfilled" ? statusResult.value : null;
  const bankUpdatedAt = isoTimestamp(itemStatus?.status?.transactions?.last_successful_update ?? null);

  if (liveResult.status === "fulfilled") {
    await saveLiveAccounts(liveResult.value.accounts, item.itemId, checkedAt);
    await saveItemBalanceStatus({
      itemId: item.itemId,
      status: "live",
      message: null,
      checkedAt,
      liveCheckedAt: checkedAt,
      bankUpdatedAt,
    });

    return { ...base, status: "live", message: null, reused: false };
  }

  const error = liveResult.reason;
  const code = error instanceof PlaidApiError ? error.code : null;
  const itemErrorCode = itemStatus?.item.error?.error_code ?? null;
  let status: PlaidConnectionHealth;
  let message: string;

  if ((code && signInCodes.has(code)) || (itemErrorCode && signInCodes.has(itemErrorCode))) {
    status = "needs_sign_in";
    message = "This bank needs a new sign-in before it can be checked. The balance shown is the last one received.";
  } else {
    try {
      const cached = await getPlaidAccounts(item.accessToken);

      await saveAccounts({ accounts: cached.accounts, itemId: item.itemId });
      status = "last_known";
      message = liveFailureMessage(error);
    } catch (cachedError) {
      console.error("Plaid cached balance fallback failed", { itemId: item.itemId, cachedError });
      status = "error";
      message = `Could not reach this bank (${error instanceof Error ? error.message : "unknown error"}). The balance shown is the last one received.`;
    }
  }

  console.error("Plaid live balance check failed", { itemId: item.itemId, code, error });
  await saveItemBalanceStatus({
    itemId: item.itemId,
    status,
    message,
    checkedAt,
    liveCheckedAt: null,
    bankUpdatedAt,
  });

  return { ...base, status, message, reused: false };
}

// Asks every connected bank for its balance right now. A bank checked live within the
// reuse window is not asked again, which keeps repeat page opens from adding Plaid charges.
export async function refreshLiveBalances({
  reuseWithinMs = liveReuseMs,
}: { reuseWithinMs?: number } = {}): Promise<LiveBalanceCheck> {
  if (!hasDatabaseUrl() || !plaidConfigured()) {
    return { checkedAt: new Date().toISOString(), banks: [] };
  }

  await ensurePlaidTables();
  const items = await getStoredItems();
  const banks = await Promise.all(items.map((item) => refreshItemBalances(item, reuseWithinMs)));

  return { checkedAt: new Date().toISOString(), banks };
}

export type TransactionRefreshStatus = "requested" | "not_enabled" | "not_ready" | "skipped" | "error";

export type TransactionRefreshItem = {
  institutionName: string | null;
  status: TransactionRefreshStatus;
  code: string | null;
};

export type BalanceRefreshResult = {
  cached: boolean;
  refreshedAt: string | null;
  accounts: PublicBalance[];
  banks: LiveBalanceBank[];
  skippedItems: number;
  transactions: {
    cached: boolean;
    items: TransactionRefreshItem[];
  } | null;
};

const balanceScope = "balances";
const transactionScope = "transactions";

function plaidErrorCode(error: unknown) {
  return error instanceof PlaidApiError ? error.code : null;
}

async function readRefreshState(scope: string) {
  const [row] = await sql()<
    Array<{ last_success_at: Date | null; last_attempt_at: Date | null }>
  >`
    select last_success_at, last_attempt_at
    from plaid_refresh_state
    where scope = ${scope}
  `;

  return row ?? { last_success_at: null, last_attempt_at: null };
}

function refreshIsThrottled(state: { last_success_at: Date | null; last_attempt_at: Date | null }, now: number) {
  return (
    withinRefreshWindow(state.last_success_at, now) || withinRefreshWindow(state.last_attempt_at, now)
  );
}

async function markRefreshAttempt(scope: string) {
  await sql()`
    insert into plaid_refresh_state (scope, last_attempt_at, updated_at)
    values (${scope}, now(), now())
    on conflict (scope) do update set
      last_attempt_at = now(),
      updated_at = now()
  `;
}

async function markRefreshSuccess(scope: string) {
  await sql()`
    insert into plaid_refresh_state (scope, last_success_at, last_attempt_at, updated_at)
    values (${scope}, now(), now(), now())
    on conflict (scope) do update set
      last_success_at = now(),
      last_attempt_at = now(),
      updated_at = now()
  `;
}

type PlaidItemMetadata = {
  itemId: string;
  institutionId: string | null;
  institutionName: string | null;
  connectedAt: Date;
  balanceStatus: string | null;
};

async function getPlaidItemMetadata(): Promise<PlaidItemMetadata[]> {
  const rows = await sql()<
    Array<{
      item_id: string;
      institution_id: string | null;
      institution_name: string | null;
      connected_at: Date;
      balance_status: string | null;
    }>
  >`
    select item_id, institution_id, institution_name, connected_at, balance_status
    from plaid_items
    order by connected_at desc
  `;

  return rows.map((row) => ({
    itemId: row.item_id,
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    connectedAt: row.connected_at,
    balanceStatus: row.balance_status,
  }));
}

function canonicalPlaidItems(items: PlaidItemMetadata[]) {
  return pickCanonicalItems(
    items.map((item) => ({
      item,
      itemId: item.itemId,
      institutionKey: item.institutionId,
      connectedAt: item.connectedAt.toISOString(),
      needsSignIn: item.balanceStatus === "needs_sign_in",
    })),
  );
}

async function accessTokenForItem(itemId: string) {
  const [row] = await sql()<Array<{ access_token_encrypted: string }>>`
    select access_token_encrypted
    from plaid_items
    where item_id = ${itemId}
  `;

  if (!row) {
    throw new Error("Plaid item was not found.");
  }

  return unseal(row.access_token_encrypted);
}

async function readPublicBalances(): Promise<PublicBalance[]> {
  const accounts = await getPlaidBankAccounts();

  return accounts
    .map((account) =>
      toPublicBalance({
        name: account.name,
        mask: account.mask,
        type: account.type,
        current: account.currentBalance,
        available: account.availableBalance,
        currency: account.currency,
      }),
    )
    .sort((left, right) => left.name.localeCompare(right.name) || (left.mask ?? "").localeCompare(right.mask ?? ""));
}

async function refreshCanonicalBalances(items: PlaidItemMetadata[]) {
  const banks: LiveBalanceBank[] = [];
  let anySuccess = false;

  for (const item of items) {
    const base = { itemId: item.itemId, institutionName: item.institutionName };
    const checkedAt = new Date();
    const accessToken = await accessTokenForItem(item.itemId);

    try {
      const live = await getPlaidLiveBalances(accessToken);

      await saveLiveAccounts(live.accounts, item.itemId, checkedAt);
      await saveItemBalanceStatus({
        itemId: item.itemId,
        status: "live",
        message: null,
        checkedAt,
        liveCheckedAt: checkedAt,
        bankUpdatedAt: null,
      });
      anySuccess = true;
      banks.push({ ...base, status: "live", message: null, reused: false });
    } catch (error) {
      const code = plaidErrorCode(error);
      const needsSignIn = Boolean(code && signInCodes.has(code));
      const status: PlaidConnectionHealth = needsSignIn ? "needs_sign_in" : "error";
      const message = needsSignIn
        ? "This bank needs a new sign-in. The amount shown is the last one saved."
        : "The bank did not return a live balance. The amount shown is the last one saved.";

      console.error("Plaid balance refresh failed", { itemId: item.itemId, code });
      await saveItemBalanceStatus({
        itemId: item.itemId,
        status,
        message,
        checkedAt,
        liveCheckedAt: null,
        bankUpdatedAt: null,
      });
      banks.push({ ...base, status, message, reused: false });
    }
  }

  return { anySuccess, banks };
}

function transactionsEnabled(products: Array<string | null | undefined>) {
  return products.some((product) => product === "transactions");
}

async function refreshCanonicalTransactions(items: PlaidItemMetadata[]): Promise<TransactionRefreshItem[]> {
  const results: TransactionRefreshItem[] = [];
  let anyRequested = false;

  for (const item of items) {
    const institutionName = item.institutionName;
    const accessToken = await accessTokenForItem(item.itemId);

    try {
      const status = await getPlaidItemStatus(accessToken);
      const products = [...(status.item.products ?? []), ...(status.item.billed_products ?? [])];

      if (!transactionsEnabled(products)) {
        results.push({ institutionName, status: "not_enabled", code: null });
        continue;
      }
    } catch (error) {
      console.error("Plaid item status failed", { itemId: item.itemId, code: plaidErrorCode(error) });
      results.push({ institutionName, status: "error", code: plaidErrorCode(error) });
      continue;
    }

    try {
      await refreshPlaidTransactions(accessToken);
      anyRequested = true;
      results.push({ institutionName, status: "requested", code: null });
    } catch (error) {
      const code = plaidErrorCode(error);

      console.error("Plaid transaction refresh failed", { itemId: item.itemId, code });
      results.push({
        institutionName,
        status: code === "PRODUCT_NOT_READY" ? "not_ready" : "error",
        code,
      });
    }
  }

  if (anyRequested) {
    await markRefreshSuccess(transactionScope);
  }

  return results;
}

async function refreshPlaidTransactionsOnce(items: PlaidItemMetadata[]) {
  if (!plaidConfigured() || items.length === 0) {
    return { cached: false, items: [] as TransactionRefreshItem[] };
  }

  const transactionState = await readRefreshState(transactionScope);

  if (refreshIsThrottled(transactionState, Date.now())) {
    return {
      cached: true,
      items: items.map((item) => ({
        institutionName: item.institutionName,
        status: "skipped" as const,
        code: null,
      })),
    };
  }

  await markRefreshAttempt(transactionScope);

  return {
    cached: false,
    items: await refreshCanonicalTransactions(items),
  };
}

// Reads /accounts/balance/get for one login per institution and stores the numbers.
// A successful refresh in the last 5 minutes is returned as-is. Pass transactions
// only from the scheduled job: that also calls /transactions/refresh when the
// Transactions product is enabled. Nothing here moves money.
export async function refreshPlaidBalances({
  transactions = false,
}: { transactions?: boolean } = {}): Promise<BalanceRefreshResult> {
  const balances = await dedupeInflight("plaid:balance-refresh", () => refreshPlaidBalancesOnce());

  if (!transactions) {
    return balances;
  }

  const transactionResult = await dedupeInflight("plaid:transaction-refresh", async () => {
    const { keep } = canonicalPlaidItems(await getPlaidItemMetadata());

    return refreshPlaidTransactionsOnce(keep.map((entry) => entry.item));
  });

  return { ...balances, transactions: transactionResult };
}

async function refreshPlaidBalancesOnce(): Promise<BalanceRefreshResult> {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required before refreshing Plaid balances.");
  }

  await ensurePlaidTables();
  const now = Date.now();
  const balanceState = await readRefreshState(balanceScope);
  const items = await getPlaidItemMetadata();
  const { keep, skipped } = canonicalPlaidItems(items);
  const throttled = refreshIsThrottled(balanceState, now);
  const callPlaid = plaidConfigured() && keep.length > 0 && !throttled;

  let banks: LiveBalanceBank[];

  if (!callPlaid) {
    banks = keep.map((entry) => ({
      itemId: entry.item.itemId,
      institutionName: entry.item.institutionName,
      status: connectionHealth(entry.item.balanceStatus),
      message: null,
      reused: true,
    }));
  } else {
    await markRefreshAttempt(balanceScope);
    const refreshed = await refreshCanonicalBalances(keep.map((entry) => entry.item));

    banks = refreshed.banks;

    if (refreshed.anySuccess) {
      await markRefreshSuccess(balanceScope);
    }
  }

  const success = await readRefreshState(balanceScope);

  return {
    cached: !callPlaid && throttled,
    refreshedAt: success.last_success_at?.toISOString() ?? null,
    accounts: await readPublicBalances(),
    banks,
    skippedItems: skipped.length,
    transactions: null,
  };
}

export async function getPlaidBalanceRefreshedAt() {
  if (!hasDatabaseUrl()) {
    return null;
  }

  try {
    await ensurePlaidTables();
    const state = await readRefreshState(balanceScope);

    return state.last_success_at?.toISOString() ?? null;
  } catch {
    return null;
  }
}

export type PlaidSyncFailure = {
  institutionName: string;
  message: string;
};

const maxSyncAttempts = 3;

export function plaidSyncProblem(error: unknown) {
  const code = error instanceof PlaidApiError ? error.code : null;

  if (code === "ITEM_LOGIN_REQUIRED") {
    return "the bank needs you to sign in again before it can sync.";
  }

  if (code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" || code === "PRODUCT_NOT_READY") {
    return "the bank was still updating its transactions. Try Sync Bank again in a few minutes.";
  }

  return error instanceof Error ? error.message : "Plaid sync failed.";
}

// /transactions/sync pages until has_more is false, which is the full history Plaid
// still has for this login. Each page is written and then dropped. Upserts make a
// restart safe: on TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION we replay from the
// cursor this attempt started with. The cursor is saved only after the last page,
// so a crash replays instead of skipping a gap.
async function syncPlaidItem(item: StoredPlaidItem) {
  const startedCursor = item.cursor;

  for (let attempt = 1; ; attempt += 1) {
    const accounts = new Map<string, PlaidAccount>();
    let added = 0;
    let cursor = startedCursor;
    let hasMore = true;
    let modified = 0;
    let removed = 0;

    try {
      while (hasMore) {
        const page = await syncPlaidTransactions(item.accessToken, cursor);

        for (const account of page.accounts) {
          accounts.set(account.account_id, account);
        }

        for (const transaction of page.added) {
          await savePlaidTransaction(transaction, item.itemId);
          added += 1;
        }

        for (const transaction of page.modified) {
          await savePlaidTransaction(transaction, item.itemId);
          modified += 1;
        }

        for (const removedTransaction of page.removed) {
          await sql()`
            update plaid_transactions
            set removed_at = now(), updated_at = now()
            where plaid_transaction_id = ${removedTransaction.transaction_id}
          `;
          removed += 1;
        }

        cursor = page.next_cursor;
        hasMore = page.has_more;
      }

      if (accounts.size > 0) {
        await saveAccounts({ accounts: [...accounts.values()], itemId: item.itemId });
      }

      await sql()`
        update plaid_items
        set cursor = ${cursor}, last_synced_at = now(), updated_at = now()
        where item_id = ${item.itemId}
      `;

      return {
        accounts: accounts.size,
        added,
        modified,
        removed,
      };
    } catch (error) {
      const restartable =
        error instanceof PlaidApiError &&
        error.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";

      if (!restartable || attempt >= maxSyncAttempts) {
        throw error;
      }
    }
  }
}

export async function syncAllPlaidItems() {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required before syncing Plaid.");
  }

  await ensurePlaidTables();
  const items = await getStoredItems();
  const failures: PlaidSyncFailure[] = [];
  let accountsSynced = 0;
  let transactionsAdded = 0;
  let transactionsModified = 0;
  let transactionsRemoved = 0;

  // One bank's problem (an expired login, a mid-sync update) must not stop the others.
  for (const item of items) {
    try {
      const result = await syncPlaidItem(item);

      accountsSynced += result.accounts;
      transactionsAdded += result.added;
      transactionsModified += result.modified;
      transactionsRemoved += result.removed;
    } catch (error) {
      console.error("Plaid sync failed for item", {
        itemId: item.itemId,
        code: error instanceof PlaidApiError ? error.code : null,
      });
      failures.push({
        institutionName: item.institutionName ?? "One bank",
        message: plaidSyncProblem(error),
      });
    }
  }

  return {
    accountsSynced,
    failures,
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
      pending_transaction_id,
      payee,
      check_number,
      counterparties,
      payment_meta,
      transaction_code,
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
      ${jsonOrNull(transaction.personal_finance_category)},
      ${transaction.pending_transaction_id ?? null},
      ${transaction.payment_meta?.payee ?? null},
      ${transaction.check_number ?? null},
      ${jsonOrNull(transaction.counterparties)},
      ${jsonOrNull(transaction.payment_meta)},
      ${transaction.transaction_code ?? null},
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
      pending_transaction_id = excluded.pending_transaction_id,
      payee = excluded.payee,
      check_number = excluded.check_number,
      counterparties = excluded.counterparties,
      payment_meta = excluded.payment_meta,
      transaction_code = excluded.transaction_code,
      raw = excluded.raw,
      removed_at = null,
      updated_at = now()
  `;
}

function jsonOrNull(value: unknown) {
  if (value == null) {
    return null;
  }

  return sql().json(databaseJson(value));
}

const transactionSyncScope = "transaction_sync";

// Pulls /transactions/sync for every login at most once every 5 minutes.
// A login with no cursor is walked until Plaid has no more history.
export async function syncPlaidTransactionsIfDue() {
  return dedupeInflight("plaid:transaction-sync", async () => {
    if (!hasDatabaseUrl() || !plaidConfigured()) {
      return { synced: false as const, failures: [] as PlaidSyncFailure[] };
    }

    await ensurePlaidTables();
    const state = await readRefreshState(transactionSyncScope);

    if (refreshIsThrottled(state, Date.now())) {
      return { synced: false as const, failures: [] as PlaidSyncFailure[] };
    }

    await markRefreshAttempt(transactionSyncScope);
    const result = await syncAllPlaidItems();

    if (result.failures.length < result.items) {
      await markRefreshSuccess(transactionSyncScope);
    }

    return { synced: true as const, failures: result.failures };
  });
}

export async function getPlaidConnectionStatus(): Promise<PlaidConnectionStatus> {
  if (!hasDatabaseUrl()) {
    return {
      accounts: 0,
      configured: plaidConfigured(),
      connected: false,
      environment: plaidEnvironmentLabel(),
      items: 0,
      duplicateItems: 0,
      lastSyncedAt: null,
      transactions: 0,
    };
  }

  try {
    await ensurePlaidTables();
    const [items, accounts, transactions, lastSync, itemRows] = await Promise.all([
      sql()<Array<{ count: string }>>`select count(*) from plaid_items`,
      sql()<Array<{ count: string }>>`select count(*) from plaid_accounts`,
      sql()<Array<{ count: string }>>`
        select count(*) from plaid_transactions where removed_at is null
      `,
      sql()<Array<{ last_synced_at: Date | null }>>`
        select max(last_synced_at) as last_synced_at from plaid_items
      `,
      sql()<
        Array<{
          item_id: string;
          institution_id: string | null;
          connected_at: Date;
          balance_status: string | null;
        }>
      >`
        select item_id, institution_id, connected_at, balance_status
        from plaid_items
      `,
    ]);
    const duplicateItems = pickCanonicalItems(
      itemRows.map((row) => ({
        itemId: row.item_id,
        institutionKey: row.institution_id,
        connectedAt: row.connected_at.toISOString(),
        needsSignIn: row.balance_status === "needs_sign_in",
      })),
    ).skipped.length;

    return {
      accounts: Number(accounts[0]?.count ?? 0),
      configured: plaidConfigured(),
      connected: Number(items[0]?.count ?? 0) > 0,
      duplicateItems,
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
      duplicateItems: 0,
      environment: plaidEnvironmentLabel(),
      items: 0,
      lastSyncedAt: null,
      transactions: 0,
    };
  }
}

type FreshnessColumns = {
  available_balance: string | null;
  current_balance: string | null;
  live_available_balance: string | null;
  live_current_balance: string | null;
  live_checked_at: Date | string | null;
  bank_updated_at: Date | string | null;
};

// Pick whichever balance is newer: our last live check, or Plaid's cached copy from its
// last pull from the bank. Cached balances without a known pull time are labelled unknown.
function freshestBalance(row: FreshnessColumns) {
  const liveAt = isoTimestamp(row.live_checked_at);
  const bankAt = isoTimestamp(row.bank_updated_at);

  if (liveAt && (!bankAt || liveAt >= bankAt)) {
    return {
      available: moneyOrNull(row.live_available_balance),
      current: moneyOrNull(row.live_current_balance),
      asOf: liveAt,
      source: "live" as const,
    };
  }

  return {
    available: moneyOrNull(row.available_balance),
    current: moneyOrNull(row.current_balance),
    asOf: bankAt,
    source: bankAt ? ("bank_update" as const) : ("unknown" as const),
  };
}

function connectionHealth(value: string | null): PlaidConnectionHealth {
  return value === "live" ||
    value === "last_known" ||
    value === "needs_sign_in" ||
    value === "error"
    ? value
    : "unchecked";
}

async function loadPlaidBankAccounts() {
  if (!hasDatabaseUrl()) {
    return [] as PlaidBankAccount[];
  }

  await ensurePlaidTables();
  const rows = await sql()<
    Array<
      FreshnessColumns & {
        plaid_account_id: string;
        item_id: string;
        name: string;
        official_name: string | null;
        mask: string | null;
        account_type: string | null;
        account_subtype: string | null;
        iso_currency_code: string | null;
        qbo_bank_account_id: string | null;
        house_name: string | null;
        updated_at: Date;
        last_synced_at: Date | string | null;
        institution_id: string | null;
        institution_name: string | null;
        balance_status: string | null;
        balance_status_message: string | null;
        item_live_checked_at: Date | string | null;
        connected_at: Date | string | null;
      }
    >
  >`
    select
      a.plaid_account_id,
      a.item_id,
      a.name,
      a.official_name,
      a.mask,
      a.account_type,
      a.account_subtype,
      a.available_balance,
      a.current_balance,
      a.live_available_balance,
      a.live_current_balance,
      a.live_checked_at,
      a.iso_currency_code,
      a.qbo_bank_account_id,
      a.house_name,
      a.updated_at,
      i.last_synced_at,
      i.institution_id,
      i.institution_name,
      i.balance_status,
      i.balance_status_message,
      i.live_checked_at as item_live_checked_at,
      i.bank_updated_at,
      i.connected_at
    from plaid_accounts a
    left join plaid_items i
      on i.item_id = a.item_id
    order by a.name
  `;

  const mapped = rows.map((row): PlaidBankAccount & { itemConnectedAt: string | null } => {
    const balance = freshestBalance(row);
    const accountLiveAt = isoTimestamp(row.live_checked_at);
    const itemLiveAt = isoTimestamp(row.item_live_checked_at);

    return {
      id: row.plaid_account_id,
      itemId: row.item_id,
      name: row.name,
      officialName: row.official_name,
      mask: row.mask,
      type: row.account_type,
      subtype: row.account_subtype,
      availableBalance: balance.available,
      currentBalance: balance.current,
      currency: row.iso_currency_code,
      qboBankAccountId: row.qbo_bank_account_id,
      houseName: row.house_name,
      lastSyncedAt: isoTimestamp(row.last_synced_at),
      updatedAt: row.updated_at.toISOString(),
      institutionId: row.institution_id,
      institutionName: row.institution_name,
      balanceAsOf: balance.asOf,
      balanceSource: balance.source,
      reportedByBank: !itemLiveAt || (accountLiveAt !== null && accountLiveAt >= itemLiveAt),
      connectionStatus: connectionHealth(row.balance_status),
      connectionMessage: row.balance_status_message,
      itemConnectedAt: isoTimestamp(row.connected_at),
    };
  });

  return dedupePlaidAccounts(
    mapped.map((account) => ({
      ...account,
      institutionKey: account.institutionId ?? account.institutionName,
      linked: Boolean(account.qboBankAccountId || account.houseName),
    })),
  ).map((account) => {
    const { institutionKey, linked, itemConnectedAt, ...rest } = account;

    void institutionKey;
    void linked;
    void itemConnectedAt;

    return rest;
  });
}

export function getPlaidBankAccounts() {
  return dedupeInflight("plaid:bank-accounts", loadPlaidBankAccounts);
}

export type PlaidBankAccountExportRow = {
  name: string;
  official_name: string | null;
  mask: string | null;
  current_balance: number | null;
  available_balance: number | null;
  currency: string | null;
  linked_house_name: string | null;
  linked_qbo_bank_account_id: string | null;
  last_synced_at: string | null;
  balance_as_of: string | null;
  balance_source: "live" | "bank_update" | "unknown";
};

export type PlaidBankAccountExport = {
  available: boolean;
  accounts: PlaidBankAccountExportRow[];
  reason?: string;
};

function moneyOrNull(value: string | null) {
  return value === null ? null : Number(value);
}

function isoTimestamp(value: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function readPlaidBankAccountsForExport(): Promise<PlaidBankAccountExport> {
  if (!hasDatabaseUrl()) {
    return {
      available: false,
      accounts: [],
      reason: "DATABASE_URL is not configured.",
    };
  }

  try {
    const tables = await sql()<
      Array<{
        accounts: string | null;
        items: string | null;
      }>
    >`
      select
        to_regclass('plaid_accounts')::text as accounts,
        to_regclass('plaid_items')::text as items
    `;
    const present = tables[0];

    if (!present?.accounts || !present.items) {
      return {
        available: false,
        accounts: [],
        reason: "Plaid tables are not present.",
      };
    }

    // to_jsonb lookups read the live-balance columns as null on databases that have not
    // added them yet, because this export never creates or alters tables.
    const rows = await sql()<
      Array<
        FreshnessColumns & {
          plaid_account_id: string;
          name: string;
          official_name: string | null;
          mask: string | null;
          account_type: string | null;
          iso_currency_code: string | null;
          house_name: string | null;
          qbo_bank_account_id: string | null;
          updated_at: Date | string;
          institution_id: string | null;
          institution_name: string | null;
          connected_at: Date | string | null;
          last_synced_at: Date | string | null;
        }
      >
    >`
      select
        a.plaid_account_id,
        a.name,
        a.official_name,
        a.mask,
        a.account_type,
        a.current_balance,
        a.available_balance,
        to_jsonb(a) ->> 'live_current_balance' as live_current_balance,
        to_jsonb(a) ->> 'live_available_balance' as live_available_balance,
        to_jsonb(a) ->> 'live_checked_at' as live_checked_at,
        to_jsonb(i) ->> 'bank_updated_at' as bank_updated_at,
        a.iso_currency_code,
        a.house_name,
        a.qbo_bank_account_id,
        a.updated_at,
        i.institution_id,
        i.institution_name,
        i.connected_at,
        i.last_synced_at
      from plaid_accounts a
      left join plaid_items i
        on i.item_id = a.item_id
      order by a.name
    `;
    const deduped = dedupePlaidAccounts(
      rows.map((row) => {
        const balance = freshestBalance(row);

        return {
          row,
          balance,
          id: row.plaid_account_id,
          mask: row.mask,
          institutionKey: row.institution_id ?? row.institution_name,
          type: row.account_type,
          balanceAsOf: balance.asOf,
          updatedAt: isoTimestamp(row.updated_at) ?? "",
          linked: Boolean(row.qbo_bank_account_id || row.house_name),
          itemConnectedAt: isoTimestamp(row.connected_at),
        };
      }),
    );

    return {
      available: true,
      accounts: deduped.map(({ row, balance }) => ({
        name: row.name,
        official_name: row.official_name,
        mask: row.mask,
        current_balance: balance.current,
        available_balance: balance.available,
        currency: row.iso_currency_code,
        linked_house_name: row.house_name,
        linked_qbo_bank_account_id: row.qbo_bank_account_id,
        last_synced_at: isoTimestamp(row.last_synced_at),
        balance_as_of: balance.asOf,
        balance_source: balance.source,
      })),
    };
  } catch {
    return {
      available: false,
      accounts: [],
      reason: "Plaid bank data is not available.",
    };
  }
}

export async function linkPlaidAccountToHouse({
  houseName,
  plaidAccountId,
  qboBankAccountId,
}: {
  houseName: string;
  plaidAccountId: string;
  qboBankAccountId: string;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required before mapping a bank account.");
  }

  await ensurePlaidTables();

  return sql().begin(async (transaction) => {
    const selected = await transaction<
      Array<{
        plaid_account_id: string;
        qbo_bank_account_id: string | null;
        house_name: string | null;
      }>
    >`
      select plaid_account_id, qbo_bank_account_id, house_name
      from plaid_accounts
      where plaid_account_id = ${plaidAccountId}
      for update
    `;
    const account = selected[0];

    if (!account) {
      throw new Error("The selected Plaid account was not found.");
    }

    if (
      account.qbo_bank_account_id &&
      account.qbo_bank_account_id !== qboBankAccountId
    ) {
      throw new Error(
        `This account is already linked to ${account.house_name ?? "another project"}.`,
      );
    }

    await transaction`
      update plaid_accounts
      set qbo_bank_account_id = null, house_name = null, updated_at = now()
      where qbo_bank_account_id = ${qboBankAccountId}
        and plaid_account_id <> ${plaidAccountId}
    `;

    const updated = await transaction<
      Array<{
        plaid_account_id: string;
        name: string;
        current_balance: string | null;
        available_balance: string | null;
      }>
    >`
      update plaid_accounts
      set
        qbo_bank_account_id = ${qboBankAccountId},
        house_name = ${houseName},
        updated_at = now()
      where plaid_account_id = ${plaidAccountId}
      returning plaid_account_id, name, current_balance, available_balance
    `;
    const linked = updated[0];

    return {
      id: linked.plaid_account_id,
      name: linked.name,
      currentBalance:
        linked.current_balance === null ? null : Number(linked.current_balance),
      availableBalance:
        linked.available_balance === null ? null : Number(linked.available_balance),
    };
  });
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
