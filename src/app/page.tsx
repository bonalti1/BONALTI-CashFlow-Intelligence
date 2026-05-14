import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  Building2,
  CircleDollarSign,
  HomeIcon,
  Landmark,
  LayoutDashboard,
  ListTree,
  Megaphone,
  RefreshCcw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import { saveHouseDetailsAction } from "@/app/actions/house-details";
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

function healthForBalance(balance: number) {
  if (balance < 0) {
    return {
      label: "Watch",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      note: "Negative bank balance. This house needs funding review before checks go out.",
    };
  }

  if (balance < 1000) {
    return {
      label: "Low Cash",
      className: "border-blue-200 bg-blue-50 text-blue-800",
      note: "Cash is low. Budget health still needs check and phase sync.",
    };
  }

  return {
    label: "Cash OK",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    note: "Current bank cash is positive. Full health comes after transaction sync.",
  };
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
  const incomeClearingAccounts = internalAccounts.filter((account) =>
    accountNameIncludes(account, "income clearing"),
  );
  const totalHouseCash = houses.reduce((total, house) => total + house.balance, 0);
  const lastSynced = snapshot ? new Date(snapshot.syncedAt).toLocaleString() : "Not synced";
  const transactionsSyncedLabel = transactionsStatus.synced && transactionsStatus.syncedAt
    ? new Date(transactionsStatus.syncedAt).toLocaleString()
    : "Not synced yet";
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
            <NavItem href="/house-accounts" icon={HomeIcon} label="House Accounts" />
            <NavItem href="/chart-of-accounts" icon={ListTree} label="Chart of Accounts" />
            <NavItem href="/mapping" icon={ListTree} label="Mapping" />
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
                className="rounded-md border border-[#ccd6cf] px-3 py-1.5 text-[#33504a]"
                href="/house-accounts"
              >
                Houses
              </Link>
            </div>
          </header>

          <div className="grid flex-1 grid-cols-[minmax(0,1fr)_390px] gap-0">
            <div className="min-w-0 px-6 py-5">
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

              {snapshot ? (
                <section className="mb-5 rounded-lg border border-[#dfe5dc] bg-white">
                  <div className="border-b border-[#e6ebe3] px-4 py-3">
                    <h2 className="text-sm font-semibold">House Setup Inputs</h2>
                    <p className="mt-1 text-xs text-[#69746f]">
                      These numbers are saved only in this dashboard database, not in QuickBooks.
                    </p>
                  </div>
                  <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-auto p-4">
                    {houses.map((house) => (
                      <form
                        action={saveHouseDetailsAction}
                        className="rounded-lg border border-[#edf0eb] bg-[#fbfcfa] p-3"
                        key={house.id}
                      >
                        <input name="qboBankAccountId" type="hidden" value={house.id} />
                        <input name="houseName" type="hidden" value={house.house} />
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">{house.house}</div>
                            <div className="mt-1 text-xs text-[#69746f]">
                              QB balance {currency(house.balance)}
                            </div>
                          </div>
                          <span
                            className={`rounded-md border px-2 py-1 text-xs ${
                              house.setupComplete
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-amber-200 bg-amber-50 text-amber-800"
                            }`}
                          >
                            {house.setupComplete ? "Ready" : "Missing setup"}
                          </span>
                        </div>
                        <div className="grid grid-cols-[1fr_112px_96px_auto] gap-2">
                          <label className="text-xs text-[#69746f]">
                            Sold Price
                            <input
                              className="mt-1 h-9 w-full rounded-md border border-[#ccd6cf] bg-white px-2 text-sm text-[#18211f]"
                              defaultValue={house.soldPrice ?? ""}
                              inputMode="decimal"
                              name="soldPrice"
                              placeholder="450000"
                            />
                          </label>
                          <label className="text-xs text-[#69746f]">
                            Sq Ft
                            <input
                              className="mt-1 h-9 w-full rounded-md border border-[#ccd6cf] bg-white px-2 text-sm text-[#18211f]"
                              defaultValue={house.squareFootage ?? ""}
                              inputMode="numeric"
                              name="squareFootage"
                              placeholder="1850"
                            />
                          </label>
                          <label className="text-xs text-[#69746f]">
                            City
                            <input
                              className="mt-1 h-9 w-full rounded-md border border-[#ccd6cf] bg-white px-2 text-sm text-[#18211f]"
                              defaultValue={house.city ?? ""}
                              name="city"
                              placeholder="Laredo"
                            />
                          </label>
                          <button
                            className="mt-5 h-9 rounded-md bg-[#20745f] px-3 text-sm font-medium text-white"
                            type="submit"
                          >
                            Save
                          </button>
                        </div>
                        <div className="mt-3 text-xs text-[#69746f]">
                          {house.soldPrice && house.squareFootage
                            ? `Sale price per sqft: ${currency(house.soldPrice / house.squareFootage)}`
                            : "Enter sold price and square footage to calculate price per sqft."}
                        </div>
                      </form>
                    ))}
                  </div>
                </section>
              ) : null}

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
                        Last synced {lastSynced}
                      </p>
                    </div>
                    <Link
                      className="rounded-md border border-[#ccd6cf] px-3 py-1.5 text-xs font-medium text-[#33504a]"
                      href="/house-accounts"
                    >
                      Inspect accounts
                    </Link>
                  </div>

                  <div className="max-h-[520px] overflow-auto">
                    <table className="w-full min-w-[980px] border-collapse text-sm">
                      <thead className="sticky top-0 bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
                        <tr>
                          <th className="px-4 py-3 font-medium">House</th>
                          <th className="px-4 py-3 font-medium">Cash Status</th>
                          <th className="px-4 py-3 font-medium">QB Bank Balance</th>
                          <th className="px-4 py-3 font-medium">Checks Seen</th>
                          <th className="px-4 py-3 font-medium">Phase View</th>
                          <th className="px-4 py-3 font-medium">QB Bank Account</th>
                          <th className="px-4 py-3 font-medium">What The Agent Can Say</th>
                        </tr>
                      </thead>
                      <tbody>
                        {houses.map((house) => {
                          const health = healthForBalance(house.balance);

                          return (
                            <tr className="border-t border-[#edf0eb]" key={house.id}>
                              <td className="px-4 py-4">
                                <div className="font-medium">{house.house}</div>
                                <div className="text-xs text-[#69746f]">QB ID {house.id}</div>
                              </td>
                              <td className="px-4 py-4">
                                <span
                                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${health.className}`}
                                >
                                  {health.label}
                                </span>
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
                              <td className="px-4 py-4">
                                <PhaseStrip />
                                <div className="mt-2 text-xs text-[#69746f]">
                                  Waiting on checks by phase
                                </div>
                              </td>
                              <td className="max-w-[260px] px-4 py-4 text-[#4f5b56]">
                                {house.bank}
                              </td>
                              <td className="max-w-[300px] px-4 py-4 text-[#4f5b56]">
                                {health.note}
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

            <aside className="border-l border-[#dfe5dc] bg-white p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-[#e7f1ec] text-[#20745f]">
                  <Bot size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Agent Health Note</h2>
                  <p className="text-xs text-[#69746f]">Connected, read-only, no guesses</p>
                </div>
              </div>

              <p className="rounded-lg border border-[#dfe5dc] bg-[#fbfcfa] p-4 text-sm leading-6 text-[#384641]">
                The app can see {houses.length} confirmed house bank accounts and{" "}
                {internalAccounts.length} internal bank accounts from QuickBooks. Today I can
                trust balances and account mapping. I will not score phase progress, margin, or
                budget health until checks and budgets are synced.
              </p>

              <div className="mt-5 rounded-lg border border-[#dfe5dc] p-4">
                <h3 className="text-sm font-semibold">Sync Status</h3>
                <div className="mt-3 space-y-3 text-sm text-[#4f5b56]">
                  <RuleRow label="Bank balances" value={lastSynced} />
                  <RuleRow label="Checks/payments" value={transactionsSyncedLabel} />
                  <RuleRow label="QB connection" value={qboConnection.connected ? "Connected" : "Needs reconnect"} />
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-[#dfe5dc] p-4">
                <h3 className="text-sm font-semibold">Internal Draw Rules</h3>
                <div className="mt-3 space-y-3 text-sm text-[#4f5b56]">
                  <RuleRow
                    label="Average profit target"
                    value={shortCurrency(AVERAGE_PROFIT_TARGET)}
                  />
                  <RuleRow
                    label="Marketing per phase"
                    value={`${shortCurrency(marketingPerPhase)} x ${PHASE_COUNT}`}
                  />
                  <RuleRow
                    label="Management per phase"
                    value={`${shortCurrency(managementPerPhase)} x ${PHASE_COUNT}`}
                  />
                  <RuleRow label="Operations later" value={`${shortCurrency(operationsAfterClose)} after close`} />
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-[#dfe5dc] p-4">
                <h3 className="text-sm font-semibold">Internal Accounts Seen</h3>
                <div className="mt-3 space-y-3 text-sm text-[#4f5b56]">
                  {internalAccounts.map((account) => (
                    <RuleRow
                      key={account.Id}
                      label={accountName(account)}
                      value={currency(bankBalance(account))}
                    />
                  ))}
                  {internalAccounts.length === 0 ? (
                    <p className="text-sm text-[#69746f]">No internal bank accounts found.</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold text-amber-900">Next Build Layer</h3>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Next we sync checks by house bank account. Then the six phase boxes can become
                  real progress, and the agent can compare each house against budget.
                </p>
              </div>

              {incomeClearingAccounts.length > 0 ? (
                <div className="mt-5 rounded-lg border border-[#dfe5dc] p-4">
                  <h3 className="text-sm font-semibold">Income Clearing</h3>
                  <p className="mt-2 text-sm leading-6 text-[#4f5b56]">
                    Balance: {currency(sumAccountBalances(incomeClearingAccounts))}. I am showing
                    it separately so it does not get mixed into house health.
                  </p>
                </div>
              ) : null}
            </aside>
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

function PhaseStrip() {
  return (
    <div className="flex gap-1">
      {Array.from({ length: PHASE_COUNT }, (_, index) => (
        <div
          className="flex h-7 w-8 items-center justify-center rounded border border-[#dfe5dc] bg-[#f7f8f5] text-[11px] font-medium text-[#69746f]"
          key={index}
        >
          {index + 1}
        </div>
      ))}
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
