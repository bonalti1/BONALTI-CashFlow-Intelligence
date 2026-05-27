import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Brain,
  ClipboardList,
  Clock3,
  HandCoins,
  LayoutDashboard,
  NotebookText,
  ReceiptText,
  ShieldCheck,
  TrendingDown,
  WalletCards,
} from "lucide-react";

import { AiHealthChat } from "@/app/ai-health/ai-health-chat";
import { getEnvStatus } from "@/lib/env";
import { getHouseDetailsMap } from "@/lib/houses/house-details-store";
import { getAccountsSnapshot } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName } from "@/lib/qbo/bank-account-map";
import { getQboConnectionStatus } from "@/lib/qbo/token-store";
import {
  getTransactionsByBankAccount,
  getTransactionsSnapshotStatus,
  type SavedQboTransaction,
} from "@/lib/qbo/transactions-store";

export const dynamic = "force-dynamic";

const PHASE_COUNT = 6;
const AVERAGE_PROFIT_TARGET = 60_000;
const MARKETING_PER_PHASE = (AVERAGE_PROFIT_TARGET * 0.15) / PHASE_COUNT;
const MANAGEMENT_PER_PHASE = (AVERAGE_PROFIT_TARGET * 0.2) / PHASE_COUNT;
const OPERATIONS_AFTER_CLOSE = AVERAGE_PROFIT_TARGET * 0.05;
const PHASE_ONE_BUDGET_PERCENT = 0.10778;
const DRAFT_TOTAL_BUDGET_PERCENT = 0.75578;
const STALL_WARNING_DAYS = 7;

type HouseRow = {
  id: string;
  house: string;
  soldPrice: number | null;
  setupComplete: boolean;
  checksSeen: number;
  unclearedCount: number;
  unknownClearStatusCount: number;
  lastActivityDate: string | null;
  daysSinceLastActivity: number | null;
  phaseOneBudget: number | null;
  phaseOneOverage: number;
  profitIfOnBudget: number | null;
  profitAfterChecksSeen: number | null;
  transactions: SavedQboTransaction[];
};

type ActionItem = {
  house: string;
  issue: string;
  why: string;
  nextStep: string;
  tone: "red" | "amber";
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function daysSince(date: string | null) {
  if (!date) {
    return null;
  }

  const start = new Date(`${date}T00:00:00`);
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;

  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / msPerDay));
}

function buildActionItems(houses: HouseRow[]) {
  const items: ActionItem[] = [];

  for (const house of houses) {
    if (!house.setupComplete) {
      items.push({
        house: house.house,
        issue: "House setup missing",
        why: "Profit and budget math need sold price, square footage, and city.",
        nextStep: "Finish this house in House Setup.",
        tone: "amber",
      });
    }

    if (house.phaseOneOverage > 0) {
      items.push({
        house: house.house,
        issue: "Phase 1 budget watch",
        why: `${currency(house.phaseOneOverage)} over the draft Phase 1 target.`,
        nextStep: "Review Phase 1 checks with accounting.",
        tone: "red",
      });
    }

    if (house.unclearedCount > 0) {
      items.push({
        house: house.house,
        issue: "Waiting on checks",
        why: `${house.unclearedCount} checks are marked not cleared.`,
        nextStep: "Confirm with accountant after daily reconcile.",
        tone: "amber",
      });
    }

    if (
      house.daysSinceLastActivity === null ||
      house.daysSinceLastActivity >= STALL_WARNING_DAYS
    ) {
      items.push({
        house: house.house,
        issue: "Stalled project watch",
        why:
          house.daysSinceLastActivity === null
            ? "No synced activity has been found yet."
            : `${house.daysSinceLastActivity} days since last synced activity.`,
        nextStep: "Check if work is paused or if QuickBooks needs updates.",
        tone: "amber",
      });
    }
  }

  return items.slice(0, 12);
}

function buildBrief({
  actionItems,
  houses,
  totalPhaseOneOverage,
  waitingChecks,
  stalledCount,
}: {
  actionItems: ActionItem[];
  houses: HouseRow[];
  totalPhaseOneOverage: number;
  waitingChecks: number;
  stalledCount: number;
}) {
  if (!houses.length) {
    return "QuickBooks is connected, but no confirmed house bank accounts are available yet. Sync QuickBooks and confirm house mapping first.";
  }

  if (!actionItems.length) {
    return `Today looks clean. ${houses.length} active houses are visible, no stalled projects are flagged, and no not-cleared checks need attention from the synced data.`;
  }

  const firstIssue = actionItems[0];
  const riskText =
    totalPhaseOneOverage > 0
      ? ` Phase 1 draft risk is ${currency(totalPhaseOneOverage)}.`
      : "";
  const checksText = waitingChecks > 0 ? ` ${waitingChecks} checks are waiting on clearing.` : "";
  const stalledText = stalledCount > 0 ? ` ${stalledCount} houses need stalled-project review.` : "";

  return `${firstIssue.house} is the first item to review because of ${firstIssue.issue.toLowerCase()}.${riskText}${checksText}${stalledText}`;
}

