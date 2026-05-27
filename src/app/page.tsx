import Link from "next/link";
import Image from "next/image";
import {
  AlertTriangle,
  Brain,
  Building2,
  CheckCircle2,
  ClipboardList,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Megaphone,
  RefreshCcw,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";

import { getPublicAppUrl } from "@/lib/app-url";
import { getHouseDetailsMap } from "@/lib/houses/house-details-store";
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName, isInternalBankAccount } from "@/lib/qbo/bank-account-map";
import { getQboConnectionStatus } from "@/lib/qbo/token-store";
import { getTransactionsByBankAccount } from "@/lib/qbo/transactions-store";

export const dynamic = "force-dynamic";

const PHASE_COUNT = 6;
const AVERAGE_PROFIT_TARGET = 60_000;
const MARKETING_PERCENT = 0.15;
const MANAGEMENT_PERCENT = 0.2;
const OPERATIONS_PERCENT = 0.05;
const PHASE_ONE_BUDGET_PERCENT = 0.10778;
const PHASE_BUDGET_RULES = [
  { key: "pre", label: "Pre", budgetPercent: null },
  { key: "p1", label: "P1", budgetPercent: PHASE_ONE_BUDGET_PERCENT },
  { key: "p2", label: "P2", budgetPercent: null },
  { key: "p3", label: "P3", budgetPercent: null },
  { key: "p4", label: "P4", budgetPercent: null },
  { key: "p5", label: "P5", budgetPercent: null },
  { key: "p6", label: "P6", budgetPercent: null },
] as const;

type HouseRow = {
  id: string;
  house: string;
  bank: string;
  balance: number;
  subtype: string | undefined;
  active: boolean | undefined;
  transactionCount: number;
  clearedCount: number;
  knownClearedStatusCount: number;
  totalChecksSeen: number;
  soldPrice: number | null;
  squareFootage: number | null;
  city: string | null;
  setupComplete: boolean;
};

