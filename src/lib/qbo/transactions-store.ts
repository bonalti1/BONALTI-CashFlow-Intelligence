import { hasDatabaseUrl, sql } from "@/lib/db/raw";
import { runOnce } from "@/lib/db/run-once";
import { dedupeInflight } from "@/lib/performance/ttl-cache";

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
  Amount?: number;
  AccountRef?: {
    value?: string;
    name?: string;
  };
  BankAccountRef?: {
    value?: string;
    name?: string;
  };
  FromAccountRef?: {
    value?: string;
    name?: string;
  };
  ToAccountRef?: {
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

const ensureTransactionTables = runOnce(initializeTransactionTables);

export function ensureQboTransactionTables() {
  return ensureTransactionTables();
}

async function initializeTransactionTables() {
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
    totalAmount: transaction.TotalAmt ?? transaction.Amount ?? 0,
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

type TransactionColumnRow = {
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
};

function dateOnly(value: Date | string | null) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
}

function transactionFromColumns(
  row: TransactionColumnRow,
  raw: QboMoneyTransaction = { Id: row.qbo_id },
): SavedQboTransaction {
  return {
    source: row.source,
    id: row.qbo_id,
    realmId: row.realm_id,
    txnDate: dateOnly(row.txn_date),
    bankAccountId: row.bank_account_qbo_id,
    bankAccountName: row.bank_account_name,
    payeeName: row.payee_name,
    totalAmount: Number(row.total_amount),
    paymentType: row.payment_type,
    docNumber: row.doc_number,
    memo: row.memo,
    clearedStatus: row.cleared_status,
    clearedStatusRaw: row.cleared_status_raw,
    expenseAccountIds: row.expense_account_ids ?? [],
    expenseAccountNames: row.expense_account_names ?? [],
    raw,
  };
}

function payeeLabel(payeeName: string | null) {
  const trimmed = payeeName?.trim();

  return trimmed ? trimmed : "No payee listed";
}

async function loadTransactionsByBankAccount() {
  if (!hasDatabaseUrl()) {
    return new Map<string, SavedQboTransaction[]>();
  }

  await ensureTransactionTables();
  const rows = await sql()<Array<TransactionColumnRow>>`
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
      expense_account_names
    from qbo_money_transactions
    where bank_account_qbo_id is not null
    order by txn_date desc nulls last, updated_at desc
  `;
  const grouped = new Map<string, SavedQboTransaction[]>();

  for (const row of rows) {
    const item = transactionFromColumns(row);
    const existing = grouped.get(row.bank_account_qbo_id!) ?? [];

    existing.push(item);
    grouped.set(row.bank_account_qbo_id!, existing);
  }

  return grouped;
}

export function getTransactionsByBankAccount() {
  return dedupeInflight("qbo:transactions-by-bank", loadTransactionsByBankAccount);
}

export async function getTransactionsForBankAccounts(bankAccountIds: string[]) {
  if (!hasDatabaseUrl() || bankAccountIds.length === 0) {
    return [] as SavedQboTransaction[];
  }

  await ensureTransactionTables();
  const rows = await sql()<Array<TransactionColumnRow>>`
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
      expense_account_names
    from qbo_money_transactions
    where bank_account_qbo_id = any(${bankAccountIds})
    order by txn_date desc nulls last, updated_at desc
  `;

  return rows.map((row) => transactionFromColumns(row));
}

export type PayeeSummaryRow = {
  name: string;
  totalPaid: number;
  paymentCount: number;
  firstPaymentDate: string | null;
  lastPaymentDate: string | null;
  bankAccounts: string[];
  transactions: SavedQboTransaction[];
};

export async function listPayeeSummaries() {
  if (!hasDatabaseUrl()) {
    return [] as PayeeSummaryRow[];
  }

  await ensureTransactionTables();
  const [summaries, recent] = await Promise.all([
    sql()<
      Array<{
        payee_name: string;
        total_paid: string;
        payment_count: number;
        first_payment_date: Date | null;
        last_payment_date: Date | null;
        bank_account_names: Array<string | null>;
      }>
    >`
      select
        coalesce(nullif(btrim(payee_name), ''), 'No payee listed') as payee_name,
        sum(abs(total_amount)) as total_paid,
        count(*)::int as payment_count,
        min(txn_date) as first_payment_date,
        max(txn_date) as last_payment_date,
        array_agg(bank_account_name order by txn_date desc nulls last) as bank_account_names
      from qbo_money_transactions
      where bank_account_qbo_id is not null
        and total_amount <> 0
      group by 1
      order by total_paid desc, payee_name
    `,
    sql()<
      Array<{
        payee_name: string;
        source: string;
        qbo_id: string;
        txn_date: Date | null;
        bank_account_name: string | null;
        amount: string;
      }>
    >`
      select payee_name, source, qbo_id, txn_date, bank_account_name, amount
      from (
        select
          coalesce(nullif(btrim(payee_name), ''), 'No payee listed') as payee_name,
          source,
          qbo_id,
          txn_date,
          bank_account_name,
          abs(total_amount) as amount,
          row_number() over (
            partition by coalesce(nullif(btrim(payee_name), ''), 'No payee listed')
            order by txn_date desc nulls last, updated_at desc
          ) as rn
        from qbo_money_transactions
        where bank_account_qbo_id is not null
          and total_amount <> 0
      ) recent
      where rn <= 3
      order by payee_name, rn
    `,
  ]);
  const recentByPayee = new Map<string, SavedQboTransaction[]>();

  for (const row of recent) {
    const existing = recentByPayee.get(row.payee_name) ?? [];

    existing.push({
      source: row.source,
      id: row.qbo_id,
      realmId: "",
      txnDate: dateOnly(row.txn_date),
      bankAccountId: null,
      bankAccountName: row.bank_account_name,
      payeeName: row.payee_name,
      totalAmount: Number(row.amount),
      paymentType: null,
      docNumber: null,
      memo: null,
      clearedStatus: "unknown",
      clearedStatusRaw: null,
      expenseAccountIds: [],
      expenseAccountNames: [],
      raw: { Id: row.qbo_id },
    });
    recentByPayee.set(row.payee_name, existing);
  }

  return summaries.map((row): PayeeSummaryRow => {
    const bankAccounts: string[] = [];

    for (const name of row.bank_account_names ?? []) {
      if (name && !bankAccounts.includes(name)) {
        bankAccounts.push(name);
      }
    }

    return {
      name: row.payee_name,
      totalPaid: Number(row.total_paid),
      paymentCount: row.payment_count,
      firstPaymentDate: dateOnly(row.first_payment_date),
      lastPaymentDate: dateOnly(row.last_payment_date),
      bankAccounts,
      transactions: recentByPayee.get(row.payee_name) ?? [],
    };
  });
}

export async function getPayeeTransactions(payeeName: string) {
  if (!hasDatabaseUrl()) {
    return [] as SavedQboTransaction[];
  }

  await ensureTransactionTables();
  const rows = await sql()<Array<TransactionColumnRow>>`
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
      expense_account_names
    from qbo_money_transactions
    where bank_account_qbo_id is not null
      and coalesce(nullif(btrim(payee_name), ''), 'No payee listed') = ${payeeLabel(payeeName)}
    order by txn_date desc nulls last, updated_at desc
  `;

  return rows.map((row) => transactionFromColumns(row));
}

export type ProjectLedgerTransaction = SavedQboTransaction & {
  direction: "expense" | "transfer_in" | "transfer_out";
  countsTowardSpend: boolean;
};

export async function getProjectLedgerTransactions(qboBankAccountId: string) {
  if (!hasDatabaseUrl()) {
    return [];
  }

  await ensureTransactionTables();
  const rows = await sql()<
    Array<
      TransactionColumnRow & {
        from_account_ref: { value?: string; name?: string } | null;
        to_account_ref: { value?: string; name?: string } | null;
      }
    >
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
      raw -> 'FromAccountRef' as from_account_ref,
      raw -> 'ToAccountRef' as to_account_ref
    from qbo_money_transactions
    where bank_account_qbo_id = ${qboBankAccountId}
      or (
        source = 'Transfer'
        and (
          raw -> 'FromAccountRef' ->> 'value' = ${qboBankAccountId}
          or raw -> 'ToAccountRef' ->> 'value' = ${qboBankAccountId}
        )
      )
    order by txn_date desc nulls last, updated_at desc
  `;

  return rows.map((row): ProjectLedgerTransaction => {
    const isTransfer = row.source === "Transfer";
    const transferIn = isTransfer && row.to_account_ref?.value === qboBankAccountId;

    return {
      ...transactionFromColumns(row, {
        Id: row.qbo_id,
        FromAccountRef: row.from_account_ref ?? undefined,
        ToAccountRef: row.to_account_ref ?? undefined,
      }),
      direction: isTransfer ? (transferIn ? "transfer_in" : "transfer_out") : "expense",
      countsTowardSpend: !isTransfer,
    };
  });
}
