import { hasDatabaseUrl, sql } from "@/lib/db/raw";

export type QboTransactionLine = {
  Id?: string;
  LineNum?: number;
  Description?: string;
  Amount?: number;
  DetailType?: string;
  AccountBasedExpenseLineDetail?: {
    AccountRef?: {
      value?: string;
      name?: string;
    };
  };
  ItemBasedExpenseLineDetail?: {
    ItemRef?: {
      value?: string;
      name?: string;
    };
  };
};

export type QboMoneyTransaction = {
  Id: string;
  SyncToken?: string;
  TxnDate?: string;
  DocNumber?: string;
  PrivateNote?: string;
  PaymentType?: string;
  TotalAmt?: number;
  AccountRef?: {
    value?: string;
    name?: string;
  };
  BankAccountRef?: {
    value?: string;
    name?: string;
  };
  EntityRef?: {
    value?: string;
    name?: string;
    type?: string;
  };
  PayeeRef?: {
    value?: string;
    name?: string;
  };
  Line?: QboTransactionLine[];
  MetaData?: {
    CreateTime?: string;
    LastUpdatedTime?: string;
  };
  [key: string]: unknown;
};

export type SavedQboTransaction = {
  source: string;
  id: string;
  realmId: string;
  txnDate: string | null;
  bankAccountId: string | null;
  bankAccountName: string | null;
  payeeName: string | null;
  totalAmount: number;
  paymentType: string | null;
  docNumber: string | null;
  memo: string | null;
  clearedStatus: "cleared" | "not_cleared" | "unknown";
  clearedStatusRaw: string | null;
  expenseAccountIds: string[];
  expenseAccountNames: string[];
  raw: QboMoneyTransaction;
};

type TransactionSnapshot = {
  realmId: string;
  syncedAt: string;
  total: number;
  transactions: SavedQboTransaction[];
};

