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
    reviewTitle: "Marketing Payments",
    payeeSubtitle: "Every vendor, platform, or payee paid from Marketing, sorted by total paid.",
    matchers: ["marketing"],
    icon: Megaphone,
  },
  "management-payroll": {
    label: "Management",
    description: "Charges and checks connected to the Payroll / management bucket.",
    reviewTitle: "Management Payments",
    payeeSubtitle: "Every person, vendor, or payee paid from Management, sorted by total paid.",
    matchers: ["payroll", "management"],
    icon: WalletCards,
  },
  operations: {
    label: "Operations",
    description: "Charges and checks connected to the operating bucket.",
    reviewTitle: "Operations Charges",
    payeeSubtitle: "Every vendor, service, software, item, or payee charged to Operations, sorted by total paid.",
    matchers: ["operating"],
    icon: Landmark,
  },
} as const;

type BucketSlug = keyof typeof bucketConfigs;

type MonthGroup = {
  key: string;
  label: string;
  totalOut: number;
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
      payees: [],
      transactions: [],
    };

    if (transaction.totalAmount >= 0) {
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
  const Icon = config.icon;

  return (
    <main className="min-h-screen bg-[#f2f1ea] text-[#17213c] [background-image:linear-gradient(rgba(18,29,73,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(18,29,73,0.045)_1px,transparent_1px)] [background-size:32px_32px]">
      <header className="bg-[#121d49] px-6 py-5 text-white shadow-sm">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[9px] bg-white p-2 shadow-sm">
              <Image
                alt="South Texas Builders"
                className="h-full w-full object-contain"
                height={1080}
                src="/south-texas-builders-logo.png"
                width={1080}
              />
            </div>
            <div>
              <p className="brand-kicker text-[11px] font-bold uppercase tracking-[0.22em] text-[#ff332b]">
                Internal Spending
              </p>
              <h1 className="brand-heading mt-1 flex items-center gap-3 text-[28px] font-bold uppercase tracking-[0.05em]">
                <Icon size={26} />
                {config.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-white/20 bg-white/10 px-4 text-sm font-bold uppercase tracking-[0.06em] text-white hover:bg-white/15"
              href="/draws-budget"
            >
              <ArrowLeft size={17} />
              Back
            </Link>
            <a
              className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[#ff332b] px-4 text-sm font-bold uppercase tracking-[0.06em] text-white shadow-sm"
              href={`${appUrl}/api/qbo/accounts/sync?next=/buckets/${bucket}`}
            >
              <RefreshCcw size={16} />
              Sync QB
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-6 py-6">
        <section className="mb-5 rounded-[12px] border border-[#dedbd1] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brand-kicker text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff332b]">
                {config.label} Review
              </p>
              <h2 className="brand-heading mt-1 text-[24px] font-bold uppercase tracking-[0.04em] text-[#121d49]">
                {config.reviewTitle}
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#69746f]">
                Open a month below to see who was paid and each synced QuickBooks check or payment.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {accounts.length ? (
                accounts.map((account) => (
                  <span
                    className="rounded-[8px] border border-[#dedbd1] bg-[#fbfaf6] px-3 py-2 text-xs font-bold text-[#66716c]"
                    key={account.Id}
                  >
                    {accountName(account)}
                  </span>
                ))
              ) : (
                <span className="text-sm font-semibold text-[#69746f]">
                  No matching QuickBooks bank account found.
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="mb-5 rounded-[12px] border border-[#dedbd1] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#ece7dc] px-5 py-4">
            <div>
              <h2 className="brand-heading text-[18px] font-bold uppercase tracking-[0.05em] text-[#121d49]">
                Everyone Paid
              </h2>
              <p className="mt-1 text-sm font-semibold text-[#727d78]">
                {config.payeeSubtitle}
              </p>
            </div>
            <span className="rounded-[8px] bg-[#fff0ef] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#ff332b]">
              {overallPayees.length} payees
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
          <section className="rounded-[12px] border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-[0.08em]">No charges found yet</h2>
            <p className="mt-2 text-sm leading-6">
              Sync QB after QuickBooks has checks or purchases in this account.
            </p>
          </section>
        )}
      </div>
    </main>
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
        <thead className="bg-[#fbfaf6] text-left text-[11px] uppercase tracking-[0.14em] text-[#8d94a7]">
          <tr>
            <th className="px-4 py-3 font-medium">Payee</th>
            <th className="px-4 py-3 text-right font-medium">Total Paid</th>
            <th className="px-4 py-3 text-right font-medium">Checks / Payments</th>
            <th className="px-4 py-3 font-medium">Last Payment</th>
            <th className="px-4 py-3 font-medium">Recent Payments</th>
          </tr>
        </thead>
        <tbody>
          {payees.map((payee) => (
            <tr className="border-t border-[#ece7dc]" key={payee.name}>
              <td className="px-4 py-3 font-bold text-[#121d49]">{payee.name}</td>
              <td className="px-4 py-3 text-right font-bold text-[#121d49]">
                {currency(payee.totalSpent)}
              </td>
              <td className="px-4 py-3 text-right">{payee.transactionCount}</td>
              <td className="px-4 py-3 text-[#69746f]">{payee.lastPaymentDate ?? "No date"}</td>
              <td className="max-w-[360px] px-4 py-3 text-xs font-semibold leading-5 text-[#69746f]">
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
  const spendingTransactions = group.transactions.filter((transaction) => transaction.totalAmount >= 0);

  return (
    <details
      className="rounded-[12px] border border-[#dedbd1] bg-white shadow-sm [&_summary::-webkit-details-marker]:hidden"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer items-center justify-between border-b border-[#ece7dc] px-5 py-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="text-[#ff332b]" size={18} />
          <div>
            <h2 className="brand-heading text-[18px] font-bold uppercase tracking-[0.04em] text-[#121d49]">
              {group.label}
            </h2>
            <p className="mt-1 text-xs font-semibold text-[#69746f]">
              Click to see who was paid this month.
            </p>
          </div>
        </div>
        <div className="rounded-[8px] border border-[#dedbd1] bg-[#fbfaf6] px-3 py-2 text-sm font-bold text-[#69746f]">
          Paid: <span className="text-[#121d49]">{currency(group.totalOut)}</span>
        </div>
      </summary>

      <div className="border-b border-[#ece7dc]">
        <div className="px-5 py-3">
          <h3 className="brand-kicker text-[11px] font-bold uppercase tracking-[0.16em] text-[#8d94a7]">
            Paid This Month By Payee
          </h3>
        </div>
        <PayeeSpendTable
          emptyText="No paid payees found for this month."
          payees={group.payees}
        />
      </div>

      {spendingTransactions.length ? (
        <div className="overflow-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead className="bg-[#fbfaf6] text-left text-[11px] uppercase tracking-[0.14em] text-[#8d94a7]">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Payee</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Memo</th>
                <th className="px-4 py-3 text-right font-medium">Amount Paid</th>
              </tr>
            </thead>
            <tbody>
              {spendingTransactions.map((transaction) => (
                <tr className="border-t border-[#ece7dc]" key={`${transaction.source}-${transaction.id}`}>
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
                  <td className="px-4 py-3 text-right font-semibold text-[#121d49]">
                    {currency(transaction.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-t border-[#ece7dc] px-5 py-4 text-sm font-semibold text-[#69746f]">
          No paid checks or purchases found for this month.
        </div>
      )}
    </details>
  );
}
