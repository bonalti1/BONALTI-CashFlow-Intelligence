import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Building2, RefreshCw, WalletCards } from "lucide-react";

import { getConfirmedHouseName, isInternalBankAccount } from "@/lib/qbo/bank-account-map";
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";

export const dynamic = "force-dynamic";

const liveAppUrl = "https://bonalti-cashflow-intelligence.onrender.com";

type BankAccountView = {
  id: string;
  house?: string;
  name: string;
  subtype?: string;
  active?: boolean;
  balance: number;
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function toBankView(account: QboAccount): BankAccountView {
  return {
    id: account.Id,
    house: getConfirmedHouseName(account) ?? undefined,
    name: account.FullyQualifiedName ?? account.Name,
    subtype: account.AccountSubType,
    active: account.Active,
    balance: account.CurrentBalance ?? 0,
  };
}

export default async function HouseAccountsPage() {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const appUrl =
    configuredAppUrl && !configuredAppUrl.includes("YOUR-RENDER-URL")
      ? configuredAppUrl
      : liveAppUrl;
  const snapshot = await getAccountsSnapshot().catch(() => null);
  const bankAccounts = snapshot?.accounts.filter((account) => account.AccountType === "Bank") ?? [];
  const houses = bankAccounts
    .filter((account) => getConfirmedHouseName(account))
    .map(toBankView)
    .sort((a, b) => String(a.house).localeCompare(String(b.house)));
  const internal = bankAccounts
    .filter((account) => isInternalBankAccount(account))
    .map(toBankView)
    .sort((a, b) => a.name.localeCompare(b.name));
  const needsReview = bankAccounts
    .filter((account) => !getConfirmedHouseName(account) && !isInternalBankAccount(account))
    .map(toBankView);
  const houseCashTotal = houses.reduce((total, account) => total + account.balance, 0);
  const internalCashTotal = internal.reduce((total, account) => total + account.balance, 0);
  const negativeHouses = houses.filter((account) => account.balance < 0).length;

  return (
    <main className="min-h-screen bg-[#f7f8f5] px-6 py-6 text-[#18211f]">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-[#69746f]">
              QuickBooks bank accounts
            </p>
            <h1 className="mt-1 text-2xl font-semibold">House Accounts</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f6b66]">
              This page uses your confirmed bank-account list as the temporary house
              map while the Chart of Accounts cleanup happens with your accountant.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              className="inline-flex items-center gap-2 rounded-md bg-[#20745f] px-3 py-2 text-sm font-medium text-white"
              href={`${appUrl}/api/qbo/connect?next=/house-accounts`}
            >
              <RefreshCw size={16} />
              Sync QB
            </a>
            <Link
              className="rounded-md border border-[#ccd6cf] bg-white px-3 py-2 text-sm font-medium"
              href="/mapping"
            >
              Mapping
            </Link>
            <Link
              className="rounded-md border border-[#ccd6cf] bg-white px-3 py-2 text-sm font-medium"
              href="/"
            >
              Dashboard
            </Link>
          </div>
        </header>

        <section className="mb-5 grid grid-cols-4 gap-3">
          <Metric
            icon={Building2}
            label="Confirmed Houses"
            value={String(houses.length)}
            detail={`${bankAccounts.length} total bank accounts`}
          />
          <Metric
            icon={WalletCards}
            label="House Cash"
            value={currency(houseCashTotal)}
            detail="Sum of confirmed house bank balances"
          />
          <Metric
            icon={WalletCards}
            label="Internal Cash"
            value={currency(internalCashTotal)}
            detail={`${internal.length} internal bank accounts`}
          />
          <Metric
            icon={negativeHouses > 0 ? ArrowDownRight : ArrowUpRight}
            label="Needs Attention"
            value={String(negativeHouses)}
            detail="House accounts with negative balance"
            tone={negativeHouses > 0 ? "warn" : "good"}
          />
        </section>

        <section className="mb-5 rounded-lg border border-[#dfe5dc] bg-white p-4">
          <h2 className="text-sm font-semibold">Status</h2>
          <p className="mt-2 text-sm leading-6 text-[#5f6b66]">
            {snapshot
              ? `Last synced ${new Date(snapshot.syncedAt).toLocaleString()} from QuickBooks production company ${snapshot.realmId}.`
              : "No account snapshot is stored right now. Click Sync QB to reconnect and pull the latest Chart of Accounts."}
          </p>
        </section>

        <AccountTable
          accounts={houses}
          emptyText="No confirmed house accounts are available yet."
          title="Confirmed House Accounts"
        />

        <div className="mt-5 grid grid-cols-[1fr_360px] gap-4">
          <AccountTable
            accounts={internal}
            compact
            emptyText="No internal accounts found."
            title="Internal Bank Accounts"
          />
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h2 className="text-sm font-semibold text-amber-900">Accounting Cleanup Note</h2>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              The app can keep moving with this bank-account map. Before project
              health numbers are trusted, the Chart of Accounts still needs to be
              cleaned up into the locked construction sections and line items.
            </p>
            <div className="mt-4 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-amber-900">
              Unmapped bank accounts: {needsReview.length}
            </div>
          </section>
        </div>
      </div>
    </main>
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
  tone?: "neutral" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-[#18211f]";

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

function AccountTable({
  accounts,
  title,
  emptyText,
  compact = false,
}: {
  accounts: BankAccountView[];
  title: string;
  emptyText: string;
  compact?: boolean;
}) {
  return (
    <section className="rounded-lg border border-[#dfe5dc] bg-white">
      <div className="flex items-center justify-between border-b border-[#e6ebe3] px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="rounded-md border border-[#dfe5dc] bg-[#fbfcfa] px-2.5 py-1 text-xs font-medium text-[#4f5b56]">
          {accounts.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
            <tr>
              {!compact ? <th className="px-4 py-3 font-medium">House</th> : null}
              <th className="px-4 py-3 font-medium">QuickBooks Bank Account</th>
              <th className="px-4 py-3 font-medium">Subtype</th>
              <th className="px-4 py-3 font-medium">Balance</th>
              <th className="px-4 py-3 font-medium">QB ID</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-[#69746f]" colSpan={compact ? 4 : 5}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr className="border-t border-[#edf0eb]" key={account.id}>
                  {!compact ? (
                    <td className="px-4 py-3 font-semibold">{account.house}</td>
                  ) : null}
                  <td className="px-4 py-3 text-[#4f5b56]">{account.name}</td>
                  <td className="px-4 py-3 text-[#5f6b66]">{account.subtype ?? "-"}</td>
                  <td
                    className={`px-4 py-3 font-semibold ${
                      account.balance < 0 ? "text-red-700" : "text-[#18211f]"
                    }`}
                  >
                    {currency(account.balance)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#69746f]">
                    {account.id}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