async function ensureTransactionTables() {
  await sql()`
    create table if not exists qbo_transaction_snapshots (
      realm_id text primary key,
      synced_at timestamptz not null,
      total integer not null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql()`
    create table if not exists qbo_money_transactions (
      qbo_id text not null,
      source text not null,
      realm_id text not null,
      txn_date date,
      bank_account_qbo_id text,
      bank_account_name text,
      payee_name text,
      total_amount numeric not null default 0,
      payment_type text,
      doc_number text,
      memo text,
      cleared_status text not null default 'unknown',
      cleared_status_raw text,
      expense_account_ids text[] not null default '{}',
      expense_account_names text[] not null default '{}',
      raw jsonb not null,
      updated_at timestamptz not null default now(),
      primary key (realm_id, source, qbo_id)
    )
  `;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rawStatusValue(transaction: QboMoneyTransaction) {
  const directKeys = [
    "Cleared",
    "cleared",
    "Reconciled",
    "reconciled",
    "ReconcileStatus",
    "reconcileStatus",
    "ClearedStatus",
    "clearedStatus",
    "TxnStatus",
    "txnStatus",
    "Status",
    "status",
  ];

  for (const key of directKeys) {
    const value = transaction[key];

    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }

    const status = stringValue(value);

    if (status) {
      return status;
    }
  }

  return null;
}

function normalizeClearedStatus(rawStatus: string | null) {
  const status = rawStatus?.toLowerCase().replace(/[\s_-]/g, "") ?? "";

  if (["true", "cleared", "reconciled"].includes(status)) {
    return "cleared" as const;
  }

  if (["false", "uncleared", "notcleared", "notreconciled"].includes(status)) {
    return "not_cleared" as const;
  }

  return "unknown" as const;
}

export function normalizeQboTransaction({
  realmId,
  source,
  transaction,
}: {
  realmId: string;
  source: string;
  transaction: QboMoneyTransaction;
}): SavedQboTransaction {
  const bankAccountRef = transaction.AccountRef ?? transaction.BankAccountRef;
  const payee = transaction.EntityRef ?? transaction.PayeeRef;
  const lines = transaction.Line ?? [];
  const expenseRefs = lines
    .map((line) => line.AccountBasedExpenseLineDetail?.AccountRef)
    .filter((ref): ref is { value?: string; name?: string } => Boolean(ref?.value));
  const rawClearedStatus = rawStatusValue(transaction);

  return {
    source,
    id: transaction.Id,
    realmId,
    txnDate: transaction.TxnDate ?? null,
    bankAccountId: bankAccountRef?.value ?? null,
    bankAccountName: bankAccountRef?.name ?? null,
    payeeName: payee?.name ?? null,
    totalAmount: transaction.TotalAmt ?? 0,
    paymentType: transaction.PaymentType ?? null,
    docNumber: transaction.DocNumber ?? null,
    memo: transaction.PrivateNote ?? null,
    clearedStatus: normalizeClearedStatus(rawClearedStatus),
    clearedStatusRaw: rawClearedStatus,
    expenseAccountIds: expenseRefs.map((ref) => ref.value!).filter(Boolean),
    expenseAccountNames: expenseRefs.map((ref) => ref.name ?? "").filter(Boolean),
    raw: transaction,
  };
}

export async function saveTransactionsSnapshot(snapshot: TransactionSnapshot) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required before syncing QuickBooks transactions.");
  }

  await ensureTransactionTables();
  await sql().begin(async (transaction) => {
    await transaction`
      insert into qbo_transaction_snapshots (realm_id, synced_at, total, updated_at)
      values (${snapshot.realmId}, ${snapshot.syncedAt}, ${snapshot.total}, now())
      on conflict (realm_id) do update set
        synced_at = excluded.synced_at,
        total = excluded.total,
        updated_at = now()
    `;

    for (const item of snapshot.transactions) {
      await transaction`
        insert into qbo_money_transactions (
          qbo_id,
          source,
          realm_id,
          txn_date,
          bank_account_qbo_id,
          bank_account_name,
          payee_name,
          total_amount,
          payment_type,
          doc_number,
          memo,
          cleared_status,
          cleared_status_raw,
          expense_account_ids,
          expense_account_names,
          raw,
          updated_at
        )
        values (
          ${item.id},
          ${item.source},
          ${item.realmId},
          ${item.txnDate},
          ${item.bankAccountId},
          ${item.bankAccountName},
          ${item.payeeName},
          ${item.totalAmount},
          ${item.paymentType},
          ${item.docNumber},
          ${item.memo},
          ${item.clearedStatus},
          ${item.clearedStatusRaw},
          ${item.expenseAccountIds},
          ${item.expenseAccountNames},
          ${transaction.json(JSON.parse(JSON.stringify(item.raw)))},
          now()
        )
        on conflict (realm_id, source, qbo_id) do update set
          txn_date = excluded.txn_date,
          bank_account_qbo_id = excluded.bank_account_qbo_id,
          bank_account_name = excluded.bank_account_name,
          payee_name = excluded.payee_name,
          total_amount = excluded.total_amount,
          payment_type = excluded.payment_type,
          doc_number = excluded.doc_number,
          memo = excluded.memo,
          cleared_status = excluded.cleared_status,
          cleared_status_raw = excluded.cleared_status_raw,
          expense_account_ids = excluded.expense_account_ids,
          expense_account_names = excluded.expense_account_names,
          raw = excluded.raw,
          updated_at = now()
      `;
    }
  });

  return snapshot;
}

export async function getTransactionsSnapshotStatus() {
  if (!hasDatabaseUrl()) {
    return {
      synced: false,
    };
  }

  try {
    await ensureTransactionTables();
    const rows = await sql()<
      Array<{
        realm_id: string;
        synced_at: Date;
        total: number;
      }>
    >`
      select realm_id, synced_at, total
      from qbo_transaction_snapshots
      order by updated_at desc
      limit 1
    `;
    const snapshot = rows[0];

    if (!snapshot) {
      return {
        synced: false,
      };
    }

    return {
      synced: true,
      realmId: snapshot.realm_id,
      syncedAt: snapshot.synced_at.toISOString(),
      total: snapshot.total,
    };
  } catch {
    return {
      synced: false,
    };
  }
}

export async function getTransactionsByBankAccount() {
  if (!hasDatabaseUrl()) {
    return new Map<string, SavedQboTransaction[]>();
  }

  await ensureTransactionTables();
  const rows = await sql()<
    Array<{
      qbo_id: string;
      source: string;
      realm_id: string;
      txn_date: Date | null;
      bank_account_qbo_id: string | null;
      bank_account_name: string | null;
      payee_name: string | null;
      total_amount: string;
      payment_type: string | null;
      doc_number: string | null;
      memo: string | null;
      cleared_status: "cleared" | "not_cleared" | "unknown";
      cleared_status_raw: string | null;
      expense_account_ids: string[];
      expense_account_names: string[];
      raw: QboMoneyTransaction;
    }>
  >`
    select
      qbo_id,
      source,
      realm_id,
      txn_date,
      bank_account_qbo_id,
      bank_account_name,
      payee_name,
      total_amount,
      payment_type,
      doc_number,
      memo,
      cleared_status,
      cleared_status_raw,
      expense_account_ids,
      expense_account_names,
      raw
    from qbo_money_transactions
    where bank_account_qbo_id is not null
    order by txn_date desc nulls last, updated_at desc
  `;
  const grouped = new Map<string, SavedQboTransaction[]>();

  for (const row of rows) {
    const item: SavedQboTransaction = {
      source: row.source,
      id: row.qbo_id,
      realmId: row.realm_id,
      txnDate: row.txn_date?.toISOString().slice(0, 10) ?? null,
      bankAccountId: row.bank_account_qbo_id,
      bankAccountName: row.bank_account_name,
      payeeName: row.payee_name,
      totalAmount: Number(row.total_amount),
      paymentType: row.payment_type,
      docNumber: row.doc_number,
      memo: row.memo,
      clearedStatus: row.cleared_status,
      clearedStatusRaw: row.cleared_status_raw,
      expenseAccountIds: row.expense_account_ids,
      expenseAccountNames: row.expense_account_names,
      raw: row.raw,
    };
    const existing = grouped.get(row.bank_account_qbo_id!) ?? [];

    existing.push(item);
    grouped.set(row.bank_account_qbo_id!, existing);
  }

  return grouped;
}