export default async function AgentHealthPage() {
  const [
    snapshot,
    qboConnection,
    transactionStatus,
    detailsByBankAccount,
    transactionsByBankAccount,
    env,
  ] = await Promise.all([
    getAccountsSnapshot().catch(() => null),
    getQboConnectionStatus(),
    getTransactionsSnapshotStatus(),
    getHouseDetailsMap(),
    getTransactionsByBankAccount(),
    getEnvStatus(),
  ]);
  const openAiReady = Boolean(env.find((item) => item.key === "OPENAI_API_KEY")?.configured);
  const bankAccounts = snapshot?.accounts.filter((account) => account.AccountType === "Bank") ?? [];
  const houses: HouseRow[] = bankAccounts
    .map((account) => {
      const house = getConfirmedHouseName(account);

      if (!house) {
        return null;
      }

      const details = detailsByBankAccount.get(account.Id);
      const transactions = (transactionsByBankAccount.get(account.Id) ?? []).sort((a, b) =>
        String(b.txnDate ?? "").localeCompare(String(a.txnDate ?? "")),
      );
      const soldPrice = details?.soldPrice ?? null;
      const phaseOneBudget = soldPrice ? soldPrice * PHASE_ONE_BUDGET_PERCENT : null;
      const checksSeen = transactions.reduce(
        (total, transaction) => total + Math.abs(transaction.totalAmount),
        0,
      );
      const draftBudget = soldPrice ? soldPrice * DRAFT_TOTAL_BUDGET_PERCENT : null;
      const profitIfOnBudget = soldPrice && draftBudget ? soldPrice - draftBudget : null;
      const profitAfterChecksSeen = soldPrice ? soldPrice - checksSeen : null;
      const lastActivityDate = transactions[0]?.txnDate ?? null;

      return {
        id: account.Id,
        house,
        soldPrice,
        setupComplete: Boolean(details?.soldPrice && details?.squareFootage && details?.city),
        checksSeen,
        unclearedCount: transactions.filter((transaction) => transaction.clearedStatus === "not_cleared")
          .length,
        unknownClearStatusCount: transactions.filter(
          (transaction) => transaction.clearedStatus === "unknown",
        ).length,
        lastActivityDate,
        daysSinceLastActivity: daysSince(lastActivityDate),
        phaseOneBudget,
        phaseOneOverage:
          phaseOneBudget && checksSeen > phaseOneBudget ? checksSeen - phaseOneBudget : 0,
        profitIfOnBudget,
        profitAfterChecksSeen,
        transactions,
      };
    })
    .filter((row): row is HouseRow => Boolean(row))
    .sort((a, b) => a.house.localeCompare(b.house));

  const actionItems = buildActionItems(houses);
  const totalPhaseOneOverage = houses.reduce((total, house) => total + house.phaseOneOverage, 0);
  const waitingChecks = houses.reduce((total, house) => total + house.unclearedCount, 0);
  const unknownChecks = houses.reduce((total, house) => total + house.unknownClearStatusCount, 0);
  const stalledCount = houses.filter(
    (house) =>
      house.daysSinceLastActivity === null || house.daysSinceLastActivity >= STALL_WARNING_DAYS,
  ).length;
  const profitWatch = houses.reduce(
    (total, house) => total + Math.max(0, (house.profitIfOnBudget ?? 0) - (house.profitAfterChecksSeen ?? 0)),
    0,
  );
  const brief = buildBrief({
    actionItems,
    houses,
    totalPhaseOneOverage,
    waitingChecks,
    stalledCount,
  });
  const lastSync =
    transactionStatus.synced && transactionStatus.syncedAt
      ? new Date(transactionStatus.syncedAt).toLocaleString()
      : "Transactions not synced";

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-[#121a36]">
      <div className="grid min-h-screen grid-cols-[248px_1fr]">
        <aside className="border-r border-[#d9dee9] bg-white px-5 py-5">
          <div className="mb-8">
            <div className="mb-4 rounded-lg border border-[#d9dee9] bg-white p-3">
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
            <NavItem href="/ai-health" icon={Brain} label="AI Health Center" />
            <NavItem href="/payees" icon={HandCoins} label="Payees" />
            <NavItem active icon={NotebookText} label="Agent Health Notes" />
            <NavItem href="/setup" icon={ShieldCheck} label="Setup" />
          </nav>
        </aside>

        <section className="min-w-0 px-6 py-5">
          <header className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="brand-kicker text-xs font-bold uppercase text-[#ff332b]">
                Agent health notes
              </p>
              <h1 className="mt-1 text-3xl font-semibold text-[#121d49]">
                What Matters Today
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f6b66]">
                A short AI-ready dashboard. It shows only the things that need attention, then lets
                you ask questions.
              </p>
            </div>
            <div
              className={`rounded-md border px-3 py-2 text-sm font-bold ${
                qboConnection.connected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              QB {qboConnection.connected ? "connected" : "needs reconnect"}
            </div>
          </header>

          <section className="mb-5 rounded-lg bg-[#121a36] p-5 text-white">
            <div className="flex gap-3">
              <Brain className="mt-1 text-[#ff332b]" size={22} />
              <div>
                <p className="brand-kicker text-xs font-bold uppercase text-[#ffb8b4]">
                  Today&apos;s AI Brief
                </p>
                <p className="mt-2 max-w-5xl text-sm leading-6 text-white/90">{brief}</p>
                <p className="mt-2 text-xs text-white/60">Last transaction sync: {lastSync}</p>
              </div>
            </div>
          </section>

          <section className="mb-5 grid grid-cols-4 gap-3">
            <SignalCard
              detail="Houses with something to check"
              icon={AlertTriangle}
              label="Needs Review"
              tone={actionItems.length ? "red" : "green"}
              value={String(new Set(actionItems.map((item) => item.house)).size)}
            />
            <SignalCard
              detail="Provisional profit pressure"
              icon={TrendingDown}
              label="Profit Watch"
              tone={profitWatch > 0 ? "amber" : "green"}
              value={currency(profitWatch)}
            />
            <SignalCard
              detail={`${unknownChecks} checks have unknown status`}
              icon={ReceiptText}
              label="Waiting On Checks"
              tone={waitingChecks > 0 ? "amber" : "green"}
              value={String(waitingChecks)}
            />
            <SignalCard
              detail={`${STALL_WARNING_DAYS}+ days or no activity`}
              icon={Clock3}
              label="Stalled Projects"
              tone={stalledCount > 0 ? "amber" : "green"}
              value={String(stalledCount)}
            />
          </section>

          <section className="grid grid-cols-[1fr_390px] gap-4">
            <div className="space-y-4">
              <section className="rounded-lg border border-[#dfe5dc] bg-white">
                <div className="border-b border-[#edf0eb] px-4 py-3">
                  <h2 className="text-sm font-semibold">Action List</h2>
                  <p className="mt-1 text-xs text-[#69746f]">
                    Only houses that need attention show here.
                  </p>
                </div>

                {actionItems.length ? (
                  <div className="overflow-auto">
                    <table className="w-full min-w-[850px] border-collapse text-sm">
                      <thead className="bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
                        <tr>
                          <th className="px-4 py-3 font-medium">House</th>
                          <th className="px-4 py-3 font-medium">Issue</th>
                          <th className="px-4 py-3 font-medium">Why It Matters</th>
                          <th className="px-4 py-3 font-medium">Suggested Next Step</th>
                        </tr>
                      </thead>
                      <tbody>
                        {actionItems.map((item) => (
                          <tr
                            className="border-t border-[#edf0eb]"
                            key={`${item.house}-${item.issue}`}
                          >
                            <td className="px-4 py-3 font-semibold">{item.house}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                                  item.tone === "red"
                                    ? "border-red-200 bg-red-50 text-[#ff332b]"
                                    : "border-amber-200 bg-amber-50 text-amber-700"
                                }`}
                              >
                                {item.issue}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[#4f5b56]">{item.why}</td>
                            <td className="px-4 py-3 text-[#4f5b56]">{item.nextStep}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-5 text-sm text-emerald-700">
                    Nothing urgent is showing from the synced data.
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                <h2 className="text-sm font-semibold">Internal Draw Rules</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <DrawRule
                    icon={WalletCards}
                    label="Marketing"
                    value={`${currency(MARKETING_PER_PHASE)} per phase`}
                  />
                  <DrawRule
                    icon={HandCoins}
                    label="Management"
                    value={`${currency(MANAGEMENT_PER_PHASE)} per phase`}
                  />
                  <DrawRule
                    icon={ShieldCheck}
                    label="Operations"
                    value={`${currency(OPERATIONS_AFTER_CLOSE)} after close`}
                  />
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Brain className="text-[#ff332b]" size={18} />
                  <h2 className="text-sm font-semibold">Ask AI</h2>
                </div>
                <AiHealthChat openAiReady={openAiReady} />
              </section>

              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h2 className="text-sm font-semibold text-amber-900">Data Note</h2>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Budget risk is still provisional until the Chart of Accounts cleanup is finished.
                  This page is designed to point attention, not make final accounting decisions.
                </p>
              </section>
            </aside>
          </section>
        </section>
      </div>
    </main>
  );
}

function SignalCard({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: typeof AlertTriangle;
  label: string;
  tone: "green" | "amber" | "red";
  value: string;
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "red"
        ? "border-red-200 bg-red-50 text-[#ff332b]"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold uppercase">{label}</div>
        <Icon size={18} />
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs opacity-80">{detail}</div>
    </div>
  );
}

function DrawRule({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#edf0eb] bg-[#fbfcfa] p-3">
      <Icon className="text-[#ff332b]" size={18} />
      <div className="mt-2 text-xs font-bold uppercase text-[#69746f]">{label}</div>
      <div className="mt-1 font-semibold text-[#121d49]">{value}</div>
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
      ? "bg-[#fff0ef] font-bold text-[#ff332b]"
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
