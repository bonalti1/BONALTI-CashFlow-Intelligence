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
    matchers: ["payroll"],
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

function groupByMonth(transactions: SavedQboTransaction[]) {
  const groups = new Map<string, MonthGroup>();

  for (const transaction of transactions) {
    const key = monthKey(transaction.txnDate);
    const existing = groups.get(key) ?? {
      key,
      label: monthLabel(key),
      totalOut: 0,
      totalIn: 0,
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

  return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key));
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

            {groups.length ? (
              <div className="space-y-4">
                {groups.map((group) => (
                  <MonthSection group={group} key={group.key} />
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

function MonthSection({ group }: { group: MonthGroup }) {
  return (
    <section className="rounded-lg border border-[#dfe5dc] bg-white">
      <div className="flex items-center justify-between border-b border-[#edf0eb] px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="text-[#ff332b]" size={18} />
          <h2 className="text-sm font-semibold">{group.label}</h2>
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
    </section>
  );
}
