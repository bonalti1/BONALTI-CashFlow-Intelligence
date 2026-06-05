import { NextResponse } from "next/server";

import { hasDatabaseUrl, sql } from "@/lib/db/raw";
import { ensureQboFinanceObjectTablesForExport } from "@/lib/qbo/finance-objects-store";

export const runtime = "nodejs";

type CashSnapshotRow = {
  source_account_id: string;
  account_name: string;
  fully_qualified_name: string | null;
  account_type: string | null;
  account_sub_type: string | null;
  classification: string | null;
  balance: string | null;
  active: boolean | null;
  house_name: string | null;
  house_city: string | null;
  source_updated_at: Date;
};

type JobCostRow = {
  source_job_id: string;
  house_name: string;
  phase_key: string;
  phase_label: string;
  phase_name: string;
  sale_price: string | null;
  square_feet: number | null;
  city: string | null;
  budget_amount: string | null;
  spent_amount: string;
  transaction_count: number;
  over_budget_amount: string;
  status: string;
  calculated_at: Date;
};

type PaymentRow = {
  qbo_id: string;
  source: string;
  realm_id: string;
  txn_date: Date | null;
  bank_account_qbo_id: string | null;
  bank_account_name: string | null;
  house_name: string | null;
  payee_name: string | null;
  total_amount: string;
  payment_type: string | null;
  doc_number: string | null;
  memo: string | null;
  cleared_status: string;
  cleared_status_raw: string | null;
  expense_account_ids: string[];
  expense_account_names: string[];
  updated_at: Date;
};

type InvoiceRow = {
  qbo_id: string;
  invoice_number: string | null;
  customer_name: string | null;
  invoice_status: string;
  invoice_date: Date | null;
  due_date: Date | null;
  paid_date: Date | null;
  total_amount: string;
  paid_amount: string;
  balance_due: string;
  currency: string;
  memo: string | null;
  source_updated_at: Date | null;
  updated_at: Date;
};

type VendorBillRow = {
  qbo_id: string;
  bill_number: string | null;
  vendor_name: string | null;
  bill_status: string;
  bill_date: Date | null;
  due_date: Date | null;
  paid_date: Date | null;
  total_amount: string;
  paid_amount: string;
  balance_due: string;
  currency: string;
  cost_category: string | null;
  memo: string | null;
  source_updated_at: Date | null;
  updated_at: Date;
};

type CustomerRow = {
  qbo_id: string;
  display_name: string | null;
  company_name: string | null;
  fully_qualified_name: string | null;
  parent_customer_qbo_id: string | null;
  project_name: string | null;
  is_project: boolean;
  active: boolean | null;
  balance: string;
  source_updated_at: Date | null;
  raw: Record<string, unknown>;
  updated_at: Date;
};

function numberOrNull(value: string | null) {
  return value === null ? null : Number(value);
}

function dateOrNull(value: Date | null) {
  return value?.toISOString() ?? null;
}

function isAuthorized(request: Request) {
  const expectedToken = process.env.AI_CSUITE_EXPORT_TOKEN;

  if (!expectedToken) {
    return {
      ok: false,
      status: 500,
      message: "AI_CSUITE_EXPORT_TOKEN is not configured.",
    };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || token !== expectedToken) {
    return {
      ok: false,
      status: 401,
      message: "Missing or invalid bearer token.",
    };
  }

  return {
    ok: true,
  };
}

function cashBucketType(row: CashSnapshotRow) {
  const name = `${row.account_name} ${row.fully_qualified_name ?? ""}`.toLowerCase();

  if (row.house_name) {
    return "house";
  }

  if (
    name.includes("marketing") ||
    name.includes("payroll") ||
    name.includes("operating") ||
    name.includes("operation") ||
    name.includes("income clearing") ||
    name.includes("gas") ||
    name === "cash"
  ) {
    return "internal";
  }

  return "other";
}

async function getCashSnapshots() {
  const rows = await sql()<CashSnapshotRow[]>`
    select
      a.qbo_id as source_account_id,
      a.name as account_name,
      a.fully_qualified_name,
      a.account_type,
      a.account_sub_type,
      a.classification,
      a.current_balance as balance,
      a.active,
      h.house_name,
      h.city as house_city,
      a.updated_at as source_updated_at
    from qb_accounts a
    left join house_details h
      on h.qbo_bank_account_id = a.qbo_id
    where a.account_type = 'Bank'
    order by coalesce(h.house_name, a.name)
  `;

  return rows.map((row) => ({
    source_system: "quickbooks",
    source_table: "qb_accounts",
    source_account_id: row.source_account_id,
    account_name: row.account_name,
    fully_qualified_name: row.fully_qualified_name,
    account_type: row.account_type,
    account_sub_type: row.account_sub_type,
    classification: row.classification,
    cash_bucket_type: cashBucketType(row),
    house_name: row.house_name,
    house_city: row.house_city,
    balance: numberOrNull(row.balance),
    currency: "USD",
    active: row.active,
    snapshot_at: row.source_updated_at.toISOString(),
  }));
}

