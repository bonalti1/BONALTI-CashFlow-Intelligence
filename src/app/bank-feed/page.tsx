import Link from "next/link";
import Image from "next/image";
import { ArrowDownLeft, ArrowUpRight, Landmark, ShieldCheck, WalletCards } from "lucide-react";

import { BankSyncButton } from "@/app/bank-feed/bank-sync-button";
import { ConnectedAccounts } from "@/app/bank-feed/connected-accounts";
import { PlaidLinkButton } from "@/app/bank-feed/plaid-link-button";
import {
  getPlaidBankAccounts,
  getPlaidConnectionStatus,
  getRecentPlaidTransactions,
  type PlaidBankAccount,
  type PlaidBankTransaction,
} from "@/lib/plaid/bank-store";
import { getHouseDetailsMap, type HouseDetail } from "@/lib/houses/house-details-store";
import { summarizeAccounts, type AccountRow } from "@/lib/plaid/account-view";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function currency(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Pending";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

// Server components render once per request, so this is the request time; the client
// component starts its clock from it to avoid a hydration mismatch.
function requestTime() {
  return Date.now();
}

function toAccountRow(account: PlaidBankAccount, details: Map<string, HouseDetail>): AccountRow {
  const project = account.qboBankAccountId ? details.get(account.qboBankAccountId) : undefined;
  const projectName = project?.displayName ?? project?.houseName ?? account.houseName;
  const projectNumber = project?.projectNumber ?? null;

  return {
    id: account.id,
    itemId: account.itemId,
    institutionKey: account.institutionId ?? account.institutionName ?? account.itemId,
    institutionName: account.institutionName ?? "Bank login",
    name: account.name,
    officialName: account.officialName,
    mask: account.mask,
    type: account.type,
    subtype: account.subtype,
    available: account.availableBalance,
    current: account.currentBalance,
    balanceAsOf: account.balanceAsOf,
    balanceSource: account.balanceSource,
    reportedByBank: account.reportedByBank,
    connectionStatus: account.connectionStatus,
    connectionMessage: account.connectionMessage,
    projectLabel: projectName
      ? projectNumber
        ? `Project ${projectNumber} · ${projectName}`
        : projectName
      : null,
    projectNumber,
  };
}

function shortDate(value: string | null | undefined) {
  if (!value) {
    return "Not synced";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function BankFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string | string[] }>;
}) {
  await requireUser();
  const { connected } = await searchParams;

  const [status, accounts, transactions, houseDetails] = await Promise.all([
    getPlaidConnectionStatus(),
    getPlaidBankAccounts(),
    getRecentPlaidTransactions(60),
    getHouseDetailsMap().catch(() => new Map<string, HouseDetail>()),
  ]);
  const renderedAt = requestTime();
  const accountRows = accounts.map((account) => toAccountRow(account, houseDetails));
  const accountSummary = summarizeAccounts(accountRows, renderedAt);
  const moneyOut = transactions
    .filter((transaction) => transaction.direction === "money_out")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const moneyIn = transactions
    .filter((transaction) => transaction.direction === "money_in")
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);

  return (
    <main className="min-h-screen bg-[#f5f3ea] px-5 py-6 text-[#14254b]">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-[18px] border border-[#ded9cb] bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-24 rounded-xl border border-[#ded9cb] bg-white p-2">
                <Image
                  alt="South Texas Builders"
                  className="h-auto w-full"
                  height={1080}
                  src="/south-texas-builders-logo.png"
                  width={1080}
                />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#df3c2f]">
                  Cash truth
                </p>
                <h1 className="mt-1 text-4xl font-black tracking-tight text-[#14254b]">
                  Bank Feed
                </h1>
                <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-[#858b9f]">
                  Read-only bank data for the AI CFO. This does not move money.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <PlaidLinkButton />
              <BankSyncButton disabled={!status.connected} />
              <Link
                className="rounded-md border border-[#d8ded3] bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-[#14254b]"
                href="/draws-budget"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {connected === "1" || connected === "pending" ? (
          <p
            className="mb-5 rounded-[14px] border border-[#b9dec9] bg-[#eaf7f0] px-5 py-3 text-sm font-bold text-[#1f6f4b]"
            role="status"
          >
            {connected === "1"
              ? "Bank connected and its transactions are loaded."
              : "Bank connected. The bank is still sending its transaction history, which can take a few minutes. Press Sync Bank in a few minutes to load it."}
          </p>
        ) : null}

        <section className="mb-5 grid gap-4 lg:grid-cols-4">
          <Metric
            icon={ShieldCheck}
            label="Plaid Status"
            value={status.connected ? "Connected" : status.configured ? "Ready" : "Needs Keys"}
            detail={`${status.environment} environment`}
            tone={status.connected ? "good" : status.configured ? "neutral" : "warn"}
          />
          <Metric
            icon={WalletCards}
            label="Bank Accounts"
            value={String(status.accounts)}
            detail={`${status.items} bank login${status.items === 1 ? "" : "s"}`}
          />
          <Metric
            icon={Landmark}
            label="Cash available now"
            value={currency(accountSummary.cashAvailable)}
            detail={`Bank balance ${currency(accountSummary.cashCurrent)}`}
            tone="good"
          />
          <Metric
            icon={ArrowUpRight}
            label="Latest Sync"
            value={status.transactions.toLocaleString()}
            detail={`transactions · ${shortDate(status.lastSyncedAt)}`}
          />
        </section>

        <section className="mb-5 grid gap-4 lg:grid-cols-2">
          <Metric
            icon={ArrowDownLeft}
            label="Recent Money In"
            value={currency(moneyIn)}
            detail="Recent synced deposits"
            tone="good"
          />
          <Metric
            icon={ArrowUpRight}
            label="Recent Money Out"
            value={currency(moneyOut)}
            detail="Recent synced withdrawals/checks"
            tone={moneyOut > moneyIn && moneyIn > 0 ? "warn" : "neutral"}
          />
        </section>

        <ConnectedAccounts accounts={accountRows} renderedAt={renderedAt} />
        <TransactionsPanel transactions={transactions} />
      </div>
    </main>
  );
}

function Metric({
  detail,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  detail: string;
  icon: typeof ShieldCheck;
  label: string;
  tone?: "good" | "neutral" | "warn";
  value: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-[#178d61]"
      : tone === "warn"
        ? "text-[#d94736]"
        : "text-[#14254b]";

  return (
    <div className="rounded-[16px] border border-[#ded9cb] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-[#9ca2b5]">
          {label}
        </span>
        <Icon className={toneClass} size={20} />
      </div>
      <div className={`text-3xl font-black tracking-tight ${toneClass}`}>{value}</div>
      <div className="mt-1 text-sm font-bold text-[#858b9f]">{detail}</div>
    </div>
  );
}

function TransactionsPanel({ transactions }: { transactions: PlaidBankTransaction[] }) {
  return (
    <section className="rounded-[18px] border border-[#ded9cb] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#e7e1d3] px-5 py-4">
        <h2 className="text-lg font-black uppercase tracking-[0.12em] text-[#14254b]">
          Recent Cash Movement
        </h2>
        <span className="rounded-md border border-[#d8ded3] px-3 py-1 text-xs font-black text-[#858b9f]">
          {transactions.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.14em] text-[#9ca2b5]">
            <tr>
              <th className="px-5 py-4 font-black">Date</th>
              <th className="px-5 py-4 font-black">Description</th>
              <th className="px-5 py-4 font-black">Type</th>
              <th className="px-5 py-4 text-right font-black">Amount</th>
              <th className="px-5 py-4 font-black">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td className="px-5 py-8 font-bold text-[#858b9f]" colSpan={5}>
                  No bank transactions synced yet.
                </td>
              </tr>
            ) : (
              transactions.map((transaction) => (
                <tr className="border-t border-[#eee8da]" key={transaction.id}>
                  <td className="px-5 py-4 font-bold text-[#858b9f]">{transaction.date}</td>
                  <td className="px-5 py-4">
                    <div className="font-black text-[#14254b]">
                      {transaction.merchantName ?? transaction.name}
                    </div>
                    <div className="mt-1 font-bold text-[#858b9f]">{transaction.name}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-md border px-3 py-1 text-xs font-black uppercase tracking-[0.1em] ${
                        transaction.direction === "money_in"
                          ? "border-[#a8dfc5] bg-[#effaf4] text-[#178d61]"
                          : "border-[#e7e1d3] bg-[#fbfaf6] text-[#14254b]"
                      }`}
                    >
                      {transaction.direction === "money_in" ? "Money In" : "Money Out"}
                    </span>
                  </td>
                  <td
                    className={`px-5 py-4 text-right text-lg font-black ${
                      transaction.direction === "money_in" ? "text-[#178d61]" : "text-[#14254b]"
                    }`}
                  >
                    {currency(Math.abs(transaction.amount))}
                  </td>
                  <td className="px-5 py-4 font-bold text-[#858b9f]">
                    {transaction.pending ? "Pending" : "Posted"}
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
