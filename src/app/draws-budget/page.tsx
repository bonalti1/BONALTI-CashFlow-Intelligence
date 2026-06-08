import Link from "next/link";
import Image from "next/image";
import {
  Brain,
  ClipboardCheck,
  ClipboardList,
  Database,
  ExternalLink,
  HandCoins,
  LayoutDashboard,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";

import { saveDrawStatusAction } from "@/app/actions/draw-status";
import {
  drawPhaseKeys,
  getDrawPhaseStatuses,
  getHousePhaseActuals,
  type DrawPhaseKey,
  type DrawPhaseRecord,
  type DrawStatus,
  type HousePhaseActual,
} from "@/lib/draws/draws-store";
import { getHouseDetailsMap } from "@/lib/houses/house-details-store";
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName } from "@/lib/qbo/bank-account-map";

export const dynamic = "force-dynamic";

type PhaseView = {
  key: DrawPhaseKey;
  label: string;
  name: string;
  scheduleStatus: string;
  actual: HousePhaseActual | null;
  draw: DrawPhaseRecord | null;
};

const phaseLabels: Record<DrawPhaseKey, { label: string; name: string }> = {
  pre: { label: "Pre", name: "Pre Phase" },
  p1: { label: "P1", name: "Foundation" },
  p2: { label: "P2", name: "Frame & Dry-in" },
  p3: { label: "P3", name: "Rough Trades" },
  p4: { label: "P4", name: "Exterior & Floors" },
  p5: { label: "P5", name: "Interior Rough" },
  p6: { label: "P6", name: "Final" },
};

const drawStatuses: Array<{ value: DrawStatus; label: string }> = [
  { value: "not_started", label: "Not Started" },
  { value: "reviewing", label: "Reviewing" },
  { value: "ready", label: "Ready" },
  { value: "submitted", label: "Submitted" },
  { value: "received", label: "Received" },
  { value: "blocked", label: "Blocked" },
];

function currency(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Set $";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function accountName(account: QboAccount) {
  return account.FullyQualifiedName ?? account.Name;
}

function scheduleStatusFor(actual: HousePhaseActual | null) {
  if (!actual || actual.transactionCount === 0) {
    return "Scheduled";
  }

  if (actual.status === "over_budget") {
    return "Needs Review";
  }

  if (actual.transactionCount > 0 && actual.spentAmount > 0) {
    return "Working Today";
  }

  return "Scheduled";
}

function drawStatusTone(status: DrawStatus) {
  if (status === "received") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "submitted" || status === "ready") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  if (status === "blocked") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (status === "reviewing") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-[#d9dee9] bg-white text-[#5f6b66]";
}

