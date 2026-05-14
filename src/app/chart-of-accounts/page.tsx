import Link from "next/link";

import { getAccountsSnapshot } from "@/lib/qbo/accounts-store";

export const dynamic = "force-dynamic";

const plannedSections = [
  "Pre Phase / Soft Cost",
  "Job Site Overhead",
  "Phase 1 - Foundation",
  "Phase 2 - Frame & Dry-in",
  "Phase 3 - Rough Trades",
  "Phase 4 - Exterior & Floors",
  "Phase 5 - Interior Rough",
  "Phase 6 - Final",
];

export default async function ChartOfAccountsPage() {
  const snapshot = await getAccountsSnapshot().catch(() => null);
  const accounts = snapshot?.accounts ?? [];
  const byType = accounts.reduce<Record<string, number>>((groups, account) => {
    const key = account.AccountType ?? "Unknown";
    groups[key] = (groups[key] ?? 0) + 1;
    return groups;
  }, {});

  return (
    <main className="min-h-screen bg-[#f7f8f5] px-6 py-6 text-[#18211f]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-[#69746f]">
              QuickBooks substrate
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Chart of Accounts</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f6b66]">
              This is the account list copied from QuickBooks. The app reads this
              dynamically, so future QuickBooks cleanup can flow in without a code
              change.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              className="rounded-md border border-[#ccd6cf] bg-white px-3 py-2 text-sm font-medium"
              href="/mapping"
            >
              Mapping
            </Link>
            <Link
              className="rounded-md border border-[#ccd6cf] bg-white px-3 py-2 text-sm font-medium"
              href="/setup"
            >
              Setup
            </Link>
            <Link
              className="rounded-md border border-[#ccd6cf] bg-white px-3 py-2 text-sm font-medium"
              href="/"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <section className="mb-5 grid grid-cols-4 gap-3">
          <Metric label="Synced accounts" value={String(snapshot?.total ?? 0)} />
          <Metric
            label="Expected construction items"
            value="66"
            tone={(snapshot?.total ?? 0) === 66 ? "good" : "warn"}
          />
          <Metric
            label="Snapshot time"
            value={snapshot ? new Date(snapshot.syncedAt).toLocaleString() : "Not synced"}
          />
          <Metric label="QuickBooks company" value={snapshot?.realmId ?? "Missing"} />
        </section>

        <section className="mb-5 grid grid-cols-[1fr_1.5fr] gap-4">
          <div className="rounded-lg border border-[#dfe5dc] bg-white p-4">
            <h2 className="text-sm font-semibold">Account Types</h2>
            <div className="mt-4 space-y-2">
              {Object.entries(byType)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([type, count]) => (
                  <div className="flex items-center justify-between text-sm" key={type}>
                    <span className="text-[#5f6b66]">{type}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h2 className="text-sm font-semibold text-amber-900">Cleanup Target</h2>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              The product spec expects the construction chart to settle into these
              8 sections and 66 line items. The current QuickBooks snapshot has{" "}
              {snapshot?.total ?? 0} total accounts, so this page is our inspection
              surface while cleanup happens in QuickBooks.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {plannedSections.map((section) => (
                <div
                  className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-amber-900"
                  key={section}
                >
                  {section}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-[#dfe5dc] bg-white">
          <div className="border-b border-[#e6ebe3] px-4 py-3">
            <h2 className="text-sm font-semibold">Synced QuickBooks Accounts</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead className="bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Subtype</th>
                  <th className="px-4 py-3 font-medium">Parent</th>
                  <th className="px-4 py-3 font-medium">Active</th>
                  <th className="px-4 py-3 font-medium">QB ID</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr className="border-t border-[#edf0eb]" key={account.Id}>
                    <td className="px-4 py-3 font-medium">
                      {account.FullyQualifiedName ?? account.Name}
                    </td>
                    <td className="px-4 py-3 text-[#5f6b66]">
                      {account.AccountType ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-[#5f6b66]">
                      {account.AccountSubType ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-[#5f6b66]">
                      {account.ParentRef?.name ?? account.ParentRef?.value ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md border px-2 py-1 text-xs font-medium ${
                          account.Active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-zinc-200 bg-zinc-50 text-zinc-600"
                        }`}
                      >
                        {account.Active ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#69746f]">
                      {account.Id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-[#18211f]";

  return (
    <div className="rounded-lg border border-[#dfe5dc] bg-white p-4">
      <div className="text-xs font-medium uppercase text-[#69746f]">{label}</div>
      <div className={`mt-3 text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
