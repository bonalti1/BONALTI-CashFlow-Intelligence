import { hasDatabaseUrl, sql } from "@/lib/db/raw";

type QboRef = {
  value?: string;
  name?: string;
};

type QboCurrencyRef = QboRef;

type QboMetaData = {
  CreateTime?: string;
  LastUpdatedTime?: string;
};

export type QboInvoice = {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  PrivateNote?: string;
  CustomerMemo?: {
    value?: string;
  };
  CustomerRef?: QboRef;
  CurrencyRef?: QboCurrencyRef;
  TotalAmt?: number;
  Balance?: number;
  MetaData?: QboMetaData;
  [key: string]: unknown;
};

export type QboBill = {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  PrivateNote?: string;
  VendorRef?: QboRef;
  CurrencyRef?: QboCurrencyRef;
  TotalAmt?: number;
  Balance?: number;
  Line?: Array<{
    AccountBasedExpenseLineDetail?: {
      AccountRef?: QboRef;
    };
  }>;
  MetaData?: QboMetaData;
  [key: string]: unknown;
};

export type QboCustomer = {
  Id: string;
  DisplayName?: string;
  FullyQualifiedName?: string;
  CompanyName?: string;
  ParentRef?: QboRef;
  Job?: boolean;
  Active?: boolean;
  Balance?: number;
  MetaData?: QboMetaData;
  [key: string]: unknown;
};

export type SavedQboInvoice = {
  id: string;
  realmId: string;
  invoiceNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  invoiceStatus: "open" | "paid" | "unknown";
  invoiceDate: string | null;
  dueDate: string | null;
  paidDate: string | null;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  currency: string;
  memo: string | null;
  sourceUpdatedAt: string | null;
  raw: QboInvoice;
};

export type SavedQboBill = {
  id: string;
  realmId: string;
  billNumber: string | null;
  vendorId: string | null;
  vendorName: string | null;
  billStatus: "open" | "paid" | "unknown";
  billDate: string | null;
  dueDate: string | null;
  paidDate: string | null;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  currency: string;
  costCategory: string | null;
  memo: string | null;
  sourceUpdatedAt: string | null;
  raw: QboBill;
};

export type SavedQboCustomer = {
  id: string;
  realmId: string;
  displayName: string | null;
  companyName: string | null;
  fullyQualifiedName: string | null;
  parentCustomerId: string | null;
  parentCustomerName: string | null;
  projectName: string | null;
  isProject: boolean;
  active: boolean | null;
  balance: number;
  sourceUpdatedAt: string | null;
  raw: QboCustomer;
};

export type FinanceObjectsSnapshot = {
  realmId: string;
  syncedAt: string;
  invoices: SavedQboInvoice[];
  bills: SavedQboBill[];
  customers: SavedQboCustomer[];
  warnings: string[];
};

