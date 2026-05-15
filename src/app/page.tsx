import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Edit3,
  Landmark,
  LayoutDashboard,
  Megaphone,
  NotebookText,
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
import {
  getTransactionsByBankAccount,
  getTransactionsSnapshotStatus,
} from "@/lib/qbo/transactions-store";

export const dynamic = "force-dynamic";

const PHASE_COUNT = 6;
const AVERAGE_PROFIT_TARGET = 60_000;
const MARKETING_PERCENT = 0.15;
const MANAGEMENT_PERCENT = 0.2;
const OPERATIONS_PERCENT = 0.05;
const MONTHLY_PHASE_ASSUMPTION = 10;
const PHASE_ONE_BUDGET_PERCENT = 0.10778;

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
  description: string;
  balance: number;
  monthlyTarget: number;
  perPhase: number | null;
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
    transactionsStatus,
    transactionsByBankAccount,
    houseDetailsByBankAccount,
  ] = await Promise.all([
    getAccountsSnapshot().catch(() => null),
    getQboConnectionStatus(),
    getTransactionsSnapshotStatus(),
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
  const totalHouseCash = houses.reduce((total, house) => total + house.balance, 0);
  const lastSynced = snapshot ? new Date(snapshot.syncedAt).toLocaleString() : "Not synced";
  const totalChecksSeen = houses.reduce((total, house) => total + house.totalChecksSeen, 0);
  const completedHouseSetups = houses.filter((house) => house.setupComplete).length;
  const marketingPerPhase = (AVERAGE_PROFIT_TARGET * MARKETING_PERCENT) / PHASE_COUNT;
  const managementPerPhase = (AVERAGE_PROFIT_TARGET * MANAGEMENT_PERCENT) / PHASE_COUNT;
  const operationsAfterClose = AVERAGE_PROFIT_TARGET * OPERATIONS_PERCENT;
  const bucketMonthlyMarketing = marketingPerPhase * MONTHLY_PHASE_ASSUMPTION;
  const bucketMonthlyManagement = managementPerPhase * MONTHLY_PHASE_ASSUMPTION;
  const buckets: Bucket[] = [
    {
      label: "Marketing",
      description: "15% of target profit, paid as phases complete",
      balance: sumAccountBalances(marketingAccounts),
      monthlyTarget: bucketMonthlyMarketing,
      perPhase: marketingPerPhase,
      status: "Active phase bucket",
      icon: Megaphone,
    },
    {
      label: "Management Payroll",
      description: "20% of target profit, paid to the payroll bucket",
      balance: sumAccountBalances(managementAccounts),
      monthlyTarget: bucketMonthlyManagement,
      perPhase: managementPerPhase,
      status: "Active phase bucket",
      icon: WalletCards,
    },
    {
      label: "Operations",
      description: "Planned 5% bucket after a house closes",
      balance: sumAccountBalances(operationsAccounts),
      monthlyTarget: operationsAfterClose,
      perPhase: null,
      status: "Later after close",
      icon: Landmark,
    },
  ];

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-[#18211f]">
      <div className="grid min-h-screen grid-cols-[248px_1fr]">
        <aside className="border-r border-[#dfe5dc] bg-white px-5 py-5">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-[#20745f] text-sm font-bold text-white">
              STB
            </div>
            <div>
              <div className="text-sm font-semibold">South Texas Builders</div>
              <div className="text-xs text-[#69746f]">Project Health Agent</div>
            </div>
          </div>

          <nav className="space-y-1">
            <NavItem active icon={LayoutDashboard} label="Portfolio" />
            <NavItem href="/setup-inputs" icon={ClipboardList} label="Edit Price & Square Foot" />
            <NavItem href="/agent-health" icon={NotebookText} label="Agent Health Notes" />
            <NavItem href="/setup" icon={ShieldCheck} label="Setup" />
          </nav>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex min-h-16 items-center justify-between border-b border-[#dfe5dc] bg-white px-6 py-3">
            <div>
              <h1 className="text-lg font-semibold">Portfolio Cash Health</h1>
              <p className="text-xs text-[#69746f]">
                Real QuickBooks balances today. Phase health comes after check sync.
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
                className="inline-flex items-center gap-2 rounded-md bg-[#20745f] px-3 py-1.5 text-white"
                href={`${appUrl}/api/qbo/accounts/sync?next=/`}
              >
                <RefreshCcw size={16} />
                Sync QB
              </a>
              <Link
                className="inline-flex items-center gap-2 rounded-md border border-[#ccd6cf] px-3 py-1.5 text-[#33504a]"
                href="/setup-inputs"
              >
                <Edit3 size={16} />
                Edit Inputs
              </Link>
            </div>
          </header>

          <div className="flex-1 px-6 py-5">
            <div className="min-w-0">
              <section className="mb-5 grid grid-cols-4 gap-3">
                <Metric
                  icon={Building2}
                  label="Active Houses"
                  value={String(houses.length)}
                  detail={`${bankAccounts.length} bank accounts from QB`}
                />
                <Metric
                  icon={CircleDollarSign}
                  label="QB Bank Balance"
                  value={currency(totalHouseCash)}
                  detail="QuickBooks balance for house accounts"
                />
                <Metric
                  icon={WalletCards}
                  label="Checks Seen"
                  value={currency(totalChecksSeen)}
                  detail={
                    transactionsStatus.synced
                      ? `${transactionsStatus.total} check/payment records`
                      : "Run Sync QB to pull checks"
                  }
                />
                <Metric
                  icon={AlertTriangle}
                  label="House Setups"
                  value={`${completedHouseSetups}/${houses.length}`}
                  detail="Sale price, sqft, and city entered"
                  tone={completedHouseSetups < houses.length ? "warn" : "neutral"}
                />
              </section>

              <section className="mb-5 grid grid-cols-3 gap-3">
                {buckets.map((bucket) => (
                  <BucketCard bucket={bucket} key={bucket.label} />
                ))}
              </section>

              {!snapshot ? (
                <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
                  <h2 className="text-sm font-semibold text-amber-900">
                    QuickBooks Snapshot Needed
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-amber-800">
                    The dashboard is ready, but Render does not currently have a saved account
                    snapshot. Click Sync QB to read the latest bank accounts from QuickBooks.
                  </p>
                </section>
              ) : (
                <section className="rounded-lg border border-[#dfe5dc] bg-white">
                  <div className="flex items-center justify-between border-b border-[#e6ebe3] px-4 py-3">
                    <div>
                      <h2 className="text-sm font-semibold">Active House Bank Accounts</h2>
                      <p className="mt-1 text-xs text-[#69746f]">
                        Showing only the key setup numbers here. Edit details in the sidebar tab.
                        Last synced {lastSynced}
                      </p>
                    </div>
                  </div>

                  <div className="max-h-[520px] overflow-auto">
                    <table className="w-full min-w-[980px] border-collapse text-sm">
                      <thead className="sticky top-0 bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
                        <tr>
                          <th className="px-4 py-3 font-medium">House</th>
                          <th className="px-4 py-3 font-medium">QB Bank Balance</th>
                          <th className="px-4 py-3 font-medium">Checks Seen</th>
                          <th className="px-4 py-3 font-medium">Setup</th>
                          <th className="px-4 py-3 font-medium">Phase Budget</th>
                          <th className="px-4 py-3 font-medium">QB Bank Account</th>
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
                            <tr className="border-t border-[#edf0eb]" key={house.id}>
                              <td className="px-4 py-4">
                                <div className="font-medium">{house.house}</div>
                                <div className="text-xs text-[#69746f]">QB ID {house.id}</div>
                              </td>
                              <td
                                className={`px-4 py-4 font-semibold ${
                                  house.balance < 0 ? "text-red-700" : "text-[#18211f]"
                                }`}
                              >
                                {currency(house.balance)}
                              </td>
                              <td className="px-4 py-4">
                                <div className="font-semibold">{currency(house.totalChecksSeen)}</div>
                                <div className="mt-1 text-xs text-[#69746f]">
                                  {house.transactionCount} records
                                  {house.knownClearedStatusCount > 0
                                    ? `, ${house.clearedCount} cleared`
                                    : ", cleared field pending"}
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
                                </div>
                                <Link
                                  className="mt-2 inline-flex text-xs font-medium text-[#20745f]"
                                  href="/setup-inputs"
                                >
                                  Edit price & square foot
                                </Link>
                              </td>
                              <td className="px-4 py-4">
                                <PhaseBudgetStrip
                                  phaseOneBudget={phaseOneBudget}
                                  phaseOneOverBudget={phaseOneOverBudget}
                                  spent={house.totalChecksSeen}
                                />
                              </td>
                              <td className="max-w-[260px] px-4 py-4 text-[#4f5b56]">
                                {house.bank}
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
      ? "bg-[#e7f1ec] font-medium text-[#174f42]"
      : "text-[#5f6b66] hover:bg-[#f1f4ef]"
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
    <div className="rounded-lg border border-[#dfe5dc] bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase text-[#69746f]">{label}</span>
        <Icon className={toneClass} size={18} />
      </div>
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs text-[#69746f]">{detail}</div>
    </div>
  );
}

function BucketCard({ bucket }: { bucket: Bucket }) {
  const Icon = bucket.icon;
  const balanceRatio = bucket.monthlyTarget > 0 ? bucket.balance / bucket.monthlyTarget : 0;
  const width = `${Math.max(4, Math.min(Math.abs(balanceRatio) * 100, 100))}%`;
  const barColor =
    bucket.balance < 0 ? "bg-red-600" : balanceRatio >= 1 ? "bg-emerald-700" : "bg-[#20745f]";

  return (
    <div className="rounded-lg border border-[#dfe5dc] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase text-[#69746f]">{bucket.label}</div>
          <div className={bucket.balance < 0 ? "mt-2 text-2xl font-semibold text-red-700" : "mt-2 text-2xl font-semibold"}>
            {currency(bucket.balance)}
          </div>
        </div>
        <div className="flex size-9 items-center justify-center rounded-lg bg-[#e7f1ec] text-[#20745f]">
          <Icon size={18} />
        </div>
      </div>
      <div className="mt-4 h-2 rounded-full bg-[#e7ece8]">
        <div className={`h-2 rounded-full ${barColor}`} style={{ width }} />
      </div>
      <div className="mt-3 flex justify-between gap-3 text-xs text-[#69746f]">
        <span>{bucket.status}</span>
        <span>Target {shortCurrency(bucket.monthlyTarget)}</span>
      </div>
      <p className="mt-3 min-h-10 text-xs leading-5 text-[#4f5b56]">{bucket.description}</p>
      <div className="mt-3 rounded-md border border-[#edf0eb] bg-[#fbfcfa] px-3 py-2 text-xs text-[#384641]">
        {bucket.perPhase ? `${shortCurrency(bucket.perPhase)} per completed phase` : "Not drawn per phase yet"}
      </div>
    </div>
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
    <div>
      <div
        className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium ${
          !phaseOneBudget
            ? "border-[#dfe5dc] bg-[#f7f8f5] text-[#69746f]"
            : phaseOneOverBudget
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}
      >
        {!phaseOneBudget ? (
          <AlertTriangle size={14} />
        ) : phaseOneOverBudget ? (
          <XCircle size={14} />
        ) : (
          <CheckCircle2 size={14} />
        )}
        Phase One
      </div>
      <div className="mt-2 text-xs leading-5 text-[#69746f]">
        {phaseOneBudget
          ? `${currency(spent)} spent / ${currency(phaseOneBudget)} budget`
          : "Add sold price to calculate budget"}
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
