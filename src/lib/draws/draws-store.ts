import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

export type PhaseLineItem = {
  qboAccountId: string;
  phaseKey: DrawPhaseKey;
  phaseLabel: string;
  phaseName: string;
  lineItemName: string;
  fullyQualifiedName: string | null;
  mappingConfidence: string;
  active: boolean;
};

export type PhaseLineItemActual = {
  bankAccountQboId: string;
  phaseKey: DrawPhaseKey;
  qboAccountId: string;
  spentAmount: number;
  transactionCount: number;
  payeeNames: string[];
  lastTxnDate: string | null;
};

export type DrawLineItemRecord = {
  qboBankAccountId: string;
  houseName: string;
  phaseKey: DrawPhaseKey;
  lineItemKey: string;
  lineItemName: string;
  drawSubmitted: boolean;
  submittedAt: string | null;
  requestedAmount: number | null;
  drawReceived: boolean;
  receivedAmount: number | null;
  receivedAt: string | null;
  notes: string | null;
  updatedAt: string;
};

type LocalDrawStore = {
  phaseStatuses: DrawPhaseRecord[];
  lineItemStatuses: DrawLineItemRecord[];
};

const localDrawStorePath = path.join(process.cwd(), ".data", "local-draw-statuses.json");

async function readLocalDrawStore(): Promise<LocalDrawStore> {
  try {
    const raw = await readFile(localDrawStorePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalDrawStore>;

    return {
      phaseStatuses: Array.isArray(parsed.phaseStatuses) ? parsed.phaseStatuses : [],
      lineItemStatuses: Array.isArray(parsed.lineItemStatuses) ? parsed.lineItemStatuses : [],
    };
  } catch {
    return { phaseStatuses: [], lineItemStatuses: [] };
  }
}

async function writeLocalDrawStore(store: LocalDrawStore) {
  await mkdir(path.dirname(localDrawStorePath), { recursive: true });
  await writeFile(localDrawStorePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

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

  await sql()`
    create table if not exists draw_line_item_statuses (
      qbo_bank_account_id text not null,
      house_name text not null,
      phase_key text not null,
      line_item_key text not null,
      line_item_name text not null,
      draw_submitted boolean not null default false,
      submitted_at timestamptz,
      requested_amount numeric,
      draw_received boolean not null default false,
      received_amount numeric,
      received_at timestamptz,
      notes text,
      updated_at timestamptz not null default now(),
      primary key (qbo_bank_account_id, phase_key, line_item_key)
    )
  `;

  await sql()`alter table draw_phase_statuses add column if not exists submitted_date date`;
  await sql()`alter table draw_phase_statuses add column if not exists requested_amount numeric`;
  await sql()`alter table draw_phase_statuses add column if not exists received_amount numeric`;
  await sql()`alter table draw_phase_statuses add column if not exists received_date date`;
  await sql()`alter table draw_phase_statuses add column if not exists accountant_status text`;
  await sql()`alter table draw_phase_statuses add column if not exists notes text`;
  await sql()`alter table draw_phase_statuses add column if not exists updated_at timestamptz not null default now()`;

  await sql()`alter table draw_line_item_statuses add column if not exists line_item_name text`;
  await sql()`alter table draw_line_item_statuses add column if not exists draw_submitted boolean not null default false`;
  await sql()`alter table draw_line_item_statuses add column if not exists submitted_at timestamptz`;
  await sql()`alter table draw_line_item_statuses add column if not exists requested_amount numeric`;
  await sql()`alter table draw_line_item_statuses add column if not exists draw_received boolean not null default false`;
  await sql()`alter table draw_line_item_statuses add column if not exists received_amount numeric`;
  await sql()`alter table draw_line_item_statuses add column if not exists received_at timestamptz`;
  await sql()`alter table draw_line_item_statuses add column if not exists notes text`;
  await sql()`alter table draw_line_item_statuses add column if not exists updated_at timestamptz not null default now()`;
}

function isDrawPhaseKey(value: string): value is DrawPhaseKey {
  return drawPhaseKeys.includes(value as DrawPhaseKey);
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
    const store = await readLocalDrawStore();

    for (const row of store.phaseStatuses) {
      statuses.set(`${row.qboBankAccountId}:${row.phaseKey}`, row);
    }

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

export async function getDrawLineItemStatuses() {
  const statuses = new Map<string, DrawLineItemRecord>();

  if (!hasDatabaseUrl()) {
    const store = await readLocalDrawStore();

    for (const row of store.lineItemStatuses) {
      statuses.set(`${row.qboBankAccountId}:${row.phaseKey}:${row.lineItemKey}`, row);
    }

    return statuses;
  }

  await ensureDrawTables();
  const rows = await sql()<
    Array<{
      qbo_bank_account_id: string;
      house_name: string;
      phase_key: DrawPhaseKey;
      line_item_key: string;
      line_item_name: string;
      draw_submitted: boolean;
      submitted_at: Date | null;
      requested_amount: string | null;
      draw_received: boolean;
      received_amount: string | null;
      received_at: Date | null;
      notes: string | null;
      updated_at: Date;
    }>
  >`
    select
      qbo_bank_account_id,
      house_name,
      phase_key,
      line_item_key,
      line_item_name,
      draw_submitted,
      submitted_at,
      requested_amount,
      draw_received,
      received_amount,
      received_at,
      notes,
      updated_at
    from draw_line_item_statuses
    order by house_name, phase_key, line_item_name
  `;

  for (const row of rows) {
    statuses.set(`${row.qbo_bank_account_id}:${row.phase_key}:${row.line_item_key}`, {
      qboBankAccountId: row.qbo_bank_account_id,
      houseName: row.house_name,
      phaseKey: row.phase_key,
      lineItemKey: row.line_item_key,
      lineItemName: row.line_item_name,
      drawSubmitted: row.draw_submitted,
      submittedAt: row.submitted_at?.toISOString() ?? null,
      requestedAmount: numberOrNull(row.requested_amount),
      drawReceived: row.draw_received,
      receivedAmount: numberOrNull(row.received_amount),
      receivedAt: row.received_at?.toISOString() ?? null,
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

export async function getPhaseLineItemsByPhase() {
  const lineItems = new Map<DrawPhaseKey, PhaseLineItem[]>();

  for (const key of drawPhaseKeys) {
    lineItems.set(key, []);
  }

  if (!hasDatabaseUrl()) {
    return lineItems;
  }

  await sql()`
    create table if not exists cfo_phase_line_items (
      qbo_account_id text primary key,
      realm_id text not null,
      qbo_account_name text not null,
      qbo_fully_qualified_name text,
      parent_qbo_id text,
      phase_key text not null,
      phase_label text not null,
      phase_name text not null,
      line_item_name text not null,
      mapping_confidence text not null,
      progress_included boolean not null,
      is_job_site_overhead boolean not null,
      active boolean not null default true,
      raw jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;

  const rows = await sql()<
    Array<{
      qbo_account_id: string;
      phase_key: string;
      phase_label: string;
      phase_name: string;
      line_item_name: string;
      qbo_fully_qualified_name: string | null;
      mapping_confidence: string;
      active: boolean;
    }>
  >`
    select
      qbo_account_id,
      phase_key,
      phase_label,
      phase_name,
      line_item_name,
      qbo_fully_qualified_name,
      mapping_confidence,
      active
    from cfo_phase_line_items
    where phase_key = any(${drawPhaseKeys})
      and active = true
    order by phase_key, qbo_fully_qualified_name nulls last, line_item_name
  `;

  for (const row of rows) {
    if (!isDrawPhaseKey(row.phase_key)) {
      continue;
    }

    const existing = lineItems.get(row.phase_key) ?? [];

    existing.push({
      qboAccountId: row.qbo_account_id,
      phaseKey: row.phase_key,
      phaseLabel: row.phase_label,
      phaseName: row.phase_name,
      lineItemName: row.line_item_name,
      fullyQualifiedName: row.qbo_fully_qualified_name,
      mappingConfidence: row.mapping_confidence,
      active: row.active,
    });
    lineItems.set(row.phase_key, existing);
  }

  return lineItems;
}

export async function getPhaseLineItemActuals() {
  const actuals = new Map<string, PhaseLineItemActual>();

  if (!hasDatabaseUrl()) {
    return actuals;
  }

  const rows = await sql()<
    Array<{
      bank_account_qbo_id: string;
      phase_key: string;
      qbo_account_id: string;
      spent_amount: string;
      transaction_count: number;
      payee_names: string[];
      last_txn_date: Date | null;
    }>
  >`
    select
      t.bank_account_qbo_id,
      l.phase_key,
      l.qbo_account_id,
      sum(abs(t.total_amount)) as spent_amount,
      count(*)::int as transaction_count,
      array_remove(array_agg(distinct t.payee_name), null) as payee_names,
      max(t.txn_date) as last_txn_date
    from qbo_money_transactions t
    join cfo_phase_line_items l
      on l.qbo_account_id = any(t.expense_account_ids)
    where t.bank_account_qbo_id is not null
      and l.phase_key = any(${drawPhaseKeys})
      and l.active = true
    group by t.bank_account_qbo_id, l.phase_key, l.qbo_account_id
  `;

  for (const row of rows) {
    if (!isDrawPhaseKey(row.phase_key)) {
      continue;
    }

    actuals.set(`${row.bank_account_qbo_id}:${row.phase_key}:${row.qbo_account_id}`, {
      bankAccountQboId: row.bank_account_qbo_id,
      phaseKey: row.phase_key,
      qboAccountId: row.qbo_account_id,
      spentAmount: Number(row.spent_amount),
      transactionCount: row.transaction_count,
      payeeNames: row.payee_names ?? [],
      lastTxnDate: row.last_txn_date?.toISOString().slice(0, 10) ?? null,
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
    const store = await readLocalDrawStore();
    const updatedAt = new Date().toISOString();
    const nextRecord: DrawPhaseRecord = {
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
      updatedAt,
    };
    const nextRows = store.phaseStatuses.filter(
      (row) => !(row.qboBankAccountId === qboBankAccountId && row.phaseKey === phaseKey),
    );

    await writeLocalDrawStore({
      ...store,
      phaseStatuses: [...nextRows, nextRecord],
    });

    return;
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

export async function saveDrawLineItemStatus({
  qboBankAccountId,
  houseName,
  phaseKey,
  lineItemKey,
  lineItemName,
  drawSubmitted,
  submittedAt,
  requestedAmount,
  drawReceived,
  receivedAmount,
  receivedAt,
  notes,
}: Omit<DrawLineItemRecord, "updatedAt">) {
  if (!hasDatabaseUrl()) {
    const store = await readLocalDrawStore();
    const updatedAt = new Date().toISOString();
    const nextRecord: DrawLineItemRecord = {
      qboBankAccountId,
      houseName,
      phaseKey,
      lineItemKey,
      lineItemName,
      drawSubmitted,
      submittedAt,
      requestedAmount,
      drawReceived,
      receivedAmount,
      receivedAt,
      notes,
      updatedAt,
    };
    const nextRows = store.lineItemStatuses.filter(
      (row) =>
        !(
          row.qboBankAccountId === qboBankAccountId &&
          row.phaseKey === phaseKey &&
          row.lineItemKey === lineItemKey
        ),
    );

    await writeLocalDrawStore({
      ...store,
      lineItemStatuses: [...nextRows, nextRecord],
    });

    return;
  }

  await ensureDrawTables();
  await sql()`
    insert into draw_line_item_statuses (
      qbo_bank_account_id,
      house_name,
      phase_key,
      line_item_key,
      line_item_name,
      draw_submitted,
      submitted_at,
      requested_amount,
      draw_received,
      received_amount,
      received_at,
      notes,
      updated_at
    )
    values (
      ${qboBankAccountId},
      ${houseName},
      ${phaseKey},
      ${lineItemKey},
      ${lineItemName},
      ${drawSubmitted},
      ${submittedAt},
      ${requestedAmount},
      ${drawReceived},
      ${receivedAmount},
      ${receivedAt},
      ${notes},
      now()
    )
    on conflict (qbo_bank_account_id, phase_key, line_item_key) do update set
      house_name = excluded.house_name,
      line_item_name = excluded.line_item_name,
      draw_submitted = excluded.draw_submitted,
      submitted_at = excluded.submitted_at,
      requested_amount = excluded.requested_amount,
      draw_received = excluded.draw_received,
      received_amount = excluded.received_amount,
      received_at = excluded.received_at,
      notes = excluded.notes,
      updated_at = now()
  `;
}