async function getJobCosts() {
  const rows = await sql()<JobCostRow[]>`
    select
      bank_account_qbo_id as source_job_id,
      house_name,
      phase_key,
      phase_label,
      phase_name,
      sale_price,
      square_feet,
      city,
      budget_amount,
      spent_amount,
      transaction_count,
      over_budget_amount,
      status,
      calculated_at
    from cfo_house_phase_actuals
    order by house_name, phase_key
  `;

  return rows.map((row) => ({
    source_system: "cashflow_intelligence",
    source_table: "cfo_house_phase_actuals",
    source_job_id: row.source_job_id,
    project_name: row.house_name,
    house_name: row.house_name,
    phase_key: row.phase_key,
    phase_label: row.phase_label,
    phase_name: row.phase_name,
    sold_price: numberOrNull(row.sale_price),
    square_feet: row.square_feet,
    city: row.city,
    budget_amount: numberOrNull(row.budget_amount),
    actual_amount: Number(row.spent_amount),
    transaction_count: row.transaction_count,
    over_budget_amount: Number(row.over_budget_amount),
    status: row.status,
    calculated_at: row.calculated_at.toISOString(),
  }));
}

async function getPayments() {
  const rows = await sql()<PaymentRow[]>`
    select
      t.qbo_id,
      t.source,
      t.realm_id,
      t.txn_date,
      t.bank_account_qbo_id,
      t.bank_account_name,
      h.house_name,
      t.payee_name,
      t.total_amount,
      t.payment_type,
      t.doc_number,
      t.memo,
      t.cleared_status,
      t.cleared_status_raw,
      t.expense_account_ids,
      t.expense_account_names,
      t.updated_at
    from qbo_money_transactions t
    left join house_details h
      on h.qbo_bank_account_id = t.bank_account_qbo_id
    order by t.txn_date desc nulls last, t.updated_at desc
  `;

  return rows.map((row) => ({
    source_system: "quickbooks",
    source_table: "qbo_money_transactions",
    source_payment_id: `${row.source}:${row.qbo_id}`,
    qbo_id: row.qbo_id,
    qbo_source_type: row.source,
    realm_id: row.realm_id,
    transaction_date: dateOrNull(row.txn_date),
    bank_account_id: row.bank_account_qbo_id,
    bank_account_name: row.bank_account_name,
    project_name: row.house_name,
    house_name: row.house_name,
    payee_name: row.payee_name,
    amount: Number(row.total_amount),
    currency: "USD",
    payment_type: row.payment_type,
    document_number: row.doc_number,
    memo: row.memo,
    cleared_status: row.cleared_status,
    cleared_status_raw: row.cleared_status_raw,
    expense_account_ids: row.expense_account_ids,
    expense_account_names: row.expense_account_names,
    source_updated_at: row.updated_at.toISOString(),
  }));
}

async function getInvoices() {
  const rows = await sql()<InvoiceRow[]>`
    select
      qbo_id,
      invoice_number,
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
      updated_at
    from qbo_invoices
    order by invoice_date desc nulls last, updated_at desc
  `;

  return rows.map((row) => ({
    source_system: "quickbooks",
    source_table: "qbo_invoices",
    source_invoice_id: row.qbo_id,
    invoice_number: row.invoice_number,
    customer_name: row.customer_name,
    invoice_status: row.invoice_status,
    invoice_date: dateOrNull(row.invoice_date),
    due_date: dateOrNull(row.due_date),
    paid_date: dateOrNull(row.paid_date),
    total_amount: Number(row.total_amount),
    paid_amount: Number(row.paid_amount),
    balance_due: Number(row.balance_due),
    currency: row.currency,
    memo: row.memo,
    source_updated_at: dateOrNull(row.source_updated_at ?? row.updated_at),
  }));
}

async function getVendorBills() {
  const rows = await sql()<VendorBillRow[]>`
    select
      qbo_id,
      bill_number,
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
      updated_at
    from qbo_vendor_bills
    order by bill_date desc nulls last, updated_at desc
  `;

  return rows.map((row) => ({
    source_system: "quickbooks",
    source_table: "qbo_vendor_bills",
    source_bill_id: row.qbo_id,
    bill_number: row.bill_number,
    vendor_name: row.vendor_name,
    bill_status: row.bill_status,
    bill_date: dateOrNull(row.bill_date),
    due_date: dateOrNull(row.due_date),
    paid_date: dateOrNull(row.paid_date),
    total_amount: Number(row.total_amount),
    paid_amount: Number(row.paid_amount),
    balance_due: Number(row.balance_due),
    currency: row.currency,
    cost_category: row.cost_category,
    memo: row.memo,
    source_updated_at: dateOrNull(row.source_updated_at ?? row.updated_at),
  }));
}

