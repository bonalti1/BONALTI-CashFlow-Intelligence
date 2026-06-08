import { hasDatabaseUrl, sql } from "@/lib/db/raw";

export const drawPhaseKeys = ["pre", "p1", "p2", "p3", "p4", "p5", "p6"] as const;

export type DrawPhaseKey = (typeof drawPhaseKeys)[number];

export type DrawStatus =
  | "not_started"
  | "reviewing"
  | "ready"
  | "submitted"
  | "received"
  | "blocked";

export type DrawPhaseRecord = {
  qboBankAccountId: string;
  houseName: string;
  phaseKey: DrawPhaseKey;
  drawStatus: DrawStatus;
  submittedDate: string | null;
  requestedAmount: number | null;
  receivedAmount: number | null;
  receivedDate: string | null;
  accountantStatus: string | null;
  notes: string | null;
  updatedAt: string;
};

export type HousePhaseActual = {
  bankAccountQboId: string;
  houseName: string;
  phaseKey: string;
  phaseLabel: string;
  phaseName: string;
  budgetAmount: number | null;
  spentAmount: number;
  transactionCount: number;
  overBudgetAmount: number;
  status: string;
};

async function ensureDrawTables() {
  await sql()`
    create table if not exists draw_phase_statuses (
      qbo_bank_account_id text not null,
      house_name text not null,
      phase_key text not null,
      draw_status text not null default 'not_started',
      submitted_date date,
      requested_amount numeric,
      received_amount numeric,
      received_date date,
      accountant_status text,
      notes text,
      updated_at timestamptz not null default now(),
      primary key (qbo_bank_account_id, phase_key)
    )
  `;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function drawStatus(value: string | null): DrawStatus {
  if (
    value === "not_started" ||
    value === "reviewing" ||
    value === "ready" ||
    value === "submitted" ||
    value === "received" ||
    value === "blocked"
  ) {
    return value;
  }

  return "not_started";
}

function dateString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
}

export async function getDrawPhaseStatuses() {
  const statuses = new Map<string, DrawPhaseRecord>();

  if (!hasDatabaseUrl()) {
    return statuses;
  }

  await ensureDrawTables();
  const rows = await sql()<
    Array<{
      qbo_bank_account_id: string;
      house_name: string;
      phase_key: DrawPhaseKey;
      draw_status: string;
      submitted_date: string | null;
      requested_amount: string | null;
      received_amount: string | null;
      received_date: string | null;
      accountant_status: string | null;
      notes: string | null;
      updated_at: Date;
    }>
  >`
    select
      qbo_bank_account_id,
      house_name,
      phase_key,
      draw_status,
      submitted_date,
      requested_amount,
      received_amount,
      received_date,
      accountant_status,
      notes,
      updated_at
    from draw_phase_statuses
    order by house_name, phase_key
  `;

  for (const row of rows) {
    statuses.set(`${row.qbo_bank_account_id}:${row.phase_key}`, {
      qboBankAccountId: row.qbo_bank_account_id,
      houseName: row.house_name,
      phaseKey: row.phase_key,
      drawStatus: drawStatus(row.draw_status),
      submittedDate: dateString(row.submitted_date),
      requestedAmount: numberOrNull(row.requested_amount),
      receivedAmount: numberOrNull(row.received_amount),
      receivedDate: dateString(row.received_date),
      accountantStatus: row.accountant_status,
      notes: row.notes,
      updatedAt: row.updated_at.toISOString(),
    });
  }

  return statuses;
}

export async function getHousePhaseActuals() {
  const actuals = new Map<string, HousePhaseActual>();

  if (!hasDatabaseUrl()) {
    return actuals;
  }

  await sql()`
    create table if not exists cfo_house_phase_actuals (
      bank_account_qbo_id text not null,
      house_name text not null,
      phase_key text not null,
      phase_label text not null,
      phase_name text not null,
      sale_price numeric,
      square_feet integer,
      city text,
      budget_amount numeric,
      spent_amount numeric not null default 0,
      transaction_count integer not null default 0,
      over_budget_amount numeric not null default 0,
      status text not null,
      calculated_at timestamptz not null default now(),
      primary key (bank_account_qbo_id, phase_key)
    )
  `;

  const rows = await sql()<
    Array<{
      bank_account_qbo_id: string;
      house_name: string;
      phase_key: string;
      phase_label: string;
      phase_name: string;
      budget_amount: string | null;
      spent_amount: string;
      transaction_count: number;
      over_budget_amount: string;
      status: string;
    }>
  >`
    select
      bank_account_qbo_id,
      house_name,
      phase_key,
      phase_label,
      phase_name,
      budget_amount,
      spent_amount,
      transaction_count,
      over_budget_amount,
      status
    from cfo_house_phase_actuals
    order by house_name, phase_key
  `;

  for (const row of rows) {
    actuals.set(`${row.bank_account_qbo_id}:${row.phase_key}`, {
      bankAccountQboId: row.bank_account_qbo_id,
      houseName: row.house_name,
      phaseKey: row.phase_key,
      phaseLabel: row.phase_label,
      phaseName: row.phase_name,
      budgetAmount: numberOrNull(row.budget_amount),
      spentAmount: Number(row.spent_amount),
      transactionCount: row.transaction_count,
      overBudgetAmount: Number(row.over_budget_amount),
      status: row.status,
    });
  }

  return actuals;
}

export async function saveDrawPhaseStatus({
  qboBankAccountId,
  houseName,
  phaseKey,
  drawStatus,
  submittedDate,
  requestedAmount,
  receivedAmount,
  receivedDate,
  accountantStatus,
  notes,
}: Omit<DrawPhaseRecord, "updatedAt">) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required to save draw status.");
  }

  await ensureDrawTables();
  await sql()`
    insert into draw_phase_statuses (
      qbo_bank_account_id,
      house_name,
      phase_key,
      draw_status,
      submitted_date,
      requested_amount,
      received_amount,
      received_date,
      accountant_status,
      notes,
      updated_at
    )
    values (
      ${qboBankAccountId},
      ${houseName},
      ${phaseKey},
      ${drawStatus},
      ${submittedDate},
      ${requestedAmount},
      ${receivedAmount},
      ${receivedDate},
      ${accountantStatus},
      ${notes},
      now()
    )
    on conflict (qbo_bank_account_id, phase_key) do update set
      house_name = excluded.house_name,
      draw_status = excluded.draw_status,
      submitted_date = excluded.submitted_date,
      requested_amount = excluded.requested_amount,
      received_amount = excluded.received_amount,
      received_date = excluded.received_date,
      accountant_status = excluded.accountant_status,
      notes = excluded.notes,
      updated_at = now()
  `;
}
