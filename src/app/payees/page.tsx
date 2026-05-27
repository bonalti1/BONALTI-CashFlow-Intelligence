import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightLeft,
  Brain,
  ClipboardList,
  HandCoins,
  LayoutDashboard,
  NotebookText,
  ReceiptText,
  ShieldCheck,
  UserPlus,
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

function getTransactionMonth(transaction: SavedQboTransaction) {
  return transaction.txnDate?.slice(0, 7) ?? null;
}

function getLatestMonth(transactions: SavedQboTransaction[]) {
  return transactions.reduce<string | null>((latest, transaction) => {
    const month = getTransactionMonth(transaction);

    if (!month) {
      return latest;
    }

    return !latest || month > latest ? month : latest;
  }, null);
}

function formatMonth(month: string | null) {
  if (!month) {
    return "latest sync";
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1, 1);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function isInternalTransfer(transaction: SavedQboTransaction) {
  const keywords = [
    "income clearing",
    "management",
    "marketing",
    "operating",
    "operations",
    "payroll",
    "transfer",
  ];
  const text = [
    transaction.payeeName,
    transaction.bankAccountName,
    transaction.memo,
    transaction.expenseAccountNames.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return keywords.some((keyword) => text.includes(keyword));
}

export default async function PayeesPage() {
  const transactionsByBankAccount = await getTransactionsByBankAccount();
  const transactions = Array.from(transactionsByBankAccount.values())
    .flat()
    .sort((a, b) => String(b.txnDate ?? "").localeCompare(String(a.txnDate ?? "")));
  const payees = buildPayeeSummaries(transactions);
  const topPayees = payees.slice(0, 20);
  const latestMonth = getLatestMonth(transactions);
  const newPayees = payees
    .filter((payee) => payee.firstPaymentDate?.slice(0, 7) === latestMonth)
    .slice(0, 12);
  const internalTransferPayees = buildPayeeSummaries(transactions.filter(isInternalTransfer)).slice(0, 12);
  const totalPaid = payees.reduce((total, payee) => total + payee.totalPaid, 0);
  const internalTransferTotal = internalTransferPayees.reduce(
    (total, payee) => total + payee.totalPaid,
    0,
  );
  const biggestPayee = payees[0];

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
                Money Out
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            <NavItem href="/" icon={LayoutDashboard} label="Portfolio" />
            <NavItem href="/setup-inputs" icon={ClipboardList} label="House Setup" />
            <NavItem href="/ai-health" icon={Brain} label="AI Health Center" />
            <NavItem active icon={HandCoins} label="Payees" />
            <NavItem href="/agent-health" icon={NotebookText} label="Agent Health Notes" />
            <NavItem href="/setup" icon={ShieldCheck} label="Setup" />
          </nav>
        </aside>

        <section className="min-w-0 px-6 py-5">
          <header className="mb-5">
            <p className="brand-kicker text-xs font-bold uppercase text-[#ff332b]">Payees</p>
            <h1 className="mt-1 text-3xl font-semibold text-[#121d49]">
              Who Is Getting The Most Money
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f6b66]">
              This page reads synced QuickBooks checks/payments and ranks vendors, employees, and
              payees by total money paid.
            </p>
          </header>

          <section className="mb-5 grid grid-cols-4 gap-3">
            <Metric label="Total Payees" value={String(payees.length)} />
            <Metric label="Total Money Out" value={shortCurrency(totalPaid)} />
            <Metric label={`New in ${formatMonth(latestMonth)}`} value={String(newPayees.length)} />
            <Metric
              label="Internal Movement"
              value={internalTransferTotal ? shortCurrency(internalTransferTotal) : "$0"}
            />
          </section>

          <section className="mb-5 rounded-lg border border-[#dfe5dc] bg-white p-3">
            <div className="flex flex-wrap gap-2">
              <SectionJump href="#top-payees" icon={ReceiptText} label="Top Payees" />
              <SectionJump href="#new-payees" icon={UserPlus} label="New Payees" />
              <SectionJump
                href="#internal-transfers"
                icon={ArrowRightLeft}
                label="Internal Transfers"
              />
            </div>
          </section>

          <PayeeSection
            emptyText="No synced checks/payments found yet. Press Sync QB from the dashboard first."
            icon={ReceiptText}
            id="top-payees"
            payees={topPayees}
            subtitle={
              biggestPayee
                ? `${biggestPayee.name} is currently the largest payee seen in QuickBooks.`
                : "Sorted by total paid from synced QuickBooks transactions."
            }
            title="Top Payees"
          />

          <PayeeSection
            emptyText={`No brand-new payees were found in ${formatMonth(latestMonth)}.`}
            icon={UserPlus}
            id="new-payees"
            payees={newPayees}
            rankLabel="New"
            subtitle={`Payees whose first synced payment appears in ${formatMonth(latestMonth)}.`}
            title="New Payees"
          />

          <PayeeSection
            emptyText="No internal transfer-looking payments were found in the synced data."
            icon={ArrowRightLeft}
            id="internal-transfers"
            payees={internalTransferPayees}
            rankLabel="Move"
            subtitle="Payments that mention marketing, payroll, operating, management, income clearing, or transfer."
            title="Internal Transfers"
          />
        </section>
      </div>
    </main>
  );
}

