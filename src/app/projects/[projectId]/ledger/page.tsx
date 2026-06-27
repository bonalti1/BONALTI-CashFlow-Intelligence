import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BadgeDollarSign,
  CircleDollarSign,
  RefreshCw,
} from "lucide-react";

import { getHouseDashboardSummaries } from "@/lib/dashboard/house-dashboard-summary-store";
import {
  getProjectLedgerTransactions,
  type ProjectLedgerTransaction,
} from "@/lib/qbo/transactions-store";

export const dynamic = "force-dynamic";

type ProjectLedgerPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string }>;
};

type LedgerView = "all" | "expenses" | "transfer_in" | "transfer_out";

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function transactionLabel(transaction: ProjectLedgerTransaction) {
  if (transaction.direction === "transfer_in") return "Transfer in";
  if (transaction.direction === "transfer_out") return "Transfer out";
  return transaction.source === "Check" ? "Check" : "Expense";
}

function transactionTone(transaction: ProjectLedgerTransaction) {
  if (transaction.direction === "transfer_in") {
    return "border-[#b9dec9] bg-[#eaf7f0] text-[#1f6f4b]";
  }

  if (transaction.direction === "transfer_out") {
    return "border-[#f4d48a] bg-[#fff6df] text-[#9a6500]";
  }

  return "border-[#d6dceb] bg-[#f5f7fb] text-[#16294d]";
}

