import {
  describeChanges,
  diffFields,
  recordAudit,
  type AuditActor,
  type FieldSpec,
} from "@/lib/audit/audit-log";

export const projectStatusLabels: Record<string, string> = {
  active: "Active",
  on_hold: "On hold",
  final_phase: "Final phase",
  completed: "Completed",
  closed_out: "Closed out",
};

export const drawStatusLabels: Record<string, string> = {
  not_started: "Not started",
  reviewing: "Reviewing",
  ready: "Ready to request",
  submitted: "Draw requested",
  received: "Money received",
  blocked: "Blocked",
};

export function labelFor(labels: Record<string, string>, value: string | null | undefined) {
  return value ? (labels[value] ?? value) : null;
}

// Records only the fields that actually changed; a save with no changes and no extra details is skipped.
export async function auditProjectChange({
  actor,
  action,
  qboBankAccountId,
  houseName,
  title,
  before,
  after,
  spec,
  details,
}: {
  actor: AuditActor;
  action: string;
  qboBankAccountId: string;
  houseName: string;
  title: string;
  before: Record<string, unknown> | null | undefined;
  after: Record<string, unknown>;
  spec: FieldSpec;
  details?: Record<string, unknown>;
}) {
  const changes = diffFields(before, after, spec);

  if (changes.length === 0 && !details) {
    return;
  }

  await recordAudit({
    actor,
    action,
    entityType: "project",
    entityId: qboBankAccountId,
    houseName,
    summary: changes.length > 0 ? `${title}: ${describeChanges(changes)}` : title,
    changes,
    details,
  });
}
