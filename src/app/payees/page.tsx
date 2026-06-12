import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  HandCoins,
  ReceiptText,
} from "lucide-react";

import { getTransactionsByBankAccount, type SavedQboTransaction } from "@/lib/qbo/transactions-store";

export const dynamic = "force-dynamic";

type PayeeSummary = {
  name: string;
  totalPaid: number;
  paymentCount: number;
  firstPaymentDate: string | null;
  lastPaymentDate: string | null;
  bankAccounts: string[];
  transactions: SavedQboTransaction[];
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizePayeeName(transaction: SavedQboTransaction) {
  return transaction.payeeName?.trim() || "No payee listed";
}

function payeeHref(name: string) {
  return `/payees/${encodeURIComponent(name)}`;
}

function buildPayeeSummaries(transactions: SavedQboTransaction[]) {
  const summaries = new Map<string, PayeeSummary>();

  for (const transaction of transactions) {
    const amount = Math.abs(transaction.totalAmount);

    if (amount === 0) {
      continue;
    }

    const name = normalizePayeeName(transaction);
    const existing = summaries.get(name) ?? {
      name,
      totalPaid: 0,
      paymentCount: 0,
      firstPaymentDate: null,
      lastPaymentDate: null,
      bankAccounts: [],
      transactions: [],
    };

    existing.totalPaid += amount;
    existing.paymentCount += 1;
    existing.transactions.push(transaction);

    if (transaction.bankAccountName && !existing.bankAccounts.includes(transaction.bankAccountName)) {
      existing.bankAccounts.push(transaction.bankAccountName);
    }

    if (
      transaction.txnDate &&
      (!existing.lastPaymentDate || transaction.txnDate > existing.lastPaymentDate)
    ) {
      existing.lastPaymentDate = transaction.txnDate;
    }

    if (
      transaction.txnDate &&
      (!existing.firstPaymentDate || transaction.txnDate < existing.firstPaymentDate)
    ) {
      existing.firstPaymentDate = transaction.txnDate;
    }

    summaries.set(name, existing);
  }

  return Array.from(summaries.values()).sort(
    (a, b) => b.totalPaid - a.totalPaid || a.name.localeCompare(b.name),
  );
}

export default async function PayeesPage() {
  const transactionsByBankAccount = await getTransactionsByBankAccount();
  const transactions = Array.from(transactionsByBankAccount.values())
    .flat()
    .sort((a, b) => String(b.txnDate ?? "").localeCompare(String(a.txnDate ?? "")));
  const payees = buildPayeeSummaries(transactions);

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
                Money Out
              </p>
              <h1 className="brand-heading mt-1 flex items-center gap-3 text-[28px] font-bold uppercase tracking-[0.05em]">
                <HandCoins size={26} />
                Payees
              </h1>
            </div>
          </div>

          <Link
            className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-white/20 bg-white/10 px-4 text-sm font-bold uppercase tracking-[0.06em] text-white hover:bg-white/15"
            href="/draws-budget"
          >
            <ArrowLeft size={17} />
            Back
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1440px] px-6 py-6">
        <div className="mb-5 rounded-[12px] border border-[#dedbd1] bg-white p-5 shadow-sm">
          <p className="brand-kicker text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff332b]">
            Payee List
          </p>
          <h2 className="brand-heading mt-1 text-[24px] font-bold uppercase tracking-[0.04em] text-[#121d49]">
            Everyone Paid Through South Texas Builders
          </h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#727d78]">
            Click a payee to see how much they were paid by month, then open a month
            to review the check-level breakdown.
          </p>
        </div>

        <PayeeSection
          emptyText="No synced checks/payments found yet. Press Sync QB from the dashboard first."
          icon={ReceiptText}
          payees={payees}
          subtitle="Sorted by total paid from synced QuickBooks checks and payments."
          title="Payees"
        />
      </section>
    </main>
  );
}

function PayeeSection({
  emptyText,
  icon: Icon,
  payees,
  subtitle,
  title,
}: {
  emptyText: string;
  icon: typeof ReceiptText;
  payees: PayeeSummary[];
  subtitle: string;
  title: string;
}) {
  return (
    <section className="mb-5 rounded-[12px] border border-[#dedbd1] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#ece7dc] px-5 py-4">
        <div>
          <h2 className="brand-heading text-[18px] font-bold uppercase tracking-[0.05em] text-[#121d49]">
            {title}
          </h2>
          <p className="mt-1 text-sm font-semibold text-[#727d78]">{subtitle}</p>
        </div>
        <div className="grid size-10 place-items-center rounded-[8px] bg-[#fff0ef] text-[#ff332b]">
          <Icon size={20} />
        </div>
      </div>

      {payees.length ? (
        <div className="overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="sticky top-0 bg-[#fbfaf6] text-left text-[11px] uppercase tracking-[0.14em] text-[#8d94a7]">
              <tr>
                <th className="px-5 py-3 font-bold">Payee</th>
                <th className="px-5 py-3 text-right font-bold">Total Paid</th>
                <th className="px-5 py-3 text-right font-bold">Payments</th>
                <th className="px-5 py-3 font-bold">Last Payment</th>
                <th className="px-5 py-3 font-bold">Paid From</th>
                <th className="px-5 py-3 font-bold">Recent Checks</th>
              </tr>
            </thead>
            <tbody>
              {payees.map((payee, index) => (
                <tr className="border-t border-[#ece7dc]" key={payee.name}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="grid size-9 place-items-center rounded-[8px] border border-[#ffd4d1] bg-[#fff7f6] text-xs font-bold text-[#ff332b]">
                        {index + 1}
                      </div>
                      <div>
                        <Link
                          className="font-bold text-[#121d49] hover:text-[#ff332b]"
                          href={payeeHref(payee.name)}
                        >
                          {payee.name}
                        </Link>
                        <div className="text-xs font-semibold text-[#8d94a7]">
                          First seen {payee.firstPaymentDate ?? "No date"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-[#121d49]">
                    {currency(payee.totalPaid)}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-[#727d78]">
                    {payee.paymentCount}
                  </td>
                  <td className="px-5 py-4 font-semibold text-[#727d78]">
                    {payee.lastPaymentDate ?? "No date"}
                  </td>
                  <td className="max-w-[230px] px-5 py-4 text-xs font-semibold leading-5 text-[#727d78]">
                    {payee.bankAccounts.slice(0, 3).join(", ") || "No bank account"}
                    {payee.bankAccounts.length > 3 ? "..." : ""}
                  </td>
                  <td className="max-w-[330px] px-5 py-4">
                    <div className="space-y-1">
                      {payee.transactions.slice(0, 3).map((transaction) => (
                        <div
                          className="flex items-center justify-between gap-3 rounded-[8px] bg-[#fbfaf6] px-2 py-1 text-xs"
                          key={`${transaction.source}-${transaction.id}`}
                        >
                          <span className="truncate text-[#727d78]">
                            {transaction.txnDate ?? "No date"} ·{" "}
                            {transaction.bankAccountName ?? "No account"}
                          </span>
                          <span className="font-bold text-[#121d49]">
                            {currency(Math.abs(transaction.totalAmount))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5 text-sm font-semibold leading-6 text-[#727d78]">{emptyText}</div>
      )}
    </section>
  );
}
