import { hasDatabaseUrl, sql } from "@/lib/db/raw";

export type AuditActor = {
  type: "user" | "api_key" | "system";
  id: string | null;
  name: string;
};

export type FieldFormat = "money" | "number" | "text" | "date" | "boolean";

export type FieldSpec = Record<string, { label: string; format?: FieldFormat }>;

export type AuditChange = {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
  format: FieldFormat;
};

export type AuditEntry = {
  id: number;
  occurredAt: string;
  actorType: AuditActor["type"];
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  houseName: string | null;
  summary: string;
  changes: AuditChange[];
  details: Record<string, unknown>;
};

let auditTableReady: Promise<void> | null = null;

async function initializeAuditTable() {
  await sql()`
    create table if not exists audit_log (
      id bigserial primary key,
      occurred_at timestamptz not null default now(),
      actor_type text not null,
      actor_id text,
      actor_name text not null,
      action text not null,
      entity_type text not null,
      entity_id text,
      house_name text,
      summary text not null,
      changes jsonb not null default '[]'::jsonb,
      details jsonb not null default '{}'::jsonb
    )
  `;
  await sql()`
    create index if not exists audit_log_occurred_idx on audit_log (occurred_at desc)
  `;
  await sql()`
    create index if not exists audit_log_entity_idx
    on audit_log (entity_type, entity_id, occurred_at desc)
  `;
}

function ensureAuditTable() {
  auditTableReady ??= initializeAuditTable().catch((error) => {
    auditTableReady = null;
    throw error;
  });

  return auditTableReady;
}

function normalized(value: unknown) {
  if (value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }

  return value;
}

export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  spec: FieldSpec,
): AuditChange[] {
  return Object.entries(spec).flatMap(([field, { label, format = "text" }]) => {
    if (!(field in after)) {
      return [];
    }

    const from = normalized(before?.[field]);
    const to = normalized(after[field]);

    if (from === to) {
      return [];
    }

    return [{ field, label, from, to, format }];
  });
}

export function formatAuditValue(value: unknown, format: FieldFormat) {
  if (value === null || value === undefined) {
    return "blank";
  }

  if (format === "money" && typeof value === "number") {
    return new Intl.NumberFormat("en-US", {
      currency: "USD",
      maximumFractionDigits: 2,
      style: "currency",
    }).format(value);
  }

  if (format === "number" && typeof value === "number") {
    return new Intl.NumberFormat("en-US").format(value);
  }

  if (format === "boolean") {
    return value ? "yes" : "no";
  }

  return String(value);
}

export function describeChanges(changes: AuditChange[]) {
  return changes
    .map(
      (change) =>
        `${change.label}: ${formatAuditValue(change.from, change.format)} → ${formatAuditValue(change.to, change.format)}`,
    )
    .join("; ");
}

// Saves are already committed when this runs, so a failed audit write is logged rather than shown as a failed save.
export async function recordAudit({
  actor,
  action,
  entityType,
  entityId = null,
  houseName = null,
  summary,
  changes = [],
  details = {},
}: {
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId?: string | null;
  houseName?: string | null;
  summary: string;
  changes?: AuditChange[];
  details?: Record<string, unknown>;
}) {
  if (!hasDatabaseUrl()) {
    return;
  }

  try {
    await ensureAuditTable();
    await sql()`
      insert into audit_log (
        actor_type, actor_id, actor_name, action, entity_type, entity_id, house_name,
        summary, changes, details
      )
      values (
        ${actor.type}, ${actor.id}, ${actor.name}, ${action}, ${entityType}, ${entityId},
        ${houseName}, ${summary}, ${sql().json(JSON.parse(JSON.stringify(changes)))},
        ${sql().json(JSON.parse(JSON.stringify(details)))}
      )
    `;
  } catch (error) {
    console.error("Audit log write failed", { action, entityId, error });
  }
}

type AuditRow = {
  id: string;
  occurred_at: Date;
  actor_type: AuditActor["type"];
  actor_id: string | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  house_name: string | null;
  summary: string;
  changes: AuditChange[];
  details: Record<string, unknown>;
};

export async function listAuditEntries({
  houseName = null,
  actorName = null,
  since = null,
  limit = 200,
}: {
  houseName?: string | null;
  actorName?: string | null;
  since?: Date | null;
  limit?: number;
} = {}): Promise<AuditEntry[]> {
  if (!hasDatabaseUrl()) {
    return [];
  }

  await ensureAuditTable();
  const rows = await sql()<AuditRow[]>`
    select id, occurred_at, actor_type, actor_id, actor_name, action, entity_type, entity_id,
      house_name, summary, changes, details
    from audit_log
    where (${houseName}::text is null or house_name = ${houseName})
      and (${actorName}::text is null or actor_name = ${actorName})
      and (${since}::timestamptz is null or occurred_at >= ${since})
    order by occurred_at desc, id desc
    limit ${Math.min(Math.max(limit, 1), 1000)}
  `;

  return rows.map((row) => ({
    id: Number(row.id),
    occurredAt: row.occurred_at.toISOString(),
    actorType: row.actor_type,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    houseName: row.house_name,
    summary: row.summary,
    changes: row.changes ?? [],
    details: row.details ?? {},
  }));
}

export async function listAuditFilterOptions() {
  if (!hasDatabaseUrl()) {
    return { houses: [] as string[], actors: [] as string[] };
  }

  await ensureAuditTable();
  const [houses, actors] = await Promise.all([
    sql()<Array<{ house_name: string }>>`
      select distinct house_name from audit_log where house_name is not null order by house_name
    `,
    sql()<Array<{ actor_name: string }>>`
      select distinct actor_name from audit_log order by actor_name
    `,
  ]);

  return {
    houses: houses.map((row) => row.house_name),
    actors: actors.map((row) => row.actor_name),
  };
}
