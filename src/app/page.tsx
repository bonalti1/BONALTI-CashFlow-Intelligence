import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  Building2,
  CircleDollarSign,
  HomeIcon,
  LayoutDashboard,
  ListTree,
  RefreshCcw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import { getPublicAppUrl } from "@/lib/app-url";
import { getConfirmedHouseName, isInternalBankAccount } from "@/lib/qbo/bank-account-map";
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getQboConnectionStatus } from "@/lib/qbo/token-store";

export const dynamic = "force-dynamic";

type HouseRow = {
  id: string;
  house: string;
  bank: string;
  balance: number;
  subtype: string | undefined;
  active: boolean | undefined;
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function bankBalance(account: QboAccount) {
  return account.CurrentBalance ?? 0;
}

function healthForBalance(balance: number) {
  if (balance < 0) {
    return {
      label: "Watch",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      note: "Negative bank balance. Review funding or recent checks.",
    };
  }

  if (balance < 1000) {
    return {
      label: "Low Cash",
      className: "border-blue-200 bg-blue-50 text-blue-700",
      note: "Low available cash. Health math needs checks and budget next.",
    };
  }

  return {
    label: "Cash OK",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    note: "Bank balance is positive. Full health requires transaction sync.",
  };
}

export default async function Home() {
  const appUrl = getPublicAppUrl();
  const [snapshot, qboConnection] = await Promise.all([
    getAccountsSnapshot().catch(() => null),
    getQboConnectionStatus(),
  ]);
  const bankAccounts = snapshot?.accounts.filter((account) => account.AccountType === "Bank") ?? [];
  const houses: HouseRow[] = bankAccounts
    .map((account) => {
      const house = getConfirmedHouseName(account);

      if (!house) {
        return null;
      }

      return {
        id: account.Id,
        house,
        bank: account.FullyQualifiedName ?? account.Name,
        balance: bankBalance(account),
        subtype: account.AccountSubType,
        active: account.Active,
      };
    })
    .filter((account): account is HouseRow => Boolean(account))
    .sort((a, b) => a.house.localeCompare(b.house));
  const internalAccounts = bankAccounts.filter((account) => isInternalBankAccount(account));
  const totalHouseCash = houses.reduce((total, house) => total + house.balance, 0);
  const totalInternalCash = internalAccounts.reduce(
    (total, account) => total + bankBalance(account),
    0,
  );
  const negativeHouses = houses.filter((house) => house.balance < 0);
  const lowCashHouses = houses.filter((house) => house.balance >= 0 && house.balance < 1000);
  const lastSynced = snapshot ? new Date(snapshot.syncedAt).toLocaleString() : "Not synced";

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
              <h1 className="text-lg font-semibold">Portfolio Health</h1>
              <p className="text-xs text-[#69746f]">
                Real QuickBooks bank accounts. Transaction health comes next.
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

          <div className="grid flex-1 grid-cols-[minmax(0,1fr)_360px] gap-0">
            <div className="min-w-0 px-6 py-5">
              <section className="mb-5 grid grid-cols-4 gap-3">
                <Metric
                  icon={Building2}
                  label="Confirmed Houses"
                  value={String(houses.length)}
                  detail={`${bankAccounts.length} bank accounts from QB`}
                />
                <Metric
                  icon={WalletCards}
                  label="House Cash"
                  value={currency(totalHouseCash)}
                  detail="Current bank balances only"
                />
                <Metric
                  icon={CircleDollarSign}
                  label="Internal Cash"
                  value={currency(totalInternalCash)}
                  detail={`${internalAccounts.length} internal accounts`}
                />
                <Metric
                  icon={AlertTriangle}
                  label="Needs Review"
                  value={String(negativeHouses.length + lowCashHouses.length)}
                  detail={`${negativeHouses.length} negative, ${lowCashHouses.length} low cash`}
                  tone={negativeHouses.length > 0 ? "warn" : "neutral"}
                />
              </section>

              {!snapshot ? (
                <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
                  <h2 className="text-sm font-semibold text-amber-900">
                    QuickBooks Snapshot Needed
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-amber-800">
                    The dashboard is ready, but Render does not currently have a
                    saved account snapshot. Click Sync QB to read the latest bank
                    accounts from QuickBooks.
                  </p>
                </section>
              ) : (
                <section className="rounded-lg border border-[#dfe5dc] bg-white">
                  <div className="flex items-center justify-between border-b border-[#e6ebe3] px-4 py-3">
                    <div>
                      <h2 className="text-sm font-semibold">Active Houses</h2>
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

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] border-collapse text-sm">
                      <thead className="bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
                        <tr>
                          <th className="px-4 py-3 font-medium">House</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Bank Balance</th>
                          <th className="px-4 py-3 font-medium">QB Bank Account</th>
                          <th className="px-4 py-3 font-medium">Progress</th>
                          <th className="px-4 py-3 font-medium">Agent Note</th>
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
                              <td className="max-w-[260px] px-4 py-4 text-[#4f5b56]">
                                {house.bank}
                              </td>
                              <td className="px-4 py-4 text-[#69746f]">Pending checks</td>
                              <td className="max-w-[280px] px-4 py-4 text-[#4f5b56]">
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
                  <p className="text-xs text-[#69746f]">Real data, limited scope</p>
                </div>
              </div>

              <p className="rounded-lg border border-[#dfe5dc] bg-[#fbfcfa] p-4 text-sm leading-6 text-[#384641]">
                The app can see {houses.length} confirmed house bank accounts from
                QuickBooks. Right now, this dashboard is reading bank balances and
                account mapping only. I cannot honestly score budget, progress,
                margin, stalls, or variance until we sync checks and add budgets.
              </p>

              <div className="mt-5 rounded-lg border border-[#dfe5dc] p-4">
                <h3 className="text-sm font-semibold">What Is Real Here</h3>
                <div className="mt-3 space-y-3 text-sm text-[#4f5b56]">
                  <div className="flex justify-between gap-4">
                    <span>QuickBooks company</span>
                    <span className="font-mono text-xs">{snapshot?.realmId ?? "Missing"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Account snapshot</span>
                    <span>{snapshot ? "Synced" : "Missing"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Autonomy</span>
                    <span>Read-only</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold text-amber-900">
                  Next Data Layer
                </h3>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Next we should add durable database storage, then sync checks by
                  house bank account. That is when the dashboard can stop showing
                  placeholders for progress and health.
                </p>
              </div>
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