async function getCustomers() {
  const rows = await sql()<CustomerRow[]>`
    select
      qbo_id,
      display_name,
      company_name,
      fully_qualified_name,
      parent_customer_qbo_id,
      project_name,
      is_project,
      active,
      balance,
      source_updated_at,
      raw,
      updated_at
    from qbo_customers
    order by display_name nulls last, fully_qualified_name nulls last
  `;

  return rows.map((row) => ({
    source_system: "quickbooks",
    source_table: "qbo_customers",
    source_customer_id: row.qbo_id,
    display_name: row.display_name,
    company_name: row.company_name,
    parent_customer_id: row.parent_customer_qbo_id,
    project_name: row.project_name,
    active: row.active,
    balance: Number(row.balance),
    raw: row.raw,
    source_updated_at: dateOrNull(row.source_updated_at ?? row.updated_at),
  }));
}

async function getProjects() {
  const rows = await sql()<CustomerRow[]>`
    select
      qbo_id,
      display_name,
      company_name,
      fully_qualified_name,
      parent_customer_qbo_id,
      project_name,
      is_project,
      active,
      balance,
      source_updated_at,
      raw,
      updated_at
    from qbo_customers
    where is_project = true
    order by project_name nulls last, display_name nulls last
  `;

  return rows.map((row) => ({
    source_system: "quickbooks",
    source_table: "qbo_customers",
    source_customer_id: row.qbo_id,
    display_name: row.display_name,
    company_name: row.company_name,
    parent_customer_id: row.parent_customer_qbo_id,
    project_name: row.project_name ?? row.display_name ?? row.fully_qualified_name,
    active: row.active,
    balance: Number(row.balance),
    raw: row.raw,
    source_updated_at: dateOrNull(row.source_updated_at ?? row.updated_at),
  }));
}

export async function GET(request: Request) {
  const auth = isAuthorized(request);

  if (!auth.ok) {
    return NextResponse.json(
      {
        status: "error",
        message: auth.message,
      },
      { status: auth.status },
    );
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      {
        status: "error",
        message: "DATABASE_URL is not configured.",
      },
      { status: 500 },
    );
  }

  try {
    await ensureQboFinanceObjectTablesForExport();
    const [cashSnapshots, jobCosts, payments, invoices, vendorBills, customers, projects] =
      await Promise.all([
      getCashSnapshots(),
      getJobCosts(),
      getPayments(),
        getInvoices(),
        getVendorBills(),
        getCustomers(),
        getProjects(),
    ]);

    return NextResponse.json({
      status: "ok",
      source_app: "cashflow_intelligence",
      exported_at: new Date().toISOString(),
      counts: {
        cash_snapshots: cashSnapshots.length,
        job_costs: jobCosts.length,
        payments: payments.length,
        invoices: invoices.length,
        vendor_bills: vendorBills.length,
        customers: customers.length,
        projects: projects.length,
      },
      dataset_status: {
        cash_snapshots: {
          available: true,
          source_system: "quickbooks",
          source_table: "qb_accounts",
        },
        job_costs: {
          available: true,
          source_system: "cashflow_intelligence",
          source_table: "cfo_house_phase_actuals",
        },
        payments: {
          available: true,
          source_system: "quickbooks",
          source_table: "qbo_money_transactions",
          qbo_source_types: ["Purchase", "Check"],
        },
        invoices: {
          available: true,
          source_system: "quickbooks",
          source_table: "qbo_invoices",
          qbo_source_types: ["Invoice"],
        },
        vendor_bills: {
          available: true,
          source_system: "quickbooks",
          source_table: "qbo_vendor_bills",
          qbo_source_types: ["Bill"],
        },
        customers: {
          available: true,
          source_system: "quickbooks",
          source_table: "qbo_customers",
          qbo_source_types: ["Customer"],
        },
        projects: {
          available: true,
          source_system: "quickbooks",
          source_table: "qbo_customers",
          note: "Projects are QuickBooks customers/sub-customers detected from Customer.ParentRef or Customer.Job.",
        },
      },
      cash_snapshots: cashSnapshots,
      job_costs: jobCosts,
      payments,
      invoices,
      vendor_bills: vendorBills,
      customers,
      projects,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: "AI C-Suite finance export failed.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