function budgetTone(actual: HousePhaseActual | null) {
  if (!actual || actual.transactionCount === 0) {
    return "border-[#d9dee9] bg-white text-[#69746f]";
  }

  if (actual.status === "over_budget") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (actual.status === "needs_house_setup" || actual.status === "review") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function scheduleUrl(houseName: string) {
  const baseUrl = process.env.SCHEDULING_APP_URL ?? process.env.NEXT_PUBLIC_SCHEDULING_APP_URL;

  if (!baseUrl) {
    return null;
  }

  const url = new URL(baseUrl);
  url.searchParams.set("house", houseName);

  return url.toString();
}

export default async function DrawsBudgetPage() {
  const [snapshot, houseDetails, drawStatusesByPhase, actualsByPhase] = await Promise.all([
    getAccountsSnapshot().catch(() => null),
    getHouseDetailsMap(),
    getDrawPhaseStatuses(),
    getHousePhaseActuals(),
  ]);
  const bankAccounts = snapshot?.accounts.filter((account) => account.AccountType === "Bank") ?? [];
  const houses = bankAccounts
    .map((account) => {
      const house = getConfirmedHouseName(account);

      if (!house) {
        return null;
      }

      const details = houseDetails.get(account.Id);
      const phases: PhaseView[] = drawPhaseKeys.map((key) => {
        const actual = actualsByPhase.get(`${account.Id}:${key}`) ?? null;

        return {
          key,
          label: phaseLabels[key].label,
          name: actual?.phaseName ?? phaseLabels[key].name,
          scheduleStatus: scheduleStatusFor(actual),
          actual,
          draw: drawStatusesByPhase.get(`${account.Id}:${key}`) ?? null,
        };
      });
      const totalSpent = phases.reduce((total, phase) => total + (phase.actual?.spentAmount ?? 0), 0);
      const readyPhases = phases.filter((phase) =>
        phase.draw?.drawStatus === "ready" ||
        phase.draw?.drawStatus === "submitted" ||
        phase.draw?.drawStatus === "received"
      ).length;
      const needsReview = phases.filter((phase) =>
        phase.actual?.status === "over_budget" || phase.actual?.status === "needs_house_setup"
      ).length;

      return {
        id: account.Id,
        house,
        bank: accountName(account),
        city: details?.city ?? null,
        soldPrice: details?.soldPrice ?? null,
        squareFootage: details?.squareFootage ?? null,
        totalSpent,
        readyPhases,
        needsReview,
        phases,
        scheduleUrl: scheduleUrl(house),
      };
    })
    .filter((house): house is NonNullable<typeof house> => Boolean(house))
    .sort((a, b) => a.house.localeCompare(b.house));
  const openDraws = houses.reduce(
    (total, house) =>
      total + house.phases.filter((phase) => phase.draw?.drawStatus === "submitted").length,
    0,
  );
  const receivedDraws = houses.reduce(
    (total, house) =>
      total + house.phases.filter((phase) => phase.draw?.drawStatus === "received").length,
    0,
  );

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-[#121a36]">
      <div className="grid min-h-screen grid-cols-[248px_1fr]">
        <aside className="border-r border-[#d9dee9] bg-white px-5 py-5 shadow-sm">
          <div className="mb-8">
            <div className="mb-4 rounded-lg border border-[#d9dee9] bg-white p-3 shadow-sm">
              <Image
                alt="South Texas Builders"
                className="h-auto w-full"
                height={1080}
                src="/south-texas-builders-logo.png"
                width={1080}
              />
            </div>
            <div>
              <div className="brand-heading text-base font-semibold text-[#121d49]">
                South Texas Builders
              </div>
              <div className="brand-kicker mt-1 text-[10px] font-medium uppercase text-[#ff332b]">
                Project Health Agent
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            <NavItem href="/" icon={LayoutDashboard} label="Portfolio" />
            <NavItem href="/setup-inputs" icon={ClipboardList} label="House Setup" />
            <NavItem active icon={ClipboardCheck} label="Draws & Budget" />
            <NavItem href="/payees" icon={HandCoins} label="Payees" />
            <NavItem href="/agent-health" icon={Brain} label="Intelligent Center" />
            <NavItem href="/company-brain" icon={Database} label="Company Brain" />
            <NavItem href="/setup" icon={ShieldCheck} label="Setup" />
          </nav>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex min-h-16 items-center justify-between border-b border-[#d9dee9] bg-white px-6 py-3 shadow-sm">
            <div>
              <p className="brand-kicker text-[10px] font-bold uppercase text-[#ff332b]">
                Draws & Budget
              </p>
              <h1 className="mt-1 text-2xl font-bold text-[#121d49]">
                Draw Checklist
              </h1>
              <p className="text-xs text-[#69746f]">
                Scheduling is read-only here. Cashflow owns draw submitted, money received, and budget review.
              </p>
            </div>
            <Link
              className="inline-flex items-center gap-2 rounded-md bg-[#121d49] px-3 py-1.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#ff332b]"
              href="/api/qbo/accounts/sync?next=/draws-budget"
            >
              <RefreshCcw size={16} />
              Sync QB
            </Link>
          </header>

          <div className="flex-1 px-6 py-5">
            <section className="mb-5 grid grid-cols-3 gap-3">
              <Metric label="Active Houses" value={String(houses.length)} detail="House draw cards" />
              <Metric label="Submitted Draws" value={String(openDraws)} detail="Waiting on received money" />
              <Metric label="Received Draws" value={String(receivedDraws)} detail="Marked as received" />
            </section>

            <section className="space-y-4">
              {houses.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  No house draw cards are loaded yet. Click Sync QB to pull the latest QuickBooks
                  accounts, checks, and phase totals.
                </div>
              ) : null}

              {houses.map((house) => (
                <article className="rounded-lg border border-[#dfe5dc] bg-white shadow-sm" key={house.id}>
                  <div className="flex items-center justify-between gap-4 border-l-4 border-[#ff332b] border-b border-[#edf0eb] px-4 py-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-[#121d49]">{house.house}</h2>
                        <span className="rounded-md bg-[#eef3ff] px-2 py-1 text-xs font-bold text-[#121d49]">
                          {house.readyPhases}/7 draw stages active
                        </span>
                        {house.needsReview > 0 ? (
                          <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
                            {house.needsReview} need review
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-[#69746f]">
                        {house.city ?? "City missing"} · Sold {currency(house.soldPrice)} · Spent{" "}
                        {currency(house.totalSpent)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {house.scheduleUrl ? (
                        <a
                          className="inline-flex items-center gap-2 rounded-md border border-[#121d49] px-3 py-2 text-xs font-bold text-[#121d49] transition hover:bg-[#121d49] hover:text-white"
                          href={house.scheduleUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open Schedule
                          <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                          Add schedule URL
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 bg-[#fbfcfa] p-4">
                    {house.phases.map((phase) => (
                      <details className="rounded-lg border border-[#d9dee9] bg-white" key={phase.key}>
                        <summary className="grid cursor-pointer grid-cols-[100px_1fr_180px_180px] items-center gap-3 px-4 py-3">
                          <div>
                            <div className="text-sm font-bold text-[#121d49]">{phase.label}</div>
                            <div className="text-[11px] text-[#69746f]">{phase.name}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-md border border-[#d9dee9] bg-[#f8f9f6] px-2 py-1 font-bold text-[#69746f]">
                              Schedule: {phase.scheduleStatus}
                            </span>
                            <span className={`rounded-md border px-2 py-1 font-bold ${budgetTone(phase.actual)}`}>
                              Budget: {phase.actual?.status?.replace(/_/g, " ") ?? "Not Started"}
                            </span>
                          </div>
                          <div className="text-xs">
                            <div className="font-bold text-[#121d49]">
                              {currency(phase.actual?.spentAmount ?? 0)} spent
                            </div>
                            <div className="text-[#69746f]">
                              Budget {currency(phase.actual?.budgetAmount)}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`rounded-md border px-2 py-1 text-xs font-bold ${drawStatusTone(phase.draw?.drawStatus ?? "not_started")}`}>
                              {(phase.draw?.drawStatus ?? "not_started").replace(/_/g, " ")}
                            </span>
                          </div>
                        </summary>

                        <div className="border-t border-[#edf0eb] px-4 py-4">
                          <div className="grid grid-cols-[1fr_1.2fr] gap-4">
                            <div className="rounded-lg border border-[#d9dee9] bg-[#fbfcfa] p-3">
                              <h3 className="text-xs font-bold uppercase text-[#121d49]">
                                Read-only schedule view
                              </h3>
                              <ChecklistItem checked label="Scheduling department controls this status" />
                              <ChecklistItem checked={phase.scheduleStatus !== "Scheduled"} label={`Current schedule status: ${phase.scheduleStatus}`} />
                              <ChecklistItem checked={Boolean(phase.actual?.transactionCount)} label={`${phase.actual?.transactionCount ?? 0} QB checks/payments found`} />
                              <ChecklistItem checked={(phase.actual?.status ?? "") !== "over_budget"} label="Budget does not show overrun" />
                            </div>

                            <form action={saveDrawStatusAction} className="rounded-lg border border-[#d9dee9] bg-white p-3">
                              <input name="qboBankAccountId" type="hidden" value={house.id} />
                              <input name="houseName" type="hidden" value={house.house} />
                              <input name="phaseKey" type="hidden" value={phase.key} />
                              <h3 className="mb-3 text-xs font-bold uppercase text-[#121d49]">
                                Draw controls
                              </h3>
                              <div className="grid grid-cols-3 gap-2">
                                <label className="text-xs font-medium text-[#69746f]">
                                  Draw Status
                                  <select
                                    className="mt-1 h-9 w-full rounded-md border border-[#c8cfde] bg-white px-2 text-sm"
                                    defaultValue={phase.draw?.drawStatus ?? "not_started"}
                                    name="drawStatus"
                                  >
                                    {drawStatuses.map((status) => (
                                      <option key={status.value} value={status.value}>
                                        {status.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-xs font-medium text-[#69746f]">
                                  Requested
                                  <input
                                    className="mt-1 h-9 w-full rounded-md border border-[#c8cfde] bg-white px-2 text-sm"
                                    defaultValue={phase.draw?.requestedAmount ?? ""}
                                    inputMode="decimal"
                                    name="requestedAmount"
                                    placeholder="0"
                                  />
                                </label>
                                <label className="text-xs font-medium text-[#69746f]">
                                  Received
                                  <input
                                    className="mt-1 h-9 w-full rounded-md border border-[#c8cfde] bg-white px-2 text-sm"
                                    defaultValue={phase.draw?.receivedAmount ?? ""}
                                    inputMode="decimal"
                                    name="receivedAmount"
                                    placeholder="0"
                                  />
                                </label>
                                <label className="text-xs font-medium text-[#69746f]">
                                  Submitted Date
                                  <input
                                    className="mt-1 h-9 w-full rounded-md border border-[#c8cfde] bg-white px-2 text-sm"
                                    defaultValue={phase.draw?.submittedDate ?? ""}
                                    name="submittedDate"
                                    type="date"
                                  />
                                </label>
                                <label className="text-xs font-medium text-[#69746f]">
                                  Received Date
                                  <input
                                    className="mt-1 h-9 w-full rounded-md border border-[#c8cfde] bg-white px-2 text-sm"
                                    defaultValue={phase.draw?.receivedDate ?? ""}
                                    name="receivedDate"
                                    type="date"
                                  />
                                </label>
                                <label className="text-xs font-medium text-[#69746f]">
                                  Accountant
                                  <select
                                    className="mt-1 h-9 w-full rounded-md border border-[#c8cfde] bg-white px-2 text-sm"
                                    defaultValue={phase.draw?.accountantStatus ?? ""}
                                    name="accountantStatus"
                                  >
                                    <option value="">Status</option>
                                    <option value="waiting">Waiting</option>
                                    <option value="reviewed">Reviewed</option>
                                    <option value="approved">Approved</option>
                                    <option value="blocked">Blocked</option>
                                  </select>
                                </label>
                              </div>
                              <label className="mt-3 block text-xs font-medium text-[#69746f]">
                                Notes
                                <textarea
                                  className="mt-1 min-h-16 w-full rounded-md border border-[#c8cfde] bg-white px-2 py-2 text-sm"
                                  defaultValue={phase.draw?.notes ?? ""}
                                  name="notes"
                                  placeholder="Example: waiting on lender deposit, accountant reviewed, draw sent..."
                                />
                              </label>
                              <div className="mt-3 flex justify-end">
                                <button
                                  className="rounded-md bg-[#ff332b] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#121d49]"
                                  type="submit"
                                >
                                  Save Draw
                                </button>
                              </div>
                            </form>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function ChecklistItem({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-sm text-[#121a36]">
      <span
        className={`grid h-5 w-5 place-items-center rounded border text-xs font-bold ${
          checked
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-[#c8cfde] bg-white text-transparent"
        }`}
      >
        ✓
      </span>
      <span className={checked ? "font-medium text-[#2d8f66]" : "text-[#69746f]"}>{label}</span>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-[#dfe5dc] bg-white p-4 shadow-sm">
      <div className="text-xs font-bold uppercase text-[#69746f]">{label}</div>
      <div className="mt-3 text-2xl font-bold text-[#121d49]">{value}</div>
      <div className="mt-1 text-xs text-[#69746f]">{detail}</div>
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active = false,
  href,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  active?: boolean;
  href?: string;
}) {
  const className = `flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm ${
    active
      ? "border-l-4 border-[#ff332b] bg-[#fff0ef] font-bold text-[#ff332b]"
      : "text-[#5f6b66] hover:bg-[#fff0ef] hover:text-[#ff332b]"
  }`;

  if (href) {
    return (
      <Link className={className} href={href}>
        <Icon size={17} />
        {label}
      </Link>
    );
  }

  return (
    <div className={className}>
      <Icon size={17} />
      {label}
    </div>
  );
}
