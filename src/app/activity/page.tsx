import { Bot, History, UserRound } from "lucide-react";

import { PageShell, Panel } from "@/components/app/page-shell";
import {
  formatAuditValue,
  listAuditEntries,
  listAuditFilterOptions,
  type AuditEntry,
} from "@/lib/audit/audit-log";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const timeZone = "America/Chicago";

function dayLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone,
  }).format(new Date(iso));
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

function groupByDay(entries: AuditEntry[]) {
  const groups = new Map<string, AuditEntry[]>();

  for (const entry of entries) {
    const key = dayLabel(entry.occurredAt);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return [...groups.entries()];
}

function single(value: string | string[] | undefined) {
  return typeof value === "string" && value ? value : null;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const params = await searchParams;
  const project = single(params.project);
  const person = single(params.person);
  const [entries, options] = await Promise.all([
    listAuditEntries({ houseName: project, actorName: person, limit: 300 }),
    listAuditFilterOptions(),
  ]);

  return (
    <PageShell
      description="Every change anyone makes is recorded here with who made it, when, and what the value was before and after. Nothing on this page can be edited or deleted."
      eyebrow="Source of truth"
      title="Change History"
    >
      <form className="flex flex-wrap items-end gap-3 rounded-[14px] border border-[#e3e1d7] bg-white p-4">
        <label className="block min-w-[180px] flex-1">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#16294d]">Project</span>
          <select
            className="mt-1 h-10 w-full rounded-[8px] border border-[#d8d5ca] bg-white px-2 text-sm font-bold text-[#16294d]"
            defaultValue={project ?? ""}
            name="project"
          >
            <option value="">All projects</option>
            {options.houses.map((house) => (
              <option key={house} value={house}>
                {house}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[180px] flex-1">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#16294d]">Person</span>
          <select
            className="mt-1 h-10 w-full rounded-[8px] border border-[#d8d5ca] bg-white px-2 text-sm font-bold text-[#16294d]"
            defaultValue={person ?? ""}
            name="person"
          >
            <option value="">Everyone</option>
            {options.actors.map((actor) => (
              <option key={actor} value={actor}>
                {actor}
              </option>
            ))}
          </select>
        </label>
        <button
          className="h-10 rounded-[8px] bg-[#16294d] px-4 text-xs font-extrabold uppercase tracking-[0.1em] text-white"
          type="submit"
        >
          Filter
        </button>
      </form>

      {entries.length === 0 ? (
        <Panel title="Nothing yet">
          <p className="flex items-center gap-2 text-sm text-[#7b8298]">
            <History size={16} />
            Changes will appear here as soon as someone saves something.
          </p>
        </Panel>
      ) : (
        groupByDay(entries).map(([day, dayEntries]) => (
          <Panel key={day} title={day}>
            <ol className="-my-3 divide-y divide-[#eeece4]">
              {dayEntries.map((entry) => (
                <li className="flex gap-3 py-3" key={entry.id}>
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef1f7] text-[#16294d]">
                    {entry.actorType === "user" ? <UserRound size={15} /> : <Bot size={15} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-extrabold text-[#16294d]">{entry.actorName}</span>
                      <span className="text-[#7b8298]">{timeLabel(entry.occurredAt)}</span>
                      {entry.houseName ? (
                        <span className="rounded-full bg-[#16294d] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-white">
                          {entry.houseName}
                        </span>
                      ) : null}
                    </div>
                    {entry.changes.length > 0 ? (
                      <ul className="mt-1.5 space-y-1">
                        {entry.changes.map((change) => (
                          <li className="text-sm text-[#1b2233]" key={change.field}>
                            <span className="font-bold">{change.label}:</span>{" "}
                            <span className="text-[#7b8298] line-through decoration-[#c9c6bb]">
                              {formatAuditValue(change.from, change.format)}
                            </span>{" "}
                            → <span className="font-bold text-[#1f6f4b]">{formatAuditValue(change.to, change.format)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-[#1b2233]">{entry.summary}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        ))
      )}
    </PageShell>
  );
}