function PayeeSection({
  emptyText,
  icon: Icon,
  id,
  payees,
  rankLabel,
  subtitle,
  title,
}: {
  emptyText: string;
  icon: typeof ReceiptText;
  id: string;
  payees: PayeeSummary[];
  rankLabel?: string;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="mb-5 rounded-lg border border-[#dfe5dc] bg-white" id={id}>
            <div className="flex items-center justify-between border-b border-[#edf0eb] px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="mt-1 text-xs text-[#69746f]">
                  {subtitle}
                </p>
              </div>
              <Icon className="text-[#ff332b]" size={20} />
            </div>

            {payees.length ? (
              <div className="overflow-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead className="sticky top-0 bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Payee</th>
                      <th className="px-4 py-3 text-right font-medium">Total Paid</th>
                      <th className="px-4 py-3 text-right font-medium">Payments</th>
                      <th className="px-4 py-3 font-medium">Last Payment</th>
                      <th className="px-4 py-3 font-medium">Paid From</th>
                      <th className="px-4 py-3 font-medium">Recent Checks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payees.map((payee, index) => (
                      <tr className="border-t border-[#edf0eb]" key={payee.name}>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="grid size-8 place-items-center rounded-md bg-[#fff0ef] text-xs font-bold text-[#ff332b]">
                              {rankLabel ? `${rankLabel} ${index + 1}` : index + 1}
                            </div>
                            <div>
                              <Link
                                className="font-semibold text-[#121d49] hover:text-[#ff332b]"
                                href={payeeHref(payee.name)}
                              >
                                {payee.name}
                              </Link>
                              <div className="text-xs text-[#69746f]">
                                First seen {payee.firstPaymentDate ?? "No date"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-[#121d49]">
                          {currency(payee.totalPaid)}
                        </td>
                        <td className="px-4 py-4 text-right">{payee.paymentCount}</td>
                        <td className="px-4 py-4 text-[#4f5b56]">
                          {payee.lastPaymentDate ?? "No date"}
                        </td>
                        <td className="max-w-[230px] px-4 py-4 text-xs leading-5 text-[#69746f]">
                          {payee.bankAccounts.slice(0, 3).join(", ") || "No bank account"}
                          {payee.bankAccounts.length > 3 ? "..." : ""}
                        </td>
                        <td className="max-w-[330px] px-4 py-4">
                          <div className="space-y-1">
                            {payee.transactions.slice(0, 3).map((transaction) => (
                              <div
                                className="flex items-center justify-between gap-3 rounded-md bg-[#fbfcfa] px-2 py-1 text-xs"
                                key={`${transaction.source}-${transaction.id}`}
                              >
                                <span className="truncate text-[#69746f]">
                                  {transaction.txnDate ?? "No date"} ·{" "}
                                  {transaction.bankAccountName ?? "No account"}
                                </span>
                                <span className="font-semibold text-[#121d49]">
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
              <div className="p-5 text-sm leading-6 text-[#69746f]">
                {emptyText}
              </div>
            )}
          </section>
  );
}

function SectionJump({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof ReceiptText;
  label: string;
}) {
  return (
    <a
      className="inline-flex h-9 items-center gap-2 rounded-md border border-[#dfe5dc] bg-[#fbfcfa] px-3 text-sm font-semibold text-[#121d49] hover:border-[#ff332b] hover:text-[#ff332b]"
      href={href}
    >
      <Icon size={16} />
      {label}
    </a>
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
