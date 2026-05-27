import Link from "next/link";
import Image from "next/image";
import {
  AlertTriangle,
  Bot,
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
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName, isInternalBankAccount } from "@/lib/qbo/bank-account-map";
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
const DRAFT_TOTAL_BUDGET_PERCENT = 0.75578;
const PHASE_ONE_BUDGET_PERCENT = 0.10778;
const STALL_WARNING_DAYS = 7;

type HouseAgentRow = {
  id: string;
  house: string;
  bank: string;
  soldPrice: number | null;
  squareFootage: number | null;
  city: string | null;
  setupComplete: boolean;
  checksSeen: number;
  transactionCount: number;
  unclearedCount: number;
  unknownClearStatusCount: number;
  lastActivityDate: string | null;
  daysSinceLastActivity: number | null;
  phaseOneBudget: number | null;
  phaseOneOverage: number;
  draftBudget: number | null;
  profitIfOnBudget: number | null;
  profitAfterChecksSeen: number | null;
  status: "Healthy" | "Watch" | "Needs setup";
  transactions: SavedQboTransaction[];
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function accountName(account: QboAccount) {
  return account.FullyQualifiedName ?? account.Name;
}

function bankBalance(account: QboAccount) {
  return account.CurrentBalance ?? 0;
}

function accountNameIncludes(account: QboAccount, matcher: string) {
  return accountName(account).toLowerCase().includes(matcher);
}

function sumAccountBalances(accounts: QboAccount[]) {
  return accounts.reduce((total, account) => total + bankBalance(account), 0);
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

function rowStatus(row: Omit<HouseAgentRow, "status">): HouseAgentRow["status"] {
  if (!row.setupComplete) {
    return "Needs setup";
  }

  if (
    row.phaseOneOverage > 0 ||
    row.unclearedCount > 0 ||
    (row.daysSinceLastActivity !== null && row.daysSinceLastActivity >= STALL_WARNING_DAYS)
  ) {
    return "Watch";
  }

  return "Healthy";
}

function statusClasses(status: HouseAgentRow["status"]) {
  if (status === "Healthy") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "Watch") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-red-200 bg-red-50 text-[#ff332b]";
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
  const houses: HouseAgentRow[] = bankAccounts
    .map((account) => {
      const house = getConfirmedHouseName(account);

      if (!house) {
        return null;
      }

      const details = detailsByBankAccount.get(account.Id);
      const transactions = (transactionsByBankAccount.get(account.Id) ?? []).sort((a, b) =>
        String(b.txnDate ?? "").localeCompare(String(a.txnDate ?? "")),
      );
      const checksSeen = transactions.reduce(
        (total, transaction) => total + Math.abs(transaction.totalAmount),
        0,
      );
      const soldPrice = details?.soldPrice ?? null;
      const squareFootage = details?.squareFootage ?? null;
      const city = details?.city ?? null;
      const setupComplete = Boolean(soldPrice && squareFootage && city);
      const phaseOneBudget = soldPrice ? soldPrice * PHASE_ONE_BUDGET_PERCENT : null;
      const phaseOneOverage =
        phaseOneBudget && checksSeen > phaseOneBudget ? checksSeen - phaseOneBudget : 0;
      const draftBudget = soldPrice ? soldPrice * DRAFT_TOTAL_BUDGET_PERCENT : null;
      const profitIfOnBudget = soldPrice && draftBudget ? soldPrice - draftBudget : null;
      const profitAfterChecksSeen = soldPrice ? soldPrice - checksSeen : null;
      const lastActivityDate = transactions[0]?.txnDate ?? null;
      const rowWithoutStatus = {
        id: account.Id,
        house,
        bank: accountName(account),
        soldPrice,
        squareFootage,
        city,
        setupComplete,
        checksSeen,
        transactionCount: transactions.length,
        unclearedCount: transactions.filter((transaction) => transaction.clearedStatus === "not_cleared")
          .length,
        unknownClearStatusCount: transactions.filter(
          (transaction) => transaction.clearedStatus === "unknown",
        ).length,
        lastActivityDate,
        daysSinceLastActivity: daysSince(lastActivityDate),
        phaseOneBudget,
        phaseOneOverage,
        draftBudget,
        profitIfOnBudget,
        profitAfterChecksSeen,
        transactions,
      };

      return {
        ...rowWithoutStatus,
        status: rowStatus(rowWithoutStatus),
      };
    })
    .filter((row): row is HouseAgentRow => Boolean(row))
    .sort((a, b) => {
      const statusOrder = { Watch: 0, "Needs setup": 1, Healthy: 2 };

      return statusOrder[a.status] - statusOrder[b.status] || a.house.localeCompare(b.house);
    });
  const internalAccounts = bankAccounts.filter((account) => isInternalBankAccount(account));
  const incomeClearingAccounts = internalAccounts.filter((account) =>
    accountNameIncludes(account, "income clearing"),
  );
  const lastAccountSync = snapshot ? new Date(snapshot.syncedAt).toLocaleString() : "Not synced";
  const lastTransactionSync =
    transactionStatus.synced && transactionStatus.syncedAt
      ? new Date(transactionStatus.syncedAt).toLocaleString()
      : "Not synced yet";
  const setupCompleteCount = houses.filter((house) => house.setupComplete).length;
  const totalProfitIfOnBudget = houses.reduce(
    (total, house) => total + (house.profitIfOnBudget ?? 0),
    0,
  );
  const totalProfitAfterChecksSeen = houses.reduce(
    (total, house) => total + (house.profitAfterChecksSeen ?? 0),
    0,
  );
  const totalPhaseOneOverage = houses.reduce((total, house) => total + house.phaseOneOverage, 0);
  const waitingChecks = houses.reduce((total, house) => total + house.unclearedCount, 0);
  const stalledHouses = houses.filter(
    (house) =>
      house.daysSinceLastActivity === null || house.daysSinceLastActivity >= STALL_WARNING_DAYS,
  );

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
          <header className="mb-5">
            <p className="brand-kicker text-xs font-bold uppercase text-[#ff332b]">
              Agent health notes
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-[#121d49]">
              What The Agent Can Trust Today
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f6b66]">
              This page keeps the agent explanation out of the way of the main dashboard. It shows
              what is real data today and what still needs the next data layer.
            </p>
          </header>

          <section className="mb-5 grid grid-cols-4 gap-3">
            <StatusCard label="QuickBooks" value={qboConnection.connected ? "Connected" : "Needs reconnect"} />
            <StatusCard label="Ready Houses" value={`${setupCompleteCount}/${houses.length}`} />
            <StatusCard label="Waiting Checks" value={String(waitingChecks)} />
            <StatusCard
              label="Stalled Watch"
              value={String(stalledHouses.length)}
            />
          </section>

          <section className="mb-5 grid grid-cols-3 gap-3">
            <StatusCard label="Profit If On Budget" value={currency(totalProfitIfOnBudget)} />
            <StatusCard label="Profit After Checks Seen" value={currency(totalProfitAfterChecksSeen)} />
            <StatusCard label="Phase 1 Risk" value={currency(totalPhaseOneOverage)} />
          </section>

          <section className="grid grid-cols-[1fr_420px] gap-4">
            <div className="space-y-4">
              <section className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-[#fff0ef] text-[#ff332b]">
                    <Bot size={20} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Plain-English Agent Note</h2>
                    <p className="text-xs text-[#69746f]">Read-only and no guessing</p>
                  </div>
                </div>
                <p className="text-sm leading-6 text-[#384641]">
                  The app can see {houses.length} confirmed house bank accounts and{" "}
                  {internalAccounts.length} internal bank accounts from QuickBooks. Today it can
                  trust QuickBooks bank balances, account mapping, and any synced checks/payments.
                  Budget risk is still provisional until the Chart of Accounts cleanup is finished,
                  but this page can already show the main warnings.
                </p>
              </section>

              <section className="rounded-lg border border-[#dfe5dc] bg-white">
                <PanelHeader
                  icon={TrendingDown}
                  title="Budget Risk"
                  subtitle="Right now this uses Phase 1 draft rules. After the Chart of Accounts cleanup, this will read every phase."
                />
                <div className="overflow-auto">
                  <table className="w-full min-w-[980px] border-collapse text-sm">
                    <thead className="bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
                      <tr>
                        <th className="px-4 py-3 font-medium">House</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 text-right font-medium">Spent Seen</th>
                        <th className="px-4 py-3 text-right font-medium">P1 Budget</th>
                        <th className="px-4 py-3 text-right font-medium">P1 Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {houses.map((house) => (
                        <tr className="border-t border-[#edf0eb]" key={house.id}>
                          <td className="px-4 py-3">
                            <div className="font-semibold">{house.house}</div>
                            <div className="text-xs text-[#69746f]">{house.city ?? "City missing"}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(house.status)}`}
                            >
                              {house.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {currency(house.checksSeen)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {house.phaseOneBudget ? currency(house.phaseOneBudget) : "Needs price"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {house.phaseOneOverage > 0 ? (
                              <span className="font-bold text-[#ff332b]">
                                {currency(house.phaseOneOverage)} over
                              </span>
                            ) : house.phaseOneBudget ? (
                              <span className="font-bold text-emerald-700">On watch, no overage</span>
                            ) : (
                              "Needs setup"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-[#dfe5dc] bg-white">
                <PanelHeader
                  icon={WalletCards}
                  title="Profit Forecast"
                  subtitle="Shows what profit should look like if the house stays on the draft budget, and what remains after checks seen."
                />
                <div className="grid gap-3 p-4 md:grid-cols-2">
                  {houses.map((house) => (
                    <div className="rounded-lg border border-[#edf0eb] bg-[#fbfcfa] p-4" key={house.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{house.house}</h3>
                          <p className="mt-1 text-xs text-[#69746f]">
                            Sold: {house.soldPrice ? currency(house.soldPrice) : "Missing"} · Sqft:{" "}
                            {house.squareFootage ?? "Missing"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-bold ${statusClasses(house.status)}`}
                        >
                          {house.status}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <MiniMetric
                          label="If on budget"
                          value={house.profitIfOnBudget ? currency(house.profitIfOnBudget) : "Needs setup"}
                        />
                        <MiniMetric
                          label="After checks seen"
                          value={
                            house.profitAfterChecksSeen
                              ? currency(house.profitAfterChecksSeen)
                              : "Needs setup"
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-[#dfe5dc] bg-white">
                <PanelHeader
                  icon={ReceiptText}
                  title="Waiting On Checks"
                  subtitle="This shows checks that QuickBooks says are not cleared yet. Unknown status is shown separately because some QB records do not expose clearing cleanly."
                />
                <div className="overflow-auto">
                  <table className="w-full min-w-[850px] border-collapse text-sm">
                    <thead className="bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
                      <tr>
                        <th className="px-4 py-3 font-medium">House</th>
                        <th className="px-4 py-3 text-right font-medium">Not Cleared</th>
                        <th className="px-4 py-3 text-right font-medium">Unknown Status</th>
                        <th className="px-4 py-3 font-medium">Last Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {houses.map((house) => (
                        <tr className="border-t border-[#edf0eb]" key={house.id}>
                          <td className="px-4 py-3 font-semibold">{house.house}</td>
                          <td className="px-4 py-3 text-right font-semibold">{house.unclearedCount}</td>
                          <td className="px-4 py-3 text-right">{house.unknownClearStatusCount}</td>
                          <td className="px-4 py-3 text-[#69746f]">
                            {house.lastActivityDate ?? "No activity synced"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-[#dfe5dc] bg-white">
                <PanelHeader
                  icon={Clock3}
                  title="Stalled House Watch"
                  subtitle={`Flags houses with no synced activity for ${STALL_WARNING_DAYS}+ days, or no activity yet.`}
                />
                <div className="grid gap-3 p-4 md:grid-cols-2">
                  {stalledHouses.length ? (
                    stalledHouses.map((house) => (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4" key={house.id}>
                        <div className="flex gap-3">
                          <AlertTriangle className="mt-0.5 text-amber-700" size={18} />
                          <div>
                            <h3 className="font-semibold text-[#121d49]">{house.house}</h3>
                            <p className="mt-1 text-sm leading-5 text-amber-800">
                              {house.daysSinceLastActivity === null
                                ? "No synced check/payment activity yet."
                                : `${house.daysSinceLastActivity} days since last synced activity.`}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                      No stalled houses based on synced activity.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                <h2 className="text-sm font-semibold">Sync Status</h2>
                <div className="mt-3 space-y-3 text-sm text-[#4f5b56]">
                  <RuleRow label="Bank balances" value={lastAccountSync} />
                  <RuleRow label="Checks/payments" value={lastTransactionSync} />
                  <RuleRow label="QB connection" value={qboConnection.connected ? "Connected" : "Needs reconnect"} />
                </div>
              </section>

              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h2 className="text-sm font-semibold text-amber-900">Next Build Layer</h2>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Next we turn the budget template into real saved phase rules. Then the dashboard
                  can say if Phase 1, Phase 2, and the full house are under or over budget.
                </p>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                <h2 className="text-sm font-semibold">Internal Draw Rules</h2>
                <div className="mt-3 space-y-3 text-sm text-[#4f5b56]">
                  <RuleRow label="Average profit target" value={currency(AVERAGE_PROFIT_TARGET)} />
                  <RuleRow label="Marketing per phase" value={`${currency(MARKETING_PER_PHASE)} x ${PHASE_COUNT}`} />
                  <RuleRow label="Management per phase" value={`${currency(MANAGEMENT_PER_PHASE)} x ${PHASE_COUNT}`} />
                  <RuleRow label="Operations later" value={`${currency(OPERATIONS_AFTER_CLOSE)} after close`} />
                </div>
              </section>

              <section className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                <h2 className="text-sm font-semibold">Internal Accounts Seen</h2>
                <div className="mt-3 space-y-3 text-sm text-[#4f5b56]">
                  {internalAccounts.map((account) => (
                    <RuleRow
                      key={account.Id}
                      label={accountName(account)}
                      value={currency(bankBalance(account))}
                    />
                  ))}
                </div>
              </section>

              {incomeClearingAccounts.length > 0 ? (
                <section className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                  <h2 className="text-sm font-semibold">Income Clearing</h2>
                  <p className="mt-2 text-sm leading-6 text-[#4f5b56]">
                    Balance: {currency(sumAccountBalances(incomeClearingAccounts))}. This is
                    separate so it does not get mixed into house health.
                  </p>
                </section>
              ) : null}

              <section className="rounded-lg border border-[#dfe5dc] bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Brain className="text-[#ff332b]" size={18} />
                  <h2 className="text-sm font-semibold">Ask AI</h2>
                </div>
                <AiHealthChat openAiReady={openAiReady} />
              </section>
            </aside>
          </section>
        </section>
      </div>
    </main>
  );
}

function PanelHeader({
  icon: Icon,
  subtitle,
  title,
}: {
  icon: typeof TrendingDown;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[#edf0eb] px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-[#69746f]">{subtitle}</p>
      </div>
      <Icon className="text-[#ff332b]" size={20} />
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white p-3">
      <div className="text-[10px] font-bold uppercase text-[#69746f]">{label}</div>
      <div className="mt-1 font-semibold text-[#121d49]">{value}</div>
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#dfe5dc] bg-white p-4">
      <div className="text-xs font-medium uppercase text-[#69746f]">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#edf0eb] pb-2 last:border-b-0 last:pb-0">
      <span>{label}</span>
      <span className="text-right font-medium text-[#18211f]">{value}</span>
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
