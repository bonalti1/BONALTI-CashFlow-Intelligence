"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, RefreshCw, Search } from "lucide-react";

import { checkLiveBalances } from "@/app/actions/plaid";
import {
  accountKind,
  accountState,
  spendable,
  summarizeAccounts,
  type AccountRow,
  type AccountState,
} from "@/lib/plaid/account-view";

type CheckResult = Awaited<ReturnType<typeof checkLiveBalances>>;
type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; at: string; banks: Extract<CheckResult, { ok: true }>["banks"] }
  | { status: "failed"; message: string };
type Filter = "all" | "projects" | "unlinked" | "attention";
type Sort = "project" | "money" | "name";

const timeZone = "America/Chicago";

function currency(value: number | null) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(value);
}

function exactTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

function clockTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone }).format(new Date(iso));
}

// Reads after "Checked": "Checked just now", "Checked 5 min ago", "Checked on Oct 12, …".
function checkedPhrase(iso: string | null, now: number) {
  if (!iso) {
    return "at an unknown time";
  }

  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));

  if (seconds < 60) {
    return "just now";
  }

  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} min ago`;
  }

  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)} hr ago`;
  }

  return `on ${exactTime(iso)}`;
}

const stateStyles: Record<AccountState, { label: string; dot: string; text: string }> = {
  live: { label: "Live", dot: "bg-[#178d61]", text: "text-[#178d61]" },
  last_known: { label: "Last known", dot: "bg-[#d99a1e]", text: "text-[#9a6200]" },
  needs_sign_in: { label: "Needs sign-in", dot: "bg-[#d94736]", text: "text-[#b32f24]" },
  not_reported: { label: "Not in bank's latest report", dot: "bg-[#b9bdc9]", text: "text-[#858b9f]" },
  duplicate: { label: "Counted once", dot: "bg-[#b9bdc9]", text: "text-[#858b9f]" },
};

const bankStatusLabels: Record<AccountRow["connectionStatus"], { label: string; className: string }> = {
  live: { label: "Checked live", className: "border-[#a8dfc5] bg-[#effaf4] text-[#178d61]" },
  last_known: { label: "Bank didn't answer · last known", className: "border-[#f0d9a8] bg-[#fff8e8] text-[#9a6200]" },
  needs_sign_in: { label: "Needs a new sign-in", className: "border-[#f1c4bf] bg-[#fdf0ee] text-[#b32f24]" },
  error: { label: "Couldn't reach bank", className: "border-[#f1c4bf] bg-[#fdf0ee] text-[#b32f24]" },
  unchecked: { label: "Not checked yet", className: "border-[#e7e1d3] bg-[#fbfaf6] text-[#858b9f]" },
};

