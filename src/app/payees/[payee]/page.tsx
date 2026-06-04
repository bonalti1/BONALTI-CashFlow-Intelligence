import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  ClipboardList,
  Database,
  HandCoins,
  LayoutDashboard,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

import { getTransactionsByBankAccount, type SavedQboTransaction } from "@/lib/qbo/transactions-store";

export const dynamic = "force-dynamic";

type MonthSummary = {
  key: string;
  label: string;
  totalPaid: number;
  count: number;
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
    };

    existing.totalPaid += Math.abs(transaction.totalAmount);
    existing.count += 1;
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
            <div>
              <div className="brand-heading text-base font-semibold text-[#121d49]">
                South Texas Builders
              </div>
              <div className="brand-kicker mt-1 text-[10px] font-medium uppercase text-[#ff332b]">
                Payee Detail
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            <NavItem href="/" icon={LayoutDashboard} label="Portfolio" />
            <NavItem href="/setup-inputs" icon={ClipboardList} label="House Setup" />
            <NavItem href="/payees" icon={HandCoins} label="Payees" />
            <NavItem href="/agent-health" icon={Brain} label="Intelligent Center" />
            <NavItem href="/company-brain" icon={Database} label="Company Brain" />
            <NavItem href="/setup" icon={ShieldCheck} label="Setup" />
          </nav>
        </aside>

        <section className="min-w-0 px-6 py-5">
          <header className="mb-5">
            <Link
              className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-[#ff332b]"
              href="/payees"
            >
              <ArrowLeft size={16} />
              Back to Payees
            </Link>
            <p className="brand-kicker text-xs font-bold uppercase text-[#ff332b]">
              Payee Checks
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-[#121d49]">{payeeName}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f6b66]">
              Every synced QuickBooks check/payment connected to this payee.
            </p>
          </header>

          <section className="mb-5 grid grid-cols-4 gap-3">
            <Metric label="Total Paid" value={shortCurrency(totalPaid)} />
            <Metric label="Checks / Payments" value={String(transactions.length)} />
            <Metric label="Bank Accounts" value={String(bankAccounts.length)} />
            <Metric
              label="Last Payment"
              value={transactions[0]?.txnDate ?? "No date"}
            />
          </section>

          <section className="mb-5 rounded-lg border border-[#dfe5dc] bg-white">
            <div className="flex items-center justify-between border-b border-[#edf0eb] px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Monthly Total</h2>
                <p className="mt-1 text-xs text-[#69746f]">
                  This shows how much was paid to this payee each month.
                </p>
              </div>
              <ReceiptText className="text-[#ff332b]" size={20} />
            </div>

            {monthSummaries.length ? (
              <div className="overflow-auto">
                <table className="w-full min-w-[680px] border-collapse text-sm">
                  <thead className="bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Month</th>
                      <th className="px-4 py-3 text-right font-medium">Total Paid</th>
                      <th className="px-4 py-3 text-right font-medium">Checks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthSummaries.map((month) => (
                      <tr className="border-t border-[#edf0eb]" key={month.key}>
                        <td className="px-4 py-3 font-semibold">{month.label}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#121d49]">
                          {currency(month.totalPaid)}
                        </td>
                        <td className="px-4 py-3 text-right">{month.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5 text-sm text-[#69746f]">No synced checks found yet.</div>
            )}
          </section>

          <section className="rounded-lg border border-[#dfe5dc] bg-white">
            <div className="flex items-center justify-between border-b border-[#edf0eb] px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Every Check / Payment</h2>
                <p className="mt-1 text-xs text-[#69746f]">
                  Full synced list from newest to oldest.
                </p>
              </div>
              <span className="rounded-md bg-[#fff0ef] px-2 py-1 text-xs font-bold text-[#ff332b]">
                {transactions.length}
              </span>
            </div>

            {transactions.length ? (
              <div className="overflow-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead className="sticky top-0 bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Bank Account</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Check #</th>
                      <th className="px-4 py-3 font-medium">Memo / Category</th>
                      <th className="px-4 py-3 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => (
                      <tr
                        className="border-t border-[#edf0eb]"
                        key={`${transaction.source}-${transaction.id}`}
                      >
                        <td className="px-4 py-3">{transaction.txnDate ?? "No date"}</td>
                        <td className="px-4 py-3 text-[#4f5b56]">
                          {transaction.bankAccountName ?? "No bank account"}
                        </td>
                        <td className="px-4 py-3 text-[#69746f]">{transaction.source}</td>
                        <td className="px-4 py-3">{transaction.docNumber ?? "-"}</td>
                        <td className="max-w-[360px] px-4 py-3 text-[#4f5b56]">
                          {transaction.memo || transaction.expenseAccountNames.join(", ") || "No memo"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-[#121d49]">
                          {currency(Math.abs(transaction.totalAmount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5 text-sm leading-6 text-[#69746f]">
                No checks/payments are synced for this payee yet.
              </div>
            )}
          </section>
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
      ? "bg-[#fff0ef] font-bold text-[#ff332b]"
      : "text-[#5f6b66] hover:bg-[#fff0ef] hover:text-[#ff332b]"
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#dfe5dc] bg-white p-4">
      <div className="text-xs font-medium uppercase text-[#69746f]">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-[#18211f]">{value}</div>
    </div>
  );
}