export default async function ProjectLedgerPage({
  params,
  searchParams,
}: ProjectLedgerPageProps) {
  const { projectId } = await params;
  const query = await searchParams;
  const requestedView = query.view;
  const view: LedgerView =
    requestedView === "expenses" ||
    requestedView === "transfer_in" ||
    requestedView === "transfer_out"
      ? requestedView
      : "all";
  const decodedProjectId = decodeURIComponent(projectId);
  const [summaries, transactions] = await Promise.all([
    getHouseDashboardSummaries(),
    getProjectLedgerTransactions(decodedProjectId),
  ]);
  const project = summaries.find((summary) => summary.id === decodedProjectId);
  const expenseTransactions = transactions.filter((transaction) => transaction.countsTowardSpend);
  const expenses = expenseTransactions.reduce(
    (total, transaction) => total + Math.abs(transaction.totalAmount),
    0,
  );
  const transfersIn = transactions
    .filter((transaction) => transaction.direction === "transfer_in")
    .reduce((total, transaction) => total + Math.abs(transaction.totalAmount), 0);
  const transfersOut = transactions
    .filter((transaction) => transaction.direction === "transfer_out")
    .reduce((total, transaction) => total + Math.abs(transaction.totalAmount), 0);
  const projectName = project?.displayName ?? project?.house ?? "Project";
  const returnHref = `/draws-budget#house-${decodedProjectId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const visibleTransactions =
    view === "all"
      ? transactions
      : view === "expenses"
        ? expenseTransactions
        : transactions.filter((transaction) => transaction.direction === view);
  const ledgerBaseHref = `/projects/${encodeURIComponent(decodedProjectId)}/ledger`;
  const ledgerViews: Array<{ label: string; value: LedgerView; count: number }> = [
    { label: "All activity", value: "all", count: transactions.length },
    { label: "Expenses", value: "expenses", count: expenseTransactions.length },
    {
      label: "Transfers in",
      value: "transfer_in",
      count: transactions.filter((transaction) => transaction.direction === "transfer_in").length,
    },
    {
      label: "Transfers out",
      value: "transfer_out",
      count: transactions.filter((transaction) => transaction.direction === "transfer_out").length,
    },
  ];

  return (
    <main className="min-h-screen bg-[#f6f5ef] text-[#16294d]">
      <header className="bg-[#16294d] px-5 py-5 text-white">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              aria-label="Back to draws"
              className="grid h-10 w-10 place-items-center rounded-[8px] border border-white/20 bg-white/10"
              href={returnHref}
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#ff5a49]">
                Project Ledger
              </p>
              <h1 className="mt-1 text-2xl font-extrabold">
                {projectName}
                {project?.projectNumber ? (
                  <span className="ml-2 text-sm text-white/65">
                    Project {project.projectNumber}
                  </span>
                ) : null}
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/65">
                {project?.bank ?? "QuickBooks project account"}
              </p>
            </div>
          </div>
          <a
            className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-white px-4 text-xs font-extrabold uppercase tracking-[0.08em] text-[#16294d]"
            href={`/api/qbo/accounts/sync?next=${encodeURIComponent(`/projects/${projectId}/ledger`)}`}
          >
            <RefreshCw size={15} />
            Sync QuickBooks
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-5 py-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            detail="Contract or approved manual source"
            icon={BadgeDollarSign}
            label="Sold price"
            value={project?.soldPrice === null || project?.soldPrice === undefined
              ? "Pending"
              : currency(project.soldPrice)}
          />
          <Metric
            detail={`${expenseTransactions.length} cost transactions`}
            icon={CircleDollarSign}
            label="Project expenses"
            value={currency(expenses)}
          />
          <Metric
            detail="Funding movement, excluded from cost"
            icon={ArrowDownLeft}
            label="Transfers in"
            tone="green"
            value={currency(transfersIn)}
          />
          <Metric
            detail="Cash movement, excluded from cost"
            icon={ArrowUpRight}
            label="Transfers out"
            tone="amber"
            value={currency(transfersOut)}
          />
        </section>

        <section className="mt-5 overflow-hidden rounded-[12px] border border-[#e3e1d7] bg-white">
          <div className="border-b border-[#e3e1d7] px-5 py-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold">QuickBooks activity</h2>
                <p className="mt-1 text-sm font-semibold text-[#7b8298]">
                  Expenses affect Project Spent. Transfers only explain where cash moved.
                </p>
              </div>
              <nav aria-label="Transaction filters" className="flex flex-wrap gap-2">
                {ledgerViews.map((ledgerView) => (
                  <Link
                    className={`rounded-[8px] border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.08em] ${
                      view === ledgerView.value
                        ? "border-[#16294d] bg-[#16294d] text-white"
                        : "border-[#d6dceb] bg-white text-[#556078]"
                    }`}
                    href={ledgerView.value === "all"
                      ? ledgerBaseHref
                      : `${ledgerBaseHref}?view=${ledgerView.value}`}
                    key={ledgerView.value}
                  >
                    {ledgerView.label} · {ledgerView.count}
                  </Link>
                ))}
              </nav>
            </div>
          </div>

          {visibleTransactions.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="font-extrabold">No transactions found in this filter.</p>
              <p className="mt-2 text-sm font-semibold text-[#7b8298]">
                Sync QuickBooks if you expect newer checks, expenses, or transfers.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="bg-[#fbfaf7] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#8d95aa]">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Payee / description</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Check / reference</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Bank status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTransactions.map((transaction) => (
                    <tr
                      className="border-t border-[#ece9df] text-sm"
                      key={`${transaction.source}-${transaction.id}`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-bold text-[#7b8298]">
                        {transaction.txnDate ?? "No date"}
                      </td>
                      <td className="max-w-[300px] px-4 py-3">
                        <p className="font-extrabold text-[#16294d]">
                          {transaction.payeeName ?? transaction.memo ?? "No payee listed"}
                        </p>
                        {transaction.payeeName && transaction.memo ? (
                          <p className="mt-1 truncate text-xs font-semibold text-[#8d95aa]">
                            {transaction.memo}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${transactionTone(transaction)}`}>
                          {transactionLabel(transaction)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-[#556078]">
                        {transaction.docNumber ?? "—"}
                      </td>
                      <td className="max-w-[250px] px-4 py-3 font-semibold text-[#556078]">
                        {transaction.expenseAccountNames.join(", ") ||
                          (transaction.direction === "transfer_in"
                            ? transaction.raw.FromAccountRef?.name ?? "Transfer source"
                            : transaction.direction === "transfer_out"
                              ? transaction.raw.ToAccountRef?.name ?? "Transfer destination"
                              : "Uncategorized")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold text-[#16294d]">
                        {currency(Math.abs(transaction.totalAmount))}
                      </td>
                      <td className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.06em] text-[#7b8298]">
                        {transaction.clearedStatus.replaceAll("_", " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-4 text-xs font-semibold leading-5 text-[#7b8298]">
          An expense paid from another bank account will not be assigned automatically unless
          QuickBooks carries a project/customer reference. Those items should enter an Unassigned
          queue for manual project allocation instead of being guessed.
        </p>
      </div>
    </main>
  );
}

function Metric({
  detail,
  icon: Icon,
  label,
  tone = "navy",
  value,
}: {
  detail: string;
  icon: typeof CircleDollarSign;
  label: string;
  tone?: "navy" | "green" | "amber";
  value: string;
}) {
  const iconTone =
    tone === "green"
      ? "bg-[#eaf7f0] text-[#1f6f4b]"
      : tone === "amber"
        ? "bg-[#fff6df] text-[#9a6500]"
        : "bg-[#eef3fc] text-[#16294d]";

  return (
    <div className="rounded-[12px] border border-[#e3e1d7] bg-white p-4 shadow-[0_10px_28px_-24px_rgba(14,27,54,0.5)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#8d95aa]">
            {label}
          </p>
          <p className="mt-2 text-2xl font-extrabold text-[#16294d]">{value}</p>
          <p className="mt-1 text-xs font-semibold text-[#7b8298]">{detail}</p>
        </div>
        <span className={`grid h-9 w-9 place-items-center rounded-[8px] ${iconTone}`}>
          <Icon size={17} />
        </span>
      </div>
    </div>
  );
}
