import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ClipboardList,
  HandCoins,
  LayoutDashboard,
  NotebookText,
  ShieldCheck,
  TrendingDown,
  WalletCards,
} from "lucide-react";

import { AiHealthChat } from "@/app/ai-health/ai-health-chat";
import { getEnvStatus } from "@/lib/env";
import { getHouseDetailsMap } from "@/lib/houses/house-details-store";
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName } from "@/lib/qbo/bank-account-map";
import {
  getTransactionsByBankAccount,
  getTransactionsSnapshotStatus,
} from "@/lib/qbo/transactions-store";

export const dynamic = "force-dynamic";

const TARGET_PROFIT_PER_HOME = 60_000;
const DRAFT_TOTAL_BUDGET_PERCENT = 0.75578;
const PHASE_ONE_BUDGET_PERCENT = 0.10778;

type HouseHealthRow = {
  id: string;
  house: string;
  bank: string;
  balance: number;
  soldPrice: number | null;
  squareFootage: number | null;
  city: string | null;
  setupComplete: boolean;
  checksSeen: number;
  transactionCount: number;
  draftBudget: number | null;
  profitIfOnBudget: number | null;
  profitAfterChecksSeen: number | null;
  provisionalPhaseOneBudget: number | null;
  provisionalOverage: number;
  riskScore: number;
  status: "Healthy" | "Needs setup" | "Review";
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function percent(value: number) {
  return `${(value * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

function accountName(account: QboAccount) {
  return account.FullyQualifiedName ?? account.Name;
}

function bankBalance(account: QboAccount) {
  return account.CurrentBalance ?? 0;
}

function statusStyles(status: HouseHealthRow["status"]) {
  if (status === "Healthy") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "Review") {
    return "border-red-200 bg-red-50 text-[#ff332b]";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function buildDecisionQueue({
  rows,
  openAiReady,
  transactionsSynced,
}: {
  rows: HouseHealthRow[];
  openAiReady: boolean;
  transactionsSynced: boolean;
}) {
  const missingSetup = rows.filter((row) => !row.setupComplete);
  const overBudget = rows.filter((row) => row.provisionalOverage > 0);
  const negativeCash = rows.filter((row) => row.balance < 0);
  const decisions: Array<{ title: string; detail: string; tone: "red" | "amber" | "green" }> = [];

  if (missingSetup.length) {
    decisions.push({
      title: "Finish house inputs",
      detail: `${missingSetup.length} houses still need sold price, square footage, or city before profit can be calculated cleanly.`,
      tone: "amber",
    });
  }

  if (overBudget.length) {
    decisions.push({
      title: "Review provisional overages",
      detail: `${overBudget.length} houses show checks above the Phase 1 draft budget. This will become more exact after the Chart of Accounts cleanup.`,
      tone: "red",
    });
  }

  if (negativeCash.length) {
    decisions.push({
      title: "Watch negative bank balances",
      detail: `${negativeCash.length} house bank accounts are below zero in QuickBooks.`,
      tone: "red",
    });
  }

  if (!transactionsSynced) {
    decisions.push({
      title: "Sync QuickBooks transactions",
      detail: "The dashboard needs a fresh transaction sync before the health note can inspect recent checks.",
      tone: "amber",
    });
  }

  if (!openAiReady) {
    decisions.push({
      title: "Add OpenAI key",
      detail: "After the key is added, this tab can turn the numbers into a plain-English daily health note and chat answers.",
      tone: "amber",
    });
  }

  if (!decisions.length) {
    decisions.push({
      title: "No setup blockers",
      detail: "QuickBooks, database, house inputs, and AI key look ready for the next health-analysis layer.",
      tone: "green",
    });
  }

  return decisions;
}

export default async function AiHealthPage() {
  const [snapshot, detailsByBankAccount, transactionsByBankAccount, transactionsStatus, env] =
    await Promise.all([
      getAccountsSnapshot().catch(() => null),
      getHouseDetailsMap(),
      getTransactionsByBankAccount(),
      getTransactionsSnapshotStatus(),
      getEnvStatus(),
    ]);

  const openAiReady = Boolean(env.find((item) => item.key === "OPENAI_API_KEY")?.configured);
  const bankAccounts = snapshot?.accounts.filter((account) => account.AccountType === "Bank") ?? [];
  const rows: HouseHealthRow[] = bankAccounts
    .map((account) => {
      const house = getConfirmedHouseName(account);

      if (!house) {
        return null;
      }

      const details = detailsByBankAccount.get(account.Id);
      const transactions = transactionsByBankAccount.get(account.Id) ?? [];
      const checksSeen = transactions.reduce(
        (total, transaction) => total + Math.abs(transaction.totalAmount),
        0,
      );
      const soldPrice = details?.soldPrice ?? null;
      const squareFootage = details?.squareFootage ?? null;
      const city = details?.city ?? null;
      const setupComplete = Boolean(soldPrice && squareFootage && city);
      const draftBudget = soldPrice ? soldPrice * DRAFT_TOTAL_BUDGET_PERCENT : null;
      const profitIfOnBudget = soldPrice && draftBudget ? soldPrice - draftBudget : null;
      const profitAfterChecksSeen = soldPrice ? soldPrice - checksSeen : null;
      const provisionalPhaseOneBudget = soldPrice ? soldPrice * PHASE_ONE_BUDGET_PERCENT : null;
      const provisionalOverage =
        provisionalPhaseOneBudget && checksSeen > provisionalPhaseOneBudget
          ? checksSeen - provisionalPhaseOneBudget
          : 0;
      const balance = bankBalance(account);
      const riskScore =
        (setupComplete ? 0 : 40) +
        (balance < 0 ? 35 : 0) +
        (provisionalOverage > 0 ? 30 : 0) +
        (transactions.length === 0 ? 10 : 0);
      const status = !setupComplete ? "Needs setup" : riskScore >= 30 ? "Review" : "Healthy";

      return {
        id: account.Id,
        house,
        bank: accountName(account),
        balance,
        soldPrice,
        squareFootage,
        city,
        setupComplete,
        checksSeen,
        transactionCount: transactions.length,
        draftBudget,
        profitIfOnBudget,
        profitAfterChecksSeen,
        provisionalPhaseOneBudget,
        provisionalOverage,
        riskScore,
        status,
      };
    })
    .filter((row): row is HouseHealthRow => Boolean(row))
    .sort((a, b) => b.riskScore - a.riskScore || a.house.localeCompare(b.house));

  const setupCompleteCount = rows.filter((row) => row.setupComplete).length;
  const totalOnBudgetProfit = rows.reduce(
    (total, row) => total + (row.profitIfOnBudget ?? 0),
    0,
  );
  const totalTargetProfit = setupCompleteCount * TARGET_PROFIT_PER_HOME;
  const totalProfitAtRisk = rows.reduce((total, row) => total + row.provisionalOverage, 0);
  const decisions = buildDecisionQueue({
    rows,
    openAiReady,
    transactionsSynced: Boolean(transactionsStatus.synced),
  });
  const brief = transactionsStatus.synced
    ? `QuickBooks is connected and the dashboard is reading ${rows.length} house bank accounts. ${setupCompleteCount} houses have sold price, square footage, and city entered. The profit math is active now; OpenAI will add plain-English explanations after the key is added.`
    : "QuickBooks accounts are available, but transaction sync has not been confirmed yet. The AI health note will be stronger after checks are synced.";

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-[#121a36]">
      <div className="grid min-h-screen grid-cols-[248px_1fr]">
        <aside className="border-r border-[#d9dee9] bg-white px-5 py-5">
          <div className="mb-8">
            <div className="mb-4 rounded-lg border border-[#d9dee9] bg-white p-3">
              <Image
                src="/south-texas-builders-logo.png"
                alt="South Texas Builders"
                width={178}
                height={178}
                className="mx-auto h-auto w-full"
                priority
              />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff332b]">
              Project Health
            </p>
          </div>
          <nav className="space-y-2">
            <NavItem href="/" icon={LayoutDashboard} label="Portfolio" />
            <NavItem href="/setup-inputs" icon={ClipboardList} label="House Setup" />
            <NavItem href="/ai-health" icon={Brain} label="AI Health Center" active />
            <NavItem href="/payees" icon={HandCoins} label="Payees" />
            <NavItem href="/agent-health" icon={NotebookText} label="Agent health notes" />
          </nav>
        </aside>

        <section className="px-8 py-8">
          <header className="mb-8 flex items-start justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff332b]">
                Executive AI tab
              </p>
              <h1 className="mt-2 text-3xl font-black text-[#121a36]">AI Health Center</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5f6b66]">
                This is the decision page. It shows what profit should look like if each house stays
                on budget, what may be at risk, and what the AI will explain once the OpenAI key is
                added.
              </p>
            </div>
            <div className="rounded-lg border border-[#d9dee9] bg-white px-4 py-3 text-right text-xs text-[#5f6b66]">
              <p className="font-bold text-[#121a36]">AI status</p>
              <p className={openAiReady ? "text-emerald-700" : "text-amber-700"}>
                {openAiReady ? "OpenAI key is connected" : "Waiting on OpenAI key"}
              </p>
            </div>
          </header>

          <section className="mb-6 grid gap-4 md:grid-cols-4">
            <MetricCard
              label="Ready Houses"
              value={`${setupCompleteCount}/${rows.length}`}
              detail="Have sold price, sqft, and city"
              icon={CheckCircle2}
            />
            <MetricCard
              label="Profit If On Budget"
              value={currency(totalOnBudgetProfit)}
              detail={`Draft calculator total: ${percent(DRAFT_TOTAL_BUDGET_PERCENT)}`}
              icon={WalletCards}
            />
            <MetricCard
              label="Target Profit"
              value={currency(totalTargetProfit)}
              detail={`${currency(TARGET_PROFIT_PER_HOME)} goal per ready house`}
              icon={ShieldCheck}
            />
            <MetricCard
              label="Profit At Risk"
              value={currency(totalProfitAtRisk)}
              detail="Provisional until phase mapping is finished"
              icon={TrendingDown}
              warning={totalProfitAtRisk > 0}
            />
          </section>

          <section className="mb-6 rounded-lg bg-[#121a36] p-5 text-white">
            <div className="flex items-start gap-3">
              <Brain className="mt-1 h-5 w-5 text-[#ff332b]" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ffb8b4]">
                  Today&apos;s Brief
                </p>
                <p className="mt-2 max-w-5xl text-sm leading-6 text-white/90">{brief}</p>
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
            <div className="space-y-6">
              <Panel
                title="Profit If On Budget"
                subtitle="This uses the sold price and the current draft phase-budget calculator. It will get sharper as you add final percentages."
              >
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#d9dee9] text-left text-xs uppercase tracking-[0.12em] text-[#6c746f]">
                        <th className="py-3 pr-4">House</th>
                        <th className="py-3 pr-4">Sold Price</th>
                        <th className="py-3 pr-4">Budget</th>
                        <th className="py-3 pr-4">Profit</th>
                        <th className="py-3 pr-4">Checks Seen</th>
                        <th className="py-3 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-b border-[#edf0f3] last:border-0">
                          <td className="py-3 pr-4">
                            <p className="font-bold text-[#121a36]">{row.house}</p>
                            <p className="text-xs text-[#6c746f]">{row.city ?? "City needed"}</p>
                          </td>
                          <td className="py-3 pr-4">
                            {row.soldPrice ? currency(row.soldPrice) : "Needed"}
                          </td>
                          <td className="py-3 pr-4">
                            {row.draftBudget ? currency(row.draftBudget) : "Needed"}
                          </td>
                          <td className="py-3 pr-4 font-bold">
                            {row.profitIfOnBudget ? currency(row.profitIfOnBudget) : "Needed"}
                          </td>
                          <td className="py-3 pr-4">
                            <p>{currency(row.checksSeen)}</p>
                            <p className="text-xs text-[#6c746f]">{row.transactionCount} checks</p>
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles(row.status)}`}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel
                title="House Risk Ranking"
                subtitle="This ranks houses by missing setup, negative bank balance, and early budget warnings."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {rows.map((row) => (
                    <div key={row.id} className="rounded-lg border border-[#d9dee9] bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-[#121a36]">{row.house}</p>
                          <p className="text-xs text-[#6c746f]">{row.bank}</p>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles(row.status)}`}
                        >
                          {row.status}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs uppercase tracking-[0.12em] text-[#6c746f]">
                            Bank Balance
                          </p>
                          <p className="font-bold">{money(row.balance)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.12em] text-[#6c746f]">
                            P1 Check
                          </p>
                          <p className="font-bold">
                            {row.provisionalOverage > 0
                              ? `${currency(row.provisionalOverage)} over`
                              : "No overage"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel
                title="Decision Queue"
                subtitle="The work list this page wants you to look at first."
              >
                <div className="space-y-3">
                  {decisions.map((decision) => (
                    <div
                      key={decision.title}
                      className={`rounded-lg border p-4 ${
                        decision.tone === "red"
                          ? "border-red-200 bg-red-50"
                          : decision.tone === "green"
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-amber-200 bg-amber-50"
                      }`}
                    >
                      <div className="flex gap-3">
                        {decision.tone === "green" ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" />
                        ) : (
                          <AlertTriangle
                            className={`mt-0.5 h-4 w-4 ${
                              decision.tone === "red" ? "text-[#ff332b]" : "text-amber-700"
                            }`}
                          />
                        )}
                        <div>
                          <p className="font-bold text-[#121a36]">{decision.title}</p>
                          <p className="mt-1 text-sm leading-5 text-[#5f6b66]">{decision.detail}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel
                title="Ask AI"
                subtitle="This reads the same QuickBooks and house setup data shown on the dashboard."
              >
                <AiHealthChat openAiReady={openAiReady} />
              </Panel>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof WalletCards;
  warning?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#d9dee9] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6c746f]">{label}</p>
        <Icon className={`h-4 w-4 ${warning ? "text-[#ff332b]" : "text-[#121a36]"}`} />
      </div>
      <p className="text-2xl font-black text-[#121a36]">{value}</p>
      <p className="mt-1 text-xs text-[#6c746f]">{detail}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#d9dee9] bg-white">
      <div className="border-b border-[#d9dee9] px-5 py-4">
        <h2 className="text-lg font-black text-[#121a36]">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-[#5f6b66]">{subtitle}</p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active = false,
}: {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
        active
          ? "bg-[#fff0ef] font-bold text-[#ff332b]"
          : "text-[#5f6b66] hover:bg-[#fff0ef] hover:text-[#ff332b]"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