async function ensureFinanceObjectTables() {
  await sql()`
    create table if not exists qbo_invoice_snapshots (
      realm_id text primary key,
      synced_at timestamptz not null,
      total integer not null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql()`
    create table if not exists qbo_invoices (
      qbo_id text not null,
      realm_id text not null,
      invoice_number text,
      customer_qbo_id text,
      customer_name text,
      invoice_status text not null default 'unknown',
      invoice_date date,
      due_date date,
      paid_date date,
      total_amount numeric not null default 0,
      paid_amount numeric not null default 0,
      balance_due numeric not null default 0,
      currency text not null default 'USD',
      memo text,
      source_updated_at timestamptz,
      raw jsonb not null,
      updated_at timestamptz not null default now(),
      primary key (realm_id, qbo_id)
    )
  `;
  await sql()`
    create table if not exists qbo_bill_snapshots (
      realm_id text primary key,
      synced_at timestamptz not null,
      total integer not null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql()`
    create table if not exists qbo_vendor_bills (
      qbo_id text not null,
      realm_id text not null,
      bill_number text,
      vendor_qbo_id text,
      vendor_name text,
      bill_status text not null default 'unknown',
      bill_date date,
      due_date date,
      paid_date date,
      total_amount numeric not null default 0,
      paid_amount numeric not null default 0,
      balance_due numeric not null default 0,
      currency text not null default 'USD',
      cost_category text,
      memo text,
      source_updated_at timestamptz,
      raw jsonb not null,
      updated_at timestamptz not null default now(),
      primary key (realm_id, qbo_id)
    )
  `;
  await sql()`
    create table if not exists qbo_customer_snapshots (
      realm_id text primary key,
      synced_at timestamptz not null,
      total integer not null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql()`
    create table if not exists qbo_customers (
      qbo_id text not null,
      realm_id text not null,
      display_name text,
      company_name text,
      fully_qualified_name text,
      parent_customer_qbo_id text,
      parent_customer_name text,
      project_name text,
      is_project boolean not null default false,
      active boolean,
      balance numeric not null default 0,
      source_updated_at timestamptz,
      raw jsonb not null,
      updated_at timestamptz not null default now(),
      primary key (realm_id, qbo_id)
    )
  `;
}

function statusFromBalance(balance: number) {
  if (!Number.isFinite(balance)) {
    return "unknown" as const;
  }

  return balance <= 0 ? "paid" as const : "open" as const;
}

function paidDateFromBalance(balance: number) {
  return balance <= 0 ? null : null;
}

function memoFromInvoice(invoice: QboInvoice) {
  return invoice.PrivateNote ?? invoice.CustomerMemo?.value ?? null;
}

export function normalizeQboInvoice({
  realmId,
  invoice,
}: {
  realmId: string;
  invoice: QboInvoice;
}): SavedQboInvoice {
  const totalAmount = invoice.TotalAmt ?? 0;
  const balanceDue = invoice.Balance ?? 0;
  const paidAmount = Math.max(totalAmount - balanceDue, 0);

  return {
    id: invoice.Id,
    realmId,
    invoiceNumber: invoice.DocNumber ?? null,
    customerId: invoice.CustomerRef?.value ?? null,
    customerName: invoice.CustomerRef?.name ?? null,
    invoiceStatus: statusFromBalance(balanceDue),
    invoiceDate: invoice.TxnDate ?? null,
    dueDate: invoice.DueDate ?? null,
    paidDate: paidDateFromBalance(balanceDue),
    totalAmount,
    paidAmount,
    balanceDue,
    currency: invoice.CurrencyRef?.value ?? "USD",
    memo: memoFromInvoice(invoice),
    sourceUpdatedAt: invoice.MetaData?.LastUpdatedTime ?? null,
    raw: invoice,
  };
}

function billCostCategory(bill: QboBill) {
  const refs = bill.Line
    ?.map((line) => line.AccountBasedExpenseLineDetail?.AccountRef?.name)
    .filter((name): name is string => Boolean(name));

  return refs?.[0] ?? null;
}

export function normalizeQboBill({
  realmId,
  bill,
}: {
  realmId: string;
  bill: QboBill;
}): SavedQboBill {
  const totalAmount = bill.TotalAmt ?? 0;
  const balanceDue = bill.Balance ?? 0;
  const paidAmount = Math.max(totalAmount - balanceDue, 0);

  return {
    id: bill.Id,
    realmId,
    billNumber: bill.DocNumber ?? null,
    vendorId: bill.VendorRef?.value ?? null,
    vendorName: bill.VendorRef?.name ?? null,
    billStatus: statusFromBalance(balanceDue),
    billDate: bill.TxnDate ?? null,
    dueDate: bill.DueDate ?? null,
    paidDate: paidDateFromBalance(balanceDue),
    totalAmount,
    paidAmount,
    balanceDue,
    currency: bill.CurrencyRef?.value ?? "USD",
    costCategory: billCostCategory(bill),
    memo: bill.PrivateNote ?? null,
    sourceUpdatedAt: bill.MetaData?.LastUpdatedTime ?? null,
    raw: bill,
  };
}

export function normalizeQboCustomer({
  realmId,
  customer,
}: {
  realmId: string;
  customer: QboCustomer;
}): SavedQboCustomer {
  const isProject = Boolean(customer.Job || customer.ParentRef?.value);

  return {
    id: customer.Id,
    realmId,
    displayName: customer.DisplayName ?? null,
    companyName: customer.CompanyName ?? null,
    fullyQualifiedName: customer.FullyQualifiedName ?? null,
    parentCustomerId: customer.ParentRef?.value ?? null,
    parentCustomerName: customer.ParentRef?.name ?? null,
    projectName: isProject
      ? customer.DisplayName ?? customer.FullyQualifiedName ?? customer.CompanyName ?? null
      : null,
    isProject,
    active: customer.Active ?? null,
    balance: customer.Balance ?? 0,
    sourceUpdatedAt: customer.MetaData?.LastUpdatedTime ?? null,
    raw: customer,
  };
}

export async function saveFinanceObjectsSnapshot(snapshot: FinanceObjectsSnapshot) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required before syncing QuickBooks finance objects.");
  }

  await ensureFinanceObjectTables();
  await sql().begin(async (transaction) => {
    await transaction`
      insert into qbo_invoice_snapshots (realm_id, synced_at, total, updated_at)
      values (${snapshot.realmId}, ${snapshot.syncedAt}, ${snapshot.invoices.length}, now())
      on conflict (realm_id) do update set
        synced_at = excluded.synced_at,
        total = excluded.total,
        updated_at = now()
    `;
    await transaction`
      insert into qbo_bill_snapshots (realm_id, synced_at, total, updated_at)
      values (${snapshot.realmId}, ${snapshot.syncedAt}, ${snapshot.bills.length}, now())
      on conflict (realm_id) do update set
        synced_at = excluded.synced_at,
        total = excluded.total,
        updated_at = now()
    `;
    await transaction`
      insert into qbo_customer_snapshots (realm_id, synced_at, total, updated_at)
      values (${snapshot.realmId}, ${snapshot.syncedAt}, ${snapshot.customers.length}, now())
      on conflict (realm_id) do update set
        synced_at = excluded.synced_at,
        total = excluded.total,
        updated_at = now()
    `;

    for (const invoice of snapshot.invoices) {
      await transaction`
        insert into qbo_invoices (
          qbo_id,
          realm_id,
          invoice_number,
          customer_qbo_id,
          customer_name,
          invoice_status,
          invoice_date,
          due_date,
          paid_date,
          total_amount,
          paid_amount,
          balance_due,
          currency,
          memo,
          source_updated_at,
          raw,
          updated_at
        )
        values (
          ${invoice.id},
          ${invoice.realmId},
          ${invoice.invoiceNumber},
          ${invoice.customerId},
          ${invoice.customerName},
          ${invoice.invoiceStatus},
          ${invoice.invoiceDate},
          ${invoice.dueDate},
          ${invoice.paidDate},
          ${invoice.totalAmount},
          ${invoice.paidAmount},
          ${invoice.balanceDue},
          ${invoice.currency},
          ${invoice.memo},
          ${invoice.sourceUpdatedAt},
          ${transaction.json(JSON.parse(JSON.stringify(invoice.raw)))},
          now()
        )
        on conflict (realm_id, qbo_id) do update set
          invoice_number = excluded.invoice_number,
          customer_qbo_id = excluded.customer_qbo_id,
          customer_name = excluded.customer_name,
          invoice_status = excluded.invoice_status,
          invoice_date = excluded.invoice_date,
          due_date = excluded.due_date,
          paid_date = excluded.paid_date,
          total_amount = excluded.total_amount,
          paid_amount = excluded.paid_amount,
          balance_due = excluded.balance_due,
          currency = excluded.currency,
          memo = excluded.memo,
          source_updated_at = excluded.source_updated_at,
          raw = excluded.raw,
          updated_at = now()
      `;
    }

    for (const bill of snapshot.bills) {
      await transaction`
        insert into qbo_vendor_bills (
          qbo_id,
          realm_id,
          bill_number,
          vendor_qbo_id,
          vendor_name,
          bill_status,
          bill_date,
          due_date,
          paid_date,
          total_amount,
          paid_amount,
          balance_due,
          currency,
          cost_category,
          memo,
          source_updated_at,
          raw,
          updated_at
        )
        values (
          ${bill.id},
          ${bill.realmId},
          ${bill.billNumber},
          ${bill.vendorId},
          ${bill.vendorName},
          ${bill.billStatus},
          ${bill.billDate},
          ${bill.dueDate},
          ${bill.paidDate},
          ${bill.totalAmount},
          ${bill.paidAmount},
          ${bill.balanceDue},
          ${bill.currency},
          ${bill.costCategory},
          ${bill.memo},
          ${bill.sourceUpdatedAt},
          ${transaction.json(JSON.parse(JSON.stringify(bill.raw)))},
          now()
        )
        on conflict (realm_id, qbo_id) do update set
          bill_number = excluded.bill_number,
          vendor_qbo_id = excluded.vendor_qbo_id,
          vendor_name = excluded.vendor_name,
          bill_status = excluded.bill_status,
          bill_date = excluded.bill_date,
          due_date = excluded.due_date,
          paid_date = excluded.paid_date,
          total_amount = excluded.total_amount,
          paid_amount = excluded.paid_amount,
          balance_due = excluded.balance_due,
          currency = excluded.currency,
          cost_category = excluded.cost_category,
          memo = excluded.memo,
          source_updated_at = excluded.source_updated_at,
          raw = excluded.raw,
          updated_at = now()
      `;
    }

    for (const customer of snapshot.customers) {
      await transaction`
        insert into qbo_customers (
          qbo_id,
          realm_id,
          display_name,
          company_name,
          fully_qualified_name,
          parent_customer_qbo_id,
          parent_customer_name,
          project_name,
          is_project,
          active,
          balance,
          source_updated_at,
          raw,
          updated_at
        )
        values (
          ${customer.id},
          ${customer.realmId},
          ${customer.displayName},
          ${customer.companyName},
          ${customer.fullyQualifiedName},
          ${customer.parentCustomerId},
          ${customer.parentCustomerName},
          ${customer.projectName},
          ${customer.isProject},
          ${customer.active},
          ${customer.balance},
          ${customer.sourceUpdatedAt},
          ${transaction.json(JSON.parse(JSON.stringify(customer.raw)))},
          now()
        )
        on conflict (realm_id, qbo_id) do update set
          display_name = excluded.display_name,
          company_name = excluded.company_name,
          fully_qualified_name = excluded.fully_qualified_name,
          parent_customer_qbo_id = excluded.parent_customer_qbo_id,
          parent_customer_name = excluded.parent_customer_name,
          project_name = excluded.project_name,
          is_project = excluded.is_project,
          active = excluded.active,
          balance = excluded.balance,
          source_updated_at = excluded.source_updated_at,
          raw = excluded.raw,
          updated_at = now()
      `;
    }
  });

  return snapshot;
}

export async function ensureQboFinanceObjectTablesForExport() {
  if (!hasDatabaseUrl()) {
    return;
  }

  await ensureFinanceObjectTables();
}