export function ConnectedAccounts({
  accounts,
  canCheckLive,
  renderedAt,
}: {
  accounts: AccountRow[];
  canCheckLive: boolean;
  renderedAt: number;
}) {
  const router = useRouter();
  const [check, setCheck] = useState<CheckState>(canCheckLive ? { status: "checking" } : { status: "idle" });
  const [now, setNow] = useState(renderedAt);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("project");

  const applyResult = useCallback(
    (result: CheckResult) => {
      if (result.ok) {
        setCheck({ status: "done", at: result.checkedAt, banks: result.banks });
        setNow(Date.now());
        router.refresh();
      } else {
        setCheck({ status: "failed", message: result.message });
      }
    },
    [router],
  );

  // Plaid charges per live check, so only an admin's visit asks the banks; everyone else
  // sees the balances from the last admin check, with their time.
  useEffect(() => {
    if (!canCheckLive) {
      return;
    }

    let cancelled = false;

    void checkLiveBalances().then((result) => {
      if (!cancelled) {
        applyResult(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [applyResult, canCheckLive]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);

    return () => clearInterval(timer);
  }, []);

  async function checkAgain() {
    setCheck({ status: "checking" });
    applyResult(await checkLiveBalances({ force: true }));
  }

  const summary = useMemo(() => summarizeAccounts(accounts, now), [accounts, now]);
  const lastLiveCheck = useMemo(
    () =>
      accounts
        .filter((row) => row.balanceSource === "live" && row.balanceAsOf)
        .map((row) => row.balanceAsOf as string)
        .sort()
        .at(-1) ?? null,
    [accounts],
  );

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = accounts.filter((row) => {
      const state = accountState(row, summary.duplicates, now);

      if (filter === "projects" && !row.projectLabel) return false;
      if (filter === "unlinked" && row.projectLabel) return false;
      if (filter === "attention" && state === "live") return false;

      if (!needle) {
        return true;
      }

      return [row.name, row.officialName, row.mask, row.projectLabel, row.institutionName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });

    visible.sort((a, b) => {
      if (sort === "money") return spendable(b) - spendable(a);
      if (sort === "name") return a.name.localeCompare(b.name);

      return (
        (a.projectNumber ?? Number.MAX_SAFE_INTEGER) - (b.projectNumber ?? Number.MAX_SAFE_INTEGER) ||
        (a.projectLabel ?? "~").localeCompare(b.projectLabel ?? "~") ||
        a.name.localeCompare(b.name)
      );
    });

    const byBank = new Map<string, AccountRow[]>();

    for (const row of visible) {
      byBank.set(row.itemId, [...(byBank.get(row.itemId) ?? []), row]);
    }

    const banks = [...byBank.entries()].sort(
      ([, a], [, b]) =>
        a[0].institutionName.localeCompare(b[0].institutionName) ||
        b.filter((row) => !summary.duplicates.has(row.id)).length -
          a.filter((row) => !summary.duplicates.has(row.id)).length,
    );

    return { shown: visible.length, banks };
  }, [accounts, filter, now, query, sort, summary.duplicates]);

  const failedBanks = check.status === "done" ? check.banks.filter((bank) => bank.status !== "live") : [];
  const liveBanks = check.status === "done" ? check.banks.length - failedBanks.length : 0;

  return (
    <section className="mb-5 rounded-[18px] border border-[#ded9cb] bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e7e1d3] px-5 py-4">
        <div>
          <h2 className="text-lg font-black uppercase tracking-[0.12em] text-[#14254b]">Connected Accounts</h2>
          <p className="mt-1 text-sm font-bold text-[#858b9f]">
            {canCheckLive
              ? "Each time you open this page, every bank is asked for its balance right now."
              : "Balances are checked live with each bank when an admin opens this page."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveCheckPill
            check={check}
            lastLiveCheck={lastLiveCheck}
            liveBanks={liveBanks}
            totalBanks={check.status === "done" ? check.banks.length : 0}
          />
          {canCheckLive ? (
            <button
              className="flex h-10 items-center gap-2 rounded-md border border-[#d8ded3] bg-white px-3 text-xs font-black uppercase tracking-[0.08em] text-[#14254b] disabled:opacity-50"
              disabled={check.status === "checking"}
              onClick={checkAgain}
              type="button"
            >
              <RefreshCw size={14} />
              Check again
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 border-b border-[#e7e1d3] p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Total
          detail={
            summary.notLiveAvailable > 0
              ? `${currency(summary.liveAvailable)} checked live · ${currency(summary.notLiveAvailable)} last known`
              : `All ${summary.counted} cash accounts checked live`
          }
          label="Cash available now"
          tone="good"
          value={currency(summary.cashAvailable)}
        />
        <Total
          detail="Before pending charges and holds"
          label="Bank balance"
          value={currency(summary.cashCurrent)}
        />
        <Total
          detail="Credit cards and loans, not counted as cash"
          label="Owed"
          value={currency(summary.owed)}
        />
        <Total
          detail={notLiveDetail(summary.states)}
          label="Not checked live"
          tone={notLiveCount(summary.states) > 0 ? "warn" : "neutral"}
          value={String(notLiveCount(summary.states))}
        />
      </div>

      {failedBanks.length > 0 || check.status === "failed" || summary.duplicates.size > 0 ? (
        <div className="space-y-2 border-b border-[#e7e1d3] px-5 py-4" role="status">
          {check.status === "failed" ? <Notice message={check.message} /> : null}
          {summary.duplicates.size > 0 ? (
            <Notice
              message={`The same bank is connected more than once, so ${summary.duplicates.size} account${summary.duplicates.size === 1 ? " appears" : "s appear"} twice. Each is counted once in the totals.`}
            />
          ) : null}
          {failedBanks.map((bank) => (
            <Notice key={bank.itemId} message={`${bank.institutionName ?? "One bank"}: ${bank.message ?? "could not be checked live."}`} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-b border-[#e7e1d3] px-5 py-4">
        <label className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca2b5]" size={16} />
          <span className="sr-only">Search accounts</span>
          <input
            className="h-10 w-full rounded-md border border-[#d8ded3] bg-white pl-9 pr-3 text-sm font-bold text-[#14254b] outline-none focus:border-[#14254b]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search account, last 4 digits, project or bank"
            value={query}
          />
        </label>
        <div className="flex flex-wrap gap-1 rounded-md border border-[#d8ded3] p-1">
          {(
            [
              ["all", "All"],
              ["projects", "Linked to a project"],
              ["unlinked", "Not linked"],
              ["attention", "Not live"],
            ] as Array<[Filter, string]>
          ).map(([value, label]) => (
            <button
              className={`rounded px-2.5 py-1.5 text-xs font-black ${filter === value ? "bg-[#14254b] text-white" : "text-[#858b9f] hover:text-[#14254b]"}`}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#9ca2b5]">
          Sort
          <select
            className="h-10 rounded-md border border-[#d8ded3] bg-white px-2 text-sm font-bold normal-case tracking-normal text-[#14254b]"
            onChange={(event) => setSort(event.target.value as Sort)}
            value={sort}
          >
            <option value="project">Project</option>
            <option value="money">Most money</option>
            <option value="name">Account name</option>
          </select>
        </label>
        <span className="text-xs font-bold text-[#9ca2b5]">
          Showing {groups.shown} of {accounts.length}
        </span>
      </div>

      {accounts.length === 0 ? (
        <p className="p-5 text-sm font-bold text-[#858b9f]">No bank accounts are connected yet. Use Connect Bank above.</p>
      ) : groups.shown === 0 ? (
        <p className="p-5 text-sm font-bold text-[#858b9f]">No accounts match this search.</p>
      ) : (
        groups.banks.map(([itemId, rows]) => {
          const bankStatus = bankStatusLabels[rows[0].connectionStatus];
          const subtotal = rows
            .filter((row) => accountKind(row) === "cash")
            .filter((row) => {
              const state = accountState(row, summary.duplicates, now);
              return state !== "duplicate" && state !== "not_reported";
            })
            .reduce((total, row) => total + spendable(row), 0);

          return (
            <div className="border-b border-[#e7e1d3] last:border-b-0" key={itemId}>
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#fbfaf6] px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-[#14254b]">{rows[0].institutionName}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${bankStatus.className}`}>
                    {bankStatus.label}
                  </span>
                  <span className="text-xs font-bold text-[#9ca2b5]">
                    {rows.length} account{rows.length === 1 ? "" : "s"}
                    {rows.every((row) => summary.duplicates.has(row.id))
                      ? " · same bank connected again, already counted"
                      : ""}
                  </span>
                </div>
                <span className="text-sm font-black text-[#14254b]">{currency(subtotal)} available</span>
              </div>

              <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-4 px-5 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#9ca2b5] md:grid">
                <span>Account</span>
                <span>Project</span>
                <span className="text-right">Available now</span>
                <span className="text-right">Bank balance</span>
                <span>Status</span>
              </div>

              <ul className="divide-y divide-[#eee8da]">
                {rows.map((row) => (
                  <AccountLine
                    duplicateOf={summary.duplicates.get(row.id) ?? null}
                    key={row.id}
                    now={now}
                    row={row}
                    state={accountState(row, summary.duplicates, now)}
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}

function notLiveCount(states: Record<AccountState, number>) {
  return states.last_known + states.needs_sign_in + states.not_reported;
}

function notLiveDetail(states: Record<AccountState, number>) {
  const parts = [
    states.needs_sign_in ? `${states.needs_sign_in} need${states.needs_sign_in === 1 ? "s" : ""} a bank sign-in` : null,
    states.last_known ? `${states.last_known} last known` : null,
    states.not_reported ? `${states.not_reported} not in bank's report` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "Every account was checked live";
}

function LiveCheckPill({
  check,
  lastLiveCheck,
  liveBanks,
  totalBanks,
}: {
  check: CheckState;
  lastLiveCheck: string | null;
  liveBanks: number;
  totalBanks: number;
}) {
  if (check.status === "idle") {
    return (
      <span
        className="flex h-10 items-center gap-2 rounded-md bg-[#f6f5f0] px-3 text-xs font-black text-[#5f6b7d]"
        role="status"
        title={lastLiveCheck ? exactTime(lastLiveCheck) : undefined}
      >
        <span className="h-2 w-2 rounded-full bg-[#b9bdc9]" />
        {lastLiveCheck ? `Last live check: ${exactTime(lastLiveCheck)}` : "Not checked live yet"}
      </span>
    );
  }

  if (check.status === "checking") {
    return (
      <span className="flex h-10 items-center gap-2 rounded-md bg-[#eef1f7] px-3 text-xs font-black text-[#14254b]" role="status">
        <LoaderCircle className="animate-spin" size={14} />
        Checking your banks live…
      </span>
    );
  }

  if (check.status === "failed") {
    return (
      <span className="flex h-10 items-center gap-2 rounded-md bg-[#fdf0ee] px-3 text-xs font-black text-[#b32f24]" role="status">
        <CircleAlert size={14} />
        Live check failed
      </span>
    );
  }

  const allLive = liveBanks === totalBanks;

  return (
    <span
      className={`flex h-10 items-center gap-2 rounded-md px-3 text-xs font-black ${allLive ? "bg-[#effaf4] text-[#178d61]" : "bg-[#fff8e8] text-[#9a6200]"}`}
      role="status"
      title={exactTime(check.at)}
    >
      <span className={`h-2 w-2 rounded-full ${allLive ? "bg-[#178d61]" : "bg-[#d99a1e]"}`} />
      {allLive
        ? `All ${totalBanks} banks checked live at ${clockTime(check.at)}`
        : `${liveBanks} of ${totalBanks} banks checked live at ${clockTime(check.at)}`}
    </span>
  );
}

function Total({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "good" | "warn" | "neutral";
}) {
  return (
    <div className="rounded-[14px] border border-[#eee8da] p-4">
      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#9ca2b5]">{label}</div>
      <div
        className={`mt-1 text-2xl font-black tracking-tight ${
          tone === "good" ? "text-[#178d61]" : tone === "warn" ? "text-[#d94736]" : "text-[#14254b]"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs font-bold text-[#858b9f]">{detail}</div>
    </div>
  );
}

function Notice({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-[#f0d9a8] bg-[#fff8e8] px-3 py-2 text-sm font-bold text-[#9a6200]">
      <CircleAlert className="mt-0.5 shrink-0" size={15} />
      {message}
    </p>
  );
}

function AccountLine({
  row,
  state,
  now,
  duplicateOf,
}: {
  row: AccountRow;
  state: AccountState;
  now: number;
  duplicateOf: AccountRow | null;
}) {
  const style = stateStyles[state];
  const kind = accountKind(row);
  const muted = state === "duplicate" || state === "not_reported";

  return (
    <li
      className={`grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] md:items-center ${muted ? "opacity-60" : ""}`}
    >
      <div className="col-span-2 min-w-0 md:col-span-1">
        <div className="truncate font-black text-[#14254b]" title={row.name}>
          {row.name}
        </div>
        <div className="truncate text-xs font-bold text-[#858b9f]">
          {row.mask ? `•••• ${row.mask}` : "No account number"}
          {row.officialName && row.officialName !== row.name ? ` · ${row.officialName}` : ""}
          {kind === "debt" ? " · Credit / loan" : ""}
        </div>
      </div>

      <div className="col-span-2 min-w-0 text-sm font-bold md:col-span-1">
        {row.projectLabel ? (
          <span className="text-[#14254b]">{row.projectLabel}</span>
        ) : (
          <span className="text-[#b9bdc9]">Not linked to a project</span>
        )}
      </div>

      <div className="md:text-right">
        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#9ca2b5] md:hidden">
          {kind === "debt" ? "Available credit" : "Available now"}
        </div>
        <div className={`text-lg font-black ${kind === "debt" ? "text-[#14254b]" : "text-[#178d61]"}`}>
          {currency(row.available ?? (kind === "cash" ? row.current : null))}
        </div>
      </div>

      <div className="md:text-right">
        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#9ca2b5] md:hidden">
          {kind === "debt" ? "Owed" : "Bank balance"}
        </div>
        <div className="font-black text-[#14254b]">{currency(row.current)}</div>
      </div>

      <div className="col-span-2 min-w-0 md:col-span-1">
        <div className={`flex items-center gap-1.5 text-xs font-black ${style.text}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
          {style.label}
        </div>
        <div className="text-xs font-bold text-[#858b9f]" title={row.balanceAsOf ? exactTime(row.balanceAsOf) : undefined}>
          {state === "duplicate" && duplicateOf
            ? `Also in ${duplicateOf.institutionName} login`
            : `Checked ${checkedPhrase(row.balanceAsOf, now)}`}
        </div>
      </div>
    </li>
  );
}
