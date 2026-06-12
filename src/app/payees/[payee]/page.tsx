import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  HandCoins,
  ReceiptText,
} from "lucide-react";

import { getTransactionsByBankAccount, type SavedQboTransaction } from "@/lib/qbo/transactions-store";

export const dynamic = "force-dynamic";

type MonthSummary = {
  key: string;
  label: string;
  totalPaid: number;
  count: number;
  transactions: SavedQboTransaction[];
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

function normalizePayeeName(transaction: SavedQboTransaction) {
  return transaction.payeeName?.trim() || "No payee listed";
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

function buildMonthSummaries(transactions: SavedQboTransaction[]) {
  const summaries = new Map<string, MonthSummary>();

  for (const transaction of transactions) {
    const key = monthKey(transaction.txnDate);
    const existing = summaries.get(key) ?? {
      key,
      label: monthLabel(key),
      totalPaid: 0,
      count: 0,
      transactions: [],
    };

    existing.totalPaid += Math.abs(transaction.totalAmount);
    existing.count += 1;
    existing.transactions.push(transaction);
    summaries.set(key, existing);
  }

  return Array.from(summaries.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export default async function PayeeDetailPage({
  params,
}: {
  params: Promise<{ payee: string }>;
}) {
  const { payee } = await params;
  const payeeName = decodeURIComponent(payee);
  const transactionsByBankAccount = await getTransactionsByBankAccount();
  const transactions = Array.from(transactionsByBankAccount.values())
    .flat()
    .filter((transaction) => normalizePayeeName(transaction) === payeeName)
    .sort((a, b) => String(b.txnDate ?? "").localeCompare(String(a.txnDate ?? "")));
  const totalPaid = transactions.reduce(
    (total, transaction) => total + Math.abs(transaction.totalAmount),
    0,
  );
  const bankAccounts = Array.from(
    new Set(transactions.map((transaction) => transaction.bankAccountName).filter(Boolean)),
  );
  const monthSummaries = buildMonthSummaries(transactions);

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
                Payee Detail
              </p>
              <h1 className="brand-heading mt-1 flex items-center gap-3 text-[28px] font-bold uppercase tracking-[0.05em]">
                <HandCoins size={26} />
                {payeeName}
              </h1>
            </div>
          </div>

          <Link
            className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-white/20 bg-white/10 px-4 text-sm font-bold uppercase tracking-[0.06em] text-white hover:bg-white/15"
            href="/payees"
          >
            <ArrowLeft size={17} />
            Back To Payees
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1440px] px-6 py-6">
        <div className="mb-5 rounded-[12px] border border-[#dedbd1] bg-white p-5 shadow-sm">
          <p className="brand-kicker text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff332b]">
            Check History
          </p>
          <h2 className="brand-heading mt-1 text-[24px] font-bold uppercase tracking-[0.04em] text-[#121d49]">
            {payeeName}
          </h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#727d78]">
            Open a month to see every synced QuickBooks check or payment connected to this payee.
          </p>
        </div>

        <section className="mb-5 grid gap-3 md:grid-cols-4">
          <Metric label="Total Paid" value={shortCurrency(totalPaid)} />
          <Metric label="Checks / Payments" value={String(transactions.length)} />
          <Metric label="Bank Accounts" value={String(bankAccounts.length)} />
          <Metric label="Last Payment" value={transactions[0]?.txnDate ?? "No date"} />
        </section>

        <section className="mb-5 rounded-[12px] border border-[#dedbd1] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#ece7dc] px-5 py-4">
            <div>
              <h2 className="brand-heading text-[18px] font-bold uppercase tracking-[0.05em] text-[#121d49]">
                Monthly Total
              </h2>
              <p className="mt-1 text-sm font-semibold text-[#727d78]">
                How much was paid to this payee each month.
              </p>
            </div>
            <div className="grid size-10 place-items-center rounded-[8px] bg-[#fff0ef] text-[#ff332b]">
              <ReceiptText size={20} />
            </div>
          </div>

          {monthSummaries.length ? (
            <div className="divide-y divide-[#ece7dc]">
              {monthSummaries.map((month, index) => (
                <details className="group" key={month.key} open={index === 0}>
                  <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-4 hover:bg-[#fbfaf6]">
                    <div>
                      <div className="brand-heading text-[18px] font-bold text-[#121d49]">
                        {month.label}
                      </div>
                      <div className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[#8d94a7]">
                        Click to see each check
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8d94a7]">
                        Paid
                      </div>
                      <div className="brand-heading text-lg font-bold text-[#121d49]">
                        {currency(month.totalPaid)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8d94a7]">
                        Checks
                      </div>
                      <div className="brand-heading text-lg font-bold text-[#121d49]">
                        {month.count}
                      </div>
                    </div>
                    <span className="rounded-[8px] border border-[#dedbd1] bg-white px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#121d49] group-open:border-[#ff332b] group-open:text-[#ff332b]">
                      Open
                    </span>
                  </summary>

                  <div className="border-t border-[#ece7dc] bg-[#fbfaf6] px-5 py-4">
                    <div className="overflow-auto rounded-[10px] border border-[#dedbd1] bg-white">
                      <table className="w-full min-w-[980px] border-collapse text-sm">
                        <thead className="bg-white text-left text-[11px] uppercase tracking-[0.14em] text-[#8d94a7]">
                          <tr>
                            <th className="px-4 py-3 font-bold">Date</th>
                            <th className="px-4 py-3 font-bold">Bank Account</th>
                            <th className="px-4 py-3 font-bold">Type</th>
                            <th className="px-4 py-3 font-bold">Check #</th>
                            <th className="px-4 py-3 font-bold">Memo / Category</th>
                            <th className="px-4 py-3 text-right font-bold">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {month.transactions.map((transaction) => (
                            <tr
                              className="border-t border-[#ece7dc]"
                              key={`${transaction.source}-${transaction.id}`}
                            >
                              <td className="px-4 py-3 font-semibold text-[#727d78]">
                                {transaction.txnDate ?? "No date"}
                              </td>
                              <td className="px-4 py-3 font-semibold text-[#727d78]">
                                {transaction.bankAccountName ?? "No bank account"}
                              </td>
                              <td className="px-4 py-3 font-semibold text-[#727d78]">
                                {transaction.source}
                              </td>
                              <td className="px-4 py-3 font-semibold text-[#727d78]">
                                {transaction.docNumber ?? "-"}
                              </td>
                              <td className="max-w-[360px] px-4 py-3 font-semibold text-[#727d78]">
                                {transaction.memo ||
                                  transaction.expenseAccountNames.join(", ") ||
                                  "No memo"}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-[#121d49]">
                                {currency(Math.abs(transaction.totalAmount))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="p-5 text-sm font-semibold text-[#727d78]">
              No synced checks found yet.
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[#dedbd1] bg-white p-5 shadow-sm">
      <div className="brand-kicker text-[11px] font-bold uppercase tracking-[0.16em] text-[#8d94a7]">
        {label}
      </div>
      <div className="brand-heading mt-2 text-[28px] font-bold text-[#121d49]">{value}</div>
    </div>
  );
}