type Bucket = {
  label: string;
  slug: string;
  description: string;
  balance: number;
  drawRule: string;
  status: string;
  icon: typeof Megaphone;
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function shortCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number) {
  return `${(value * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

function bankBalance(account: QboAccount) {
  return account.CurrentBalance ?? 0;
}

function accountName(account: QboAccount) {
  return account.FullyQualifiedName ?? account.Name;
}

function accountNameIncludes(account: QboAccount, matcher: string) {
  return accountName(account).toLowerCase().includes(matcher);
}

function sumAccountBalances(accounts: QboAccount[]) {
  return accounts.reduce((total, account) => total + bankBalance(account), 0);
}

export default async function Home() {
  const appUrl = getPublicAppUrl();
  const [
    snapshot,
    qboConnection,
    transactionsByBankAccount,
    houseDetailsByBankAccount,
  ] = await Promise.all([
    getAccountsSnapshot().catch(() => null),
    getQboConnectionStatus(),
    getTransactionsByBankAccount(),
    getHouseDetailsMap(),
  ]);
  const bankAccounts = snapshot?.accounts.filter((account) => account.AccountType === "Bank") ?? [];
  const houses: HouseRow[] = bankAccounts
    .map((account) => {
      const house = getConfirmedHouseName(account);

      if (!house) {
        return null;
      }

      const transactions = transactionsByBankAccount.get(account.Id) ?? [];
      const details = houseDetailsByBankAccount.get(account.Id);

      return {
        id: account.Id,
        house,
        bank: accountName(account),
        balance: bankBalance(account),
        subtype: account.AccountSubType,
        active: account.Active,
        transactionCount: transactions.length,
        clearedCount: transactions.filter((transaction) => transaction.clearedStatus === "cleared")
          .length,
        knownClearedStatusCount: transactions.filter(
          (transaction) => transaction.clearedStatus !== "unknown",
        ).length,
        totalChecksSeen: transactions.reduce(
          (total, transaction) => total + Math.abs(transaction.totalAmount),
          0,
        ),
        soldPrice: details?.soldPrice ?? null,
        squareFootage: details?.squareFootage ?? null,
        city: details?.city ?? null,
        setupComplete: Boolean(details?.soldPrice && details?.squareFootage && details?.city),
      };
    })
    .filter((account): account is HouseRow => Boolean(account))
    .sort((a, b) => a.house.localeCompare(b.house));

  const internalAccounts = bankAccounts.filter((account) => isInternalBankAccount(account));
  const marketingAccounts = internalAccounts.filter((account) =>
    accountNameIncludes(account, "marketing"),
  );
  const managementAccounts = internalAccounts.filter((account) =>
    accountNameIncludes(account, "payroll"),
  );
  const operationsAccounts = internalAccounts.filter((account) =>
    accountNameIncludes(account, "operating"),
  );
  const lastSynced = snapshot ? new Date(snapshot.syncedAt).toLocaleString() : "Not synced";
  const completedHouseSetups = houses.filter((house) => house.setupComplete).length;
  const setupNeededCount = houses.length - completedHouseSetups;
  const totalSoldPrice = houses.reduce((total, house) => total + (house.soldPrice ?? 0), 0);
  const totalSpentSeen = houses.reduce((total, house) => total + house.totalChecksSeen, 0);
  const averageSpentPercent = totalSoldPrice > 0 ? totalSpentSeen / totalSoldPrice : 0;
  const phaseOneRiskCount = houses.filter((house) => {
    if (!house.soldPrice) {
      return false;
    }

    return house.totalChecksSeen > house.soldPrice * PHASE_ONE_BUDGET_PERCENT;
  }).length;
  const marketingPerPhase = (AVERAGE_PROFIT_TARGET * MARKETING_PERCENT) / PHASE_COUNT;
  const managementPerPhase = (AVERAGE_PROFIT_TARGET * MANAGEMENT_PERCENT) / PHASE_COUNT;
  const operationsAfterClose = AVERAGE_PROFIT_TARGET * OPERATIONS_PERCENT;
  const buckets: Bucket[] = [
    {
      label: "Marketing",
      slug: "marketing",
      description: "Internal marketing bucket",
      balance: sumAccountBalances(marketingAccounts),
      drawRule: `${shortCurrency(marketingPerPhase)} should be added per phase draw.`,
      status: "Active phase bucket",
      icon: Megaphone,
    },
    {
      label: "Management Payroll",
      slug: "management-payroll",
      description: "Internal management and payroll bucket",
      balance: sumAccountBalances(managementAccounts),
      drawRule: `${shortCurrency(managementPerPhase)} should be added per phase draw.`,
      status: "Active phase bucket",
      icon: WalletCards,
    },
    {
      label: "Operations",
      slug: "operations",
      description: "Future operations bucket",
      balance: sumAccountBalances(operationsAccounts),
      drawRule: `${shortCurrency(operationsAfterClose)} planned after a house closes.`,
      status: "Later after close",
      icon: Landmark,
    },
  ];

  return (
    <main className="min-h-screen bg-[#eef1f4] text-[#121a36]">
      <div className="grid min-h-screen grid-cols-[264px_1fr]">
        <aside className="border-r border-[#0d1637] bg-[#121d49] px-5 py-5 text-white">
          <div className="mb-8">
            <div className="mb-4 rounded-lg border border-white/15 bg-white p-3 shadow-sm">
              <Image
                alt="South Texas Builders"
                className="h-auto w-full"
                height={1080}
                src="/south-texas-builders-logo.png"
                width={1080}
              />
            </div>
            <div>
              <div className="brand-heading text-base font-semibold text-white">
                South Texas Builders
              </div>
              <div className="brand-kicker mt-1 text-[10px] font-medium uppercase text-[#ff6b65]">
                Project Health Agent
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            <NavItem active icon={LayoutDashboard} label="Portfolio" />
            <NavItem href="/setup-inputs" icon={ClipboardList} label="House Setup" />
            <NavItem href="/payees" icon={HandCoins} label="Payees" />
            <NavItem href="/agent-health" icon={Brain} label="Intelligent Center" />
            <NavItem href="/setup" icon={ShieldCheck} label="Setup" />
          </nav>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex min-h-16 items-center justify-between border-b border-[#d9dee9] bg-white/90 px-7 py-4 backdrop-blur">
            <div>
              <p className="brand-kicker text-[10px] font-bold uppercase text-[#ff332b]">
                AI Command Center
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-[#121d49]">
                Executive House Health Dashboard
              </h1>
              <p className="text-xs text-[#69746f]">
                Live QuickBooks data, house setup, spending, and clear next-step signals.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span
                className={`rounded-md border px-3 py-1.5 ${
                  qboConnection.connected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                QB {qboConnection.connected ? "connected" : "needs sync"}
              </span>
              <a
                className="inline-flex items-center gap-2 rounded-md bg-[#121d49] px-4 py-2 font-bold text-white shadow-sm transition hover:bg-[#ff332b]"
                href={`${appUrl}/api/qbo/accounts/sync?next=/`}
              >
                <RefreshCcw size={16} />
                Sync QB
              </a>
            </div>
          </header>

          <div className="flex-1 px-7 py-6">
            <div className="min-w-0">
              <section className="mb-5 rounded-lg border border-[#d9dee9] bg-[#121d49] p-5 text-white shadow-sm">
                <div className="grid gap-5 lg:grid-cols-[1.25fr_2fr]">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-white">
                      <Brain size={14} />
                      AI-ready finance view
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold text-white">
                      See which houses are healthy, which need setup, and where money is moving.
                    </h2>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">
                      This page is built to stay simple. The accountant keeps QuickBooks clean.
                      The dashboard turns that data into owner-level decisions.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <ExecutiveSignal
                      label="Active Houses"
                      value={String(houses.length)}
                      detail="Confirmed projects"
                    />
                    <ExecutiveSignal
                      label="Setup Complete"
                      value={`${completedHouseSetups}/${houses.length}`}
                      detail={
                        setupNeededCount > 0
                          ? `${setupNeededCount} need inputs`
                          : "All inputs ready"
                      }
                      tone={setupNeededCount > 0 ? "warn" : "good"}
                    />
                    <ExecutiveSignal
                      label="Spend Read"
                      value={percent(averageSpentPercent)}
                      detail="Spent vs sold price"
                    />
                    <ExecutiveSignal
                      label="P1 Risk"
                      value={String(phaseOneRiskCount)}
                      detail="Need review"
                      tone={phaseOneRiskCount > 0 ? "warn" : "good"}
                    />
                  </div>
                </div>
              </section>

              <section className="mb-5 grid grid-cols-2 gap-3">
                <Metric
                  icon={Building2}
                  label="Portfolio Sold Price"
                  value={totalSoldPrice > 0 ? shortCurrency(totalSoldPrice) : "Missing"}
                  detail="Only houses with sold price entered"
                />
                <Metric
                  icon={ClipboardList}
                  label="QuickBooks Spend Read"
                  value={shortCurrency(totalSpentSeen)}
                  detail="Checks/payments currently synced from QuickBooks"
                  tone={setupNeededCount > 0 ? "warn" : "neutral"}
                />
              </section>

              <section className="mb-5 grid grid-cols-3 gap-3">
                {buckets.map((bucket) => (
                  <BucketCard bucket={bucket} key={bucket.label} />
                ))}
              </section>

              {!snapshot ? (
                <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-amber-900">
                    QuickBooks Snapshot Needed
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-amber-800">
                    The dashboard is ready, but Render does not currently have a saved account
                    snapshot. Click Sync QB to read the latest bank accounts from QuickBooks.
                  </p>
                </section>
              ) : (
                <section className="overflow-hidden rounded-lg border border-[#d9dee9] bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#e6ebe3] bg-[#fbfcfa] px-5 py-4">
                    <div>
                      <h2 className="text-base font-semibold text-[#121d49]">Active House Health</h2>
                      <p className="mt-1 text-xs text-[#69746f]">
                        Main view stays simple. House details and manual inputs live in House Setup.
                        Last synced {lastSynced}
                      </p>
                    </div>
                    <Link
                      className="rounded-md border border-[#d9dee9] bg-white px-3 py-2 text-xs font-bold text-[#121d49] transition hover:border-[#ff332b] hover:text-[#ff332b]"
                      href="/setup-inputs"
                    >
                      Edit House Inputs
                    </Link>
                  </div>

                  <div className="max-h-[520px] overflow-auto">
                    <table className="w-full min-w-[920px] border-collapse text-sm">
                      <thead className="sticky top-0 bg-white text-left text-xs uppercase text-[#69746f] shadow-[0_1px_0_#edf0eb]">
                        <tr>
                          <th className="px-4 py-3 font-medium">House</th>
                          <th className="px-4 py-3 font-medium">House Setup</th>
                          <th className="px-4 py-3 font-medium">Total Spent</th>
                          <th className="px-4 py-3 font-medium">Phase Health</th>
                          <th className="px-4 py-3 font-medium">Remaining Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {houses.map((house) => {
                          const phaseOneBudget = house.soldPrice
                            ? house.soldPrice * PHASE_ONE_BUDGET_PERCENT
                            : null;
                          const phaseOneOverBudget =
                            phaseOneBudget !== null && house.totalChecksSeen > phaseOneBudget;

                          return (
                            <tr className="border-t border-[#edf0eb] transition hover:bg-[#fbfcfa]" key={house.id}>
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="grid size-9 place-items-center rounded-lg bg-[#121d49] text-xs font-bold text-white">
                                    {house.house.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-[#121d49]">{house.house}</div>
                                    <div className="text-xs text-[#69746f]">{house.city ?? "City missing"}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="min-w-[390px] px-4 py-4">
                                <div className="flex flex-wrap gap-1.5">
                                  <SetupPill
                                    label="Sold"
                                    value={house.soldPrice ? currency(house.soldPrice) : "Missing"}
                                  />
                                  <SetupPill
                                    label="Sqft"
                                    value={house.squareFootage ? String(house.squareFootage) : "Missing"}
                                  />
                                  <SetupPill label="City" value={house.city ?? "Missing"} />
                                  <SetupPill
                                    label="Sold / Sqft"
                                    value={
                                      house.soldPrice && house.squareFootage
                                        ? currency(house.soldPrice / house.squareFootage)
                                        : "Missing"
                                    }
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="font-semibold text-[#121d49]">{currency(house.totalChecksSeen)}</div>
                                <div className="mt-1 text-xs text-[#69746f]">
                                  Read from QuickBooks checks/payments
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <PhaseBudgetStrip
                                  phaseOneBudget={phaseOneBudget}
                                  phaseOneOverBudget={phaseOneOverBudget}
                                  spent={house.totalChecksSeen}
                                />
                              </td>
                              <td className="px-4 py-4">
                                <RemainingBalance
                                  soldPrice={house.soldPrice}
                                  spent={house.totalChecksSeen}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
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
      ? "bg-white font-bold text-[#121d49] shadow-sm"
      : "text-white/75 hover:bg-white/10 hover:text-white"
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

function ExecutiveSignal({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const toneClass =
    tone === "good" ? "text-emerald-200" : tone === "warn" ? "text-amber-200" : "text-white";

  return (
    <div className="rounded-lg border border-white/15 bg-white/10 p-4 backdrop-blur">
      <div className="text-[10px] font-bold uppercase text-white/60">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs leading-5 text-white/65">{detail}</div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "warn";
}) {
  const toneClass = tone === "warn" ? "text-amber-700" : "text-[#18211f]";

  return (
    <div className="rounded-lg border border-[#d9dee9] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase text-[#69746f]">{label}</span>
        <div className="grid size-9 place-items-center rounded-lg bg-[#eef3fb]">
          <Icon className={toneClass} size={18} />
        </div>
      </div>
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs text-[#69746f]">{detail}</div>
    </div>
  );
}

function BucketCard({ bucket }: { bucket: Bucket }) {
  const Icon = bucket.icon;
  const balanceTone = bucket.balance < 0 ? "text-red-700" : "text-[#18211f]";

  return (
    <Link
      className="block rounded-lg border border-[#d9dee9] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#ff332b] hover:shadow-md"
      href={`/buckets/${bucket.slug}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase text-[#69746f]">{bucket.label}</div>
          <div className={`mt-2 text-2xl font-semibold ${balanceTone}`}>
            {currency(bucket.balance)}
          </div>
        </div>
        <div className="flex size-9 items-center justify-center rounded-lg bg-[#fff0ef] text-[#ff332b]">
          <Icon size={18} />
        </div>
      </div>
      <div className="mt-4 flex justify-between gap-3 text-xs text-[#69746f]">
        <span>{bucket.status}</span>
      </div>
      <p className="mt-3 min-h-10 text-xs leading-5 text-[#4f5b56]">{bucket.description}</p>
      <div className="mt-3 rounded-md border border-[#d9dee9] bg-[#eef3fb] px-3 py-2 text-xs font-medium text-[#121d49]">
        {bucket.drawRule}
      </div>
      <div className="mt-3 text-xs font-bold text-[#ff332b]">View monthly charges</div>
    </Link>
  );
}

function PhaseBudgetStrip({
  phaseOneBudget,
  phaseOneOverBudget,
  spent,
}: {
  phaseOneBudget: number | null;
  phaseOneOverBudget: boolean;
  spent: number;
}) {
  return (
    <div className="min-w-[250px]">
      <div className="flex flex-wrap gap-1.5">
        {PHASE_BUDGET_RULES.map((phase) => {
          const isPhaseOne = phase.key === "p1";
          const needsSoldPrice = isPhaseOne && !phaseOneBudget;
          const overBudget = isPhaseOne && phaseOneOverBudget;
          const ready = isPhaseOne && phaseOneBudget && !phaseOneOverBudget;
          const Icon = overBudget ? XCircle : ready ? CheckCircle2 : AlertTriangle;
          const className = overBudget
            ? "border-red-200 bg-red-50 text-red-800"
            : ready
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : needsSoldPrice
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-[#dfe5dc] bg-[#fbfcfa] text-[#69746f]";

          return (
            <div
              className={`grid min-h-12 min-w-12 place-items-center rounded-md border px-2 py-1 text-center text-[11px] ${className}`}
              key={phase.key}
              title={
                phase.budgetPercent
                  ? `${phase.label} budget is ${percent(phase.budgetPercent)} of sold price`
                  : `${phase.label} budget percentage still needs to be set`
              }
            >
              <div className="flex items-center gap-1 font-semibold">
                <Icon size={12} />
                {phase.label}
              </div>
              <div className="mt-0.5 whitespace-nowrap">
                {phase.budgetPercent ? percent(phase.budgetPercent) : "Set %"}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-xs leading-5 text-[#69746f]">
        {phaseOneBudget
          ? `P1: ${currency(spent)} spent / ${currency(phaseOneBudget)} budget`
          : "Add sold price to calculate P1 budget"}
      </div>
    </div>
  );
}

function RemainingBalance({ soldPrice, spent }: { soldPrice: number | null; spent: number }) {
  if (!soldPrice) {
    return (
      <div className="min-w-36 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Add sold price to calculate remaining balance.
      </div>
    );
  }

  const remaining = soldPrice - spent;
  const spentPercent = spent / soldPrice;
  const overRisk = spentPercent > 0.8;

  return (
    <div
      className={`min-w-36 rounded-md border px-3 py-2 ${
        overRisk
          ? "border-red-200 bg-red-50 text-red-900"
          : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      <div className="text-sm font-semibold">{currency(remaining)}</div>
      <div className="mt-1 text-xs">
        {percent(spentPercent)} spent so far
      </div>
    </div>
  );
}

function SetupPill({ label, value }: { label: string; value: string }) {
  const missing = value === "Missing";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
        missing
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-[#dfe5dc] bg-[#fbfcfa] text-[#4f5b56]"
      }`}
    >
      <span className="text-[#69746f]">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
