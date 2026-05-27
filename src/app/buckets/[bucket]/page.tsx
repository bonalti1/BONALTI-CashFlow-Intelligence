import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Landmark, Megaphone, RefreshCcw, WalletCards } from "lucide-react";

import { getPublicAppUrl } from "@/lib/app-url";
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getTransactionsByBankAccount, type SavedQboTransaction } from "@/lib/qbo/transactions-store";

export const dynamic = "force-dynamic";

const bucketConfigs = {
  marketing: {
    label: "Marketing",
    description: "Charges and checks connected to the Marketing bank account.",
    matchers: ["marketing"],
    icon: Megaphone,
  },
  "management-payroll": {
    label: "Management Payroll",
    description: "Charges and checks connected to the Payroll / management bucket.",
    matchers: ["payroll", "management"],
    icon: WalletCards,
  },
  operations: {
    label: "Operations",
    description: "Charges and checks connected to the operating bucket.",
    matchers: ["operating"],
    icon: Landmark,
  },
} as const;

type BucketSlug = keyof typeof bucketConfigs;

type MonthGroup = {
  key: string;
  label: string;
  totalOut: number;
  totalIn: number;
  payees: PayeeSpendSummary[];
  transactions: SavedQboTransaction[];
};

type PayeeSpendSummary = {
  name: string;
  totalSpent: number;
  transactionCount: number;
  lastPaymentDate: string | null;
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

function matchesBucket(account: QboAccount, matchers: readonly string[]) {
  const name = accountName(account).toLowerCase();

  return matchers.some((matcher) => name.includes(matcher));
}

function monthKey(txnDate: string | null) {
  return txnDate?.slice(0, 7) ?? "unknown";
}

function monthLabel(key: string) {
  if (key === "unknown") {
    return "No date";
  }

  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function payeeName(transaction: SavedQboTransaction) {
  return transaction.payeeName?.trim() || "No payee listed";
}

function buildPayeeSpendSummaries(transactions: SavedQboTransaction[]) {
  const summaries = new Map<string, PayeeSpendSummary>();

  for (const transaction of transactions) {
    if (transaction.totalAmount < 0) {
      continue;
    }

    const amount = Math.abs(transaction.totalAmount);

    if (amount === 0) {
      continue;
    }

    const name = payeeName(transaction);
    const existing = summaries.get(name) ?? {
      name,
      totalSpent: 0,
      transactionCount: 0,
      lastPaymentDate: null,
      transactions: [],
    };

    existing.totalSpent += amount;
    existing.transactionCount += 1;
    existing.transactions.push(transaction);

    if (
      transaction.txnDate &&
      (!existing.lastPaymentDate || transaction.txnDate > existing.lastPaymentDate)
    ) {
      existing.lastPaymentDate = transaction.txnDate;
    }

    summaries.set(name, existing);
  }

  return Array.from(summaries.values()).sort(
    (a, b) => b.totalSpent - a.totalSpent || a.name.localeCompare(b.name),
  );
}

function groupByMonth(transactions: SavedQboTransaction[]) {
  const groups = new Map<string, MonthGroup>();

  for (const transaction of transactions) {
    const key = monthKey(transaction.txnDate);
    const existing = groups.get(key) ?? {
      key,
      label: monthLabel(key),
      totalOut: 0,
      totalIn: 0,
      payees: [],
      transactions: [],
    };

    if (transaction.totalAmount < 0) {
      existing.totalIn += Math.abs(transaction.totalAmount);
    } else {
      existing.totalOut += Math.abs(transaction.totalAmount);
    }

    existing.transactions.push(transaction);
    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      payees: buildPayeeSpendSummaries(group.transactions),
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

export default async function BucketDetailPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket } = await params;
  const config = bucketConfigs[bucket as BucketSlug];
  const appUrl = getPublicAppUrl();

  if (!config) {
    return (
      <main className="min-h-screen bg-[#f7f8f5] p-6 text-[#121a36]">
        <div className="mx-auto max-w-4xl rounded-lg border border-[#dfe5dc] bg-white p-6">
          <h1 className="text-2xl font-semibold">Bucket not found</h1>
          <Link className="mt-4 inline-flex font-bold text-[#ff332b]" href="/">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const [snapshot, transactionsByBankAccount] = await Promise.all([
    getAccountsSnapshot().catch(() => null),
    getTransactionsByBankAccount(),
  ]);
  const bankAccounts = snapshot?.accounts.filter((account) => account.AccountType === "Bank") ?? [];
  const accounts = bankAccounts.filter((account) => matchesBucket(account, config.matchers));
  const transactions = accounts
    .flatMap((account) => transactionsByBankAccount.get(account.Id) ?? [])
    .sort((a, b) => String(b.txnDate ?? "").localeCompare(String(a.txnDate ?? "")));
  const groups = groupByMonth(transactions);
  const overallPayees = buildPayeeSpendSummaries(transactions);
  const totalOut = transactions.reduce(
    (total, transaction) => total + (transaction.totalAmount >= 0 ? Math.abs(transaction.totalAmount) : 0),
    0,
  );
  const totalIn = transactions.reduce(
    (total, transaction) => total + (transaction.totalAmount < 0 ? Math.abs(transaction.totalAmount) : 0),
    0,
  );
  const balance = accounts.reduce((total, account) => total + (account.CurrentBalance ?? 0), 0);
  const Icon = config.icon;

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
            <div className="brand-heading text-base font-semibold text-[#121d49]">
              South Texas Builders
            </div>
            <div className="brand-kicker mt-1 text-[10px] font-medium uppercase text-[#ff332b]">
              Bucket Detail
            </div>
          </div>

          <nav className="space-y-1">
            <Link
              className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-bold text-[#ff332b] hover:bg-[#fff0ef]"
              href="/"
            >
              <ArrowLeft size={17} />
              Back to Dashboard
            </Link>
          </nav>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex min-h-16 items-center justify-between border-b border-[#d9dee9] bg-white px-6 py-3">
            <div>
              <p className="brand-kicker text-[10px] font-bold uppercase text-[#ff332b]">
                Internal Bucket
              </p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-[#121d49]">
                <Icon size={24} />
                {config.label}
              </h1>
              <p className="text-xs text-[#69746f]">{config.description}</p>
            </div>
            <a
              className="inline-flex items-center gap-2 rounded-md bg-[#ff332b] px-3 py-1.5 text-sm font-bold text-white"
              href={`${appUrl}/api/qbo/accounts/sync?next=/buckets/${bucket}`}
            >
              <RefreshCcw size={16} />
              Sync QB
            </a>
          </header>

          <div className="flex-1 px-6 py-5">
            <section className="mb-5 grid grid-cols-4 gap-3">
              <Metric label="Current Balance" value={currency(balance)} />
              <Metric label="Money Out Seen" value={currency(totalOut)} />
              <Metric label="Money In Seen" value={currency(totalIn)} />
              <Metric label="Transactions" value={String(transactions.length)} />
            </section>

            <section className="mb-5 rounded-lg border border-[#dfe5dc] bg-white p-4">
              <h2 className="text-sm font-semibold">Connected QuickBooks Accounts</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {accounts.length ? (
                  accounts.map((account) => (
                    <span
                      className="rounded-md border border-[#dfe5dc] bg-[#fbfcfa] px-3 py-2 text-xs text-[#4f5b56]"
                      key={account.Id}
                    >
                      {accountName(account)} · {currency(account.CurrentBalance ?? 0)}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-[#69746f]">
                    No matching QuickBooks bank account was found for this bucket.
                  </span>
                )}
              </div>
            </section>

            <section className="mb-5 rounded-lg border border-[#dfe5dc] bg-white">
              <div className="flex items-center justify-between border-b border-[#edf0eb] px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">Total Spent By Payee</h2>
                  <p className="mt-1 text-xs text-[#69746f]">
                    Overall total for this bucket, grouped by vendor, employee, or payee.
                  </p>
                </div>
                <span className="rounded-md bg-[#fff0ef] px-2 py-1 text-xs font-bold text-[#ff332b]">
                  {overallPayees.length}
                </span>
              </div>

              <PayeeSpendTable
                emptyText="No payee totals found yet for this bucket."
                payees={overallPayees}
              />
            </section>

            {groups.length ? (
              <div className="space-y-4">
                {groups.map((group, index) => (
                  <MonthSection defaultOpen={index === 0} group={group} key={group.key} />
                ))}
              </div>
            ) : (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900">
                <h2 className="text-sm font-semibold">No charges found yet</h2>
                <p className="mt-2 text-sm leading-6">
                  Sync QB after QuickBooks has checks or purchases in this account. This first
                  version reads charges/checks already available from the QuickBooks transaction
                  sync.
                </p>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#dfe5dc] bg-white p-4">
      <div className="text-xs font-medium uppercase text-[#69746f]">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-[#18211f]">{value}</div>
    </div>
  );
}

function PayeeSpendTable({
  emptyText,
  payees,
}: {
  emptyText: string;
  payees: PayeeSpendSummary[];
}) {
  if (!payees.length) {
    return <div className="p-4 text-sm text-[#69746f]">{emptyText}</div>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
          <tr>
            <th className="px-4 py-3 font-medium">Payee</th>
            <th className="px-4 py-3 text-right font-medium">Total Spent</th>
            <th className="px-4 py-3 text-right font-medium">Transactions</th>
            <th className="px-4 py-3 font-medium">Last Payment</th>
            <th className="px-4 py-3 font-medium">Recent Detail</th>
          </tr>
        </thead>
        <tbody>
          {payees.map((payee) => (
            <tr className="border-t border-[#edf0eb]" key={payee.name}>
              <td className="px-4 py-3 font-semibold">{payee.name}</td>
              <td className="px-4 py-3 text-right font-semibold text-[#121d49]">
                {currency(payee.totalSpent)}
              </td>
              <td className="px-4 py-3 text-right">{payee.transactionCount}</td>
              <td className="px-4 py-3 text-[#69746f]">{payee.lastPaymentDate ?? "No date"}</td>
              <td className="max-w-[360px] px-4 py-3 text-xs leading-5 text-[#69746f]">
                {payee.transactions
                  .slice(0, 2)
                  .map((transaction) => `${transaction.txnDate ?? "No date"} · ${currency(Math.abs(transaction.totalAmount))}`)
                  .join(" / ") || "No detail"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthSection({
  defaultOpen,
  group,
}: {
  defaultOpen: boolean;
  group: MonthGroup;
}) {
  return (
    <details
      className="rounded-lg border border-[#dfe5dc] bg-white [&_summary::-webkit-details-marker]:hidden"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer items-center justify-between border-b border-[#edf0eb] px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="text-[#ff332b]" size={18} />
          <div>
            <h2 className="text-sm font-semibold">{group.label}</h2>
            <p className="mt-1 text-xs text-[#69746f]">
              Click to see what was spent this month.
            </p>
          </div>
        </div>
        <div className="text-sm text-[#69746f]">
          Out: <span className="font-semibold text-[#121d49]">{currency(group.totalOut)}</span>
          {group.totalIn > 0 ? (
            <>
              {" "}· In:{" "}
              <span className="font-semibold text-emerald-700">{currency(group.totalIn)}</span>
            </>
          ) : null}
        </div>
      </summary>

      <div className="border-b border-[#edf0eb]">
        <div className="px-4 py-3">
          <h3 className="text-xs font-bold uppercase text-[#69746f]">Spent This Month By Payee</h3>
        </div>
        <PayeeSpendTable
          emptyText="No money-out payees found for this month."
          payees={group.payees}
        />
      </div>

      <div className="overflow-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Payee</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Memo</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {group.transactions.map((transaction) => (
              <tr className="border-t border-[#edf0eb]" key={`${transaction.source}-${transaction.id}`}>
                <td className="px-4 py-3">{transaction.txnDate ?? "No date"}</td>
                <td className="px-4 py-3 font-medium">
                  {transaction.payeeName ?? "No payee"}
                  {transaction.docNumber ? (
                    <div className="mt-1 text-xs font-normal text-[#69746f]">
                      #{transaction.docNumber}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-[#69746f]">{transaction.source}</td>
                <td className="max-w-[340px] px-4 py-3 text-[#4f5b56]">
                  {transaction.memo || transaction.expenseAccountNames.join(", ") || "No memo"}
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${
                    transaction.totalAmount < 0 ? "text-emerald-700" : "text-[#121d49]"
                  }`}
                >
                  {transaction.totalAmount < 0
                    ? currency(Math.abs(transaction.totalAmount))
                    : currency(transaction.totalAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
