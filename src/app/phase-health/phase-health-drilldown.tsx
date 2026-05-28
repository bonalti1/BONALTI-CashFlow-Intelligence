"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, X, XCircle } from "lucide-react";

export type PhaseTransactionView = {
  key: string;
  txnDate: string | null;
  payeeName: string | null;
  totalAmount: number;
  clearedStatus: "cleared" | "not_cleared" | "unknown";
  expenseAccountName: string | null;
  docNumber: string | null;
};

export type PhaseGroupView = {
  key: string;
  label: string;
  name: string;
  budgetPercent: number | null;
  budget: number | null;
  spent: number;
  transactions: PhaseTransactionView[];
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

function percent(value: number) {
  return `${(value * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

function phaseTone(phase: PhaseGroupView, soldPrice: number | null) {
  const hasChecks = phase.transactions.length > 0;
  const needsSoldPrice = hasChecks && !soldPrice && phase.key !== "needsMapping";
  const overBudget = Boolean(phase.budget && phase.spent > phase.budget);
  const ready = Boolean(phase.budget && hasChecks && !overBudget);

  if (phase.key === "needsMapping" && hasChecks) {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-800",
      status: "Map checks",
      icon: AlertTriangle,
    };
  }

  if (overBudget) {
    return {
      className: "border-red-200 bg-red-50 text-red-800",
      status: `Over ${shortCurrency(Math.abs((phase.budget ?? 0) - phase.spent))}`,
      icon: XCircle,
    };
  }

  if (ready) {
    return {
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      status: `Left ${shortCurrency(Math.abs((phase.budget ?? 0) - phase.spent))}`,
      icon: CheckCircle2,
    };
  }

  if (needsSoldPrice) {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-800",
      status: "Need price",
      icon: AlertTriangle,
    };
  }

  return {
    className: "border-[#dfe5dc] bg-[#fbfcfa] text-[#69746f]",
    status: hasChecks ? "Review" : "No checks",
    icon: AlertTriangle,
  };
}

function statusLabel(status: PhaseTransactionView["clearedStatus"]) {
  if (status === "cleared") {
    return "Cleared";
  }

  if (status === "not_cleared") {
    return "Pending";
  }

  return "Unknown";
}

export function PhaseHealthDrilldown({
  phaseGroups,
  soldPrice,
}: {
  phaseGroups: PhaseGroupView[];
  soldPrice: number | null;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedPhase = useMemo(
    () => phaseGroups.find((phase) => phase.key === selectedKey) ?? null,
    [phaseGroups, selectedKey],
  );
  const trustedCount = phaseGroups.filter(
    (group) => group.key !== "needsMapping" && group.transactions.length > 0,
  ).length;
  const needsMapping = phaseGroups.find((group) => group.key === "needsMapping");

  return (
    <div className="min-w-[460px]">
      <div className="flex flex-wrap gap-1.5">
        {phaseGroups.map((phase) => {
          const tone = phaseTone(phase, soldPrice);
          const Icon = tone.icon;

          return (
            <button
              className={`grid min-h-16 min-w-[72px] place-items-center rounded-md border px-2 py-1 text-center text-[11px] transition hover:-translate-y-0.5 hover:shadow-sm ${tone.className}`}
              key={phase.key}
              onClick={() => setSelectedKey(phase.key)}
              title={
                phase.budgetPercent
                  ? `${phase.label} budget is ${percent(phase.budgetPercent)} of sold price`
                  : `${phase.name} needs mapping`
              }
              type="button"
            >
              <div className="flex items-center gap-1 font-bold">
                <Icon size={12} />
                {phase.label}
              </div>
              <div className="mt-0.5 whitespace-nowrap font-semibold">
                {shortCurrency(phase.spent)}
              </div>
              <div className="mt-0.5 whitespace-nowrap">{tone.status}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-xs leading-5 text-[#69746f]">
        {trustedCount > 0
          ? `${trustedCount} phase groups have mapped checks. Click a phase to see the checks.`
          : "Checks will show inside each phase after Chart of Accounts mapping is cleaned up."}
        {needsMapping && needsMapping.transactions.length > 0
          ? ` ${needsMapping.transactions.length} checks still need mapping.`
          : ""}
      </div>

      {selectedPhase ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121d49]/35 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-lg border border-[#d9dee9] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#edf0eb] bg-[#fbfcfa] px-5 py-4">
              <div>
                <p className="brand-kicker text-[10px] font-bold uppercase text-[#ff332b]">
                  Phase Checks
                </p>
                <h3 className="mt-1 text-2xl font-bold text-[#121d49]">
                  {selectedPhase.label} · {selectedPhase.name}
                </h3>
                <p className="mt-1 text-sm text-[#69746f]">
                  This shows the checks currently grouped into this phase.
                </p>
              </div>
              <button
                className="grid size-9 place-items-center rounded-md border border-[#d9dee9] bg-white text-[#121d49] transition hover:border-[#ff332b] hover:text-[#ff332b]"
                onClick={() => setSelectedKey(null)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 border-b border-[#edf0eb] px-5 py-4 sm:grid-cols-3">
              <div className="rounded-lg border border-[#d9dee9] bg-white p-3">
                <div className="text-xs font-bold uppercase text-[#69746f]">Spent</div>
                <div className="mt-1 text-xl font-bold text-[#121d49]">
                  {currency(selectedPhase.spent)}
                </div>
              </div>
              <div className="rounded-lg border border-[#d9dee9] bg-white p-3">
                <div className="text-xs font-bold uppercase text-[#69746f]">Budget</div>
                <div className="mt-1 text-xl font-bold text-[#121d49]">
                  {selectedPhase.budget ? currency(selectedPhase.budget) : "Needs mapping"}
                </div>
              </div>
              <div className="rounded-lg border border-[#d9dee9] bg-white p-3">
                <div className="text-xs font-bold uppercase text-[#69746f]">Checks</div>
                <div className="mt-1 text-xl font-bold text-[#121d49]">
                  {selectedPhase.transactions.length}
                </div>
              </div>
            </div>

            <div className="max-h-[46vh] overflow-auto px-5 py-4">
              {selectedPhase.transactions.length ? (
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead className="text-left text-xs uppercase text-[#69746f]">
                    <tr>
                      <th className="border-b border-[#edf0eb] px-3 py-2 font-bold">Date</th>
                      <th className="border-b border-[#edf0eb] px-3 py-2 font-bold">Payee</th>
                      <th className="border-b border-[#edf0eb] px-3 py-2 font-bold">Line Item</th>
                      <th className="border-b border-[#edf0eb] px-3 py-2 font-bold">Status</th>
                      <th className="border-b border-[#edf0eb] px-3 py-2 text-right font-bold">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPhase.transactions.map((transaction) => (
                      <tr className="border-b border-[#edf0eb]" key={transaction.key}>
                        <td className="px-3 py-3 text-[#69746f]">
                          {transaction.txnDate ?? "No date"}
                        </td>
                        <td className="px-3 py-3 font-bold text-[#121d49]">
                          {transaction.payeeName ?? "No payee listed"}
                          {transaction.docNumber ? (
                            <div className="text-xs font-normal text-[#69746f]">
                              Check #{transaction.docNumber}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-[#4f5b56]">
                          {transaction.expenseAccountName ?? "No line item"}
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full border border-[#d9dee9] bg-[#fbfcfa] px-2 py-1 text-xs font-bold text-[#4f5b56]">
                            {statusLabel(transaction.clearedStatus)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-[#121d49]">
                          {currency(Math.abs(transaction.totalAmount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="rounded-lg border border-[#d9dee9] bg-[#fbfcfa] p-5 text-sm text-[#69746f]">
                  No checks are mapped to this phase yet.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
