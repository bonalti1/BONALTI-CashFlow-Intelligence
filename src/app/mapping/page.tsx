import Link from "next/link";

import { classifyAccounts, summarizeClassifications } from "@/lib/qbo/account-classifier";
import { getAccountsSnapshot } from "@/lib/qbo/accounts-store";

export const dynamic = "force-dynamic";

const roleLabels = {
  house_bank_candidate: "House bank candidates",
  construction_cost_candidate: "Construction cost candidates",
  job_site_overhead_candidate: "Job site overhead candidates",
  non_project_account: "Non-project accounts",
  needs_review: "Needs review",
};

const roleStyles = {
  house_bank_candidate: "border-emerald-200 bg-emerald-50 text-emerald-700",
  construction_cost_candidate: "border-blue-200 bg-blue-50 text-blue-700",
  job_site_overhead_candidate: "border-amber-200 bg-amber-50 text-amber-700",
  non_project_account: "border-zinc-200 bg-zinc-50 text-zinc-600",
  needs_review: "border-red-200 bg-red-50 text-red-700",
};

export default async function MappingPage() {
  const snapshot = await getAccountsSnapshot().catch(() => null);
  const classifications = classifyAccounts(snapshot?.accounts ?? []);
  const summary = summarizeClassifications(classifications);
  const grouped = Object.keys(roleLabels).map((role) => ({
    role: role as keyof typeof roleLabels,
    accounts: classifications.filter((item) => item.role === role),
  }));

  return (
    <main className="min-h-screen bg-[#f7f8f5] px-6 py-6 text-[#18211f]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-[#69746f]">
              Temporary workaround
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Account Mapping</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f6b66]">
              Until QuickBooks is cleaned up, this page gives the app a practical
              read-only way to separate possible house accounts, construction costs,
              overhead, and accounts we should ignore.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              className="rounded-md border border-[#ccd6cf] bg-white px-3 py-2 text-sm font-medium"
              href="/chart-of-accounts"
            >
              Chart of Accounts
            </Link>
            <Link
              className="rounded-md border border-[#ccd6cf] bg-white px-3 py-2 text-sm font-medium"
              href="/"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <section className="mb-5 grid grid-cols-5 gap-3">
          {(Object.keys(roleLabels) as Array<keyof typeof roleLabels>).map((role) => (
            <div className="rounded-lg border border-[#dfe5dc] bg-white p-4" key={role}>
              <div className="text-xs font-medium uppercase text-[#69746f]">
                {roleLabels[role]}
              </div>
              <div className="mt-3 text-2xl font-semibold">{summary[role]}</div>
            </div>
          ))}
        </section>

        <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">How This Helps Now</h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            This does not change QuickBooks. It gives us a temporary lens so we can
            keep building the substrate. Later, after you clean up the Chart of
            Accounts, these guesses should become real synced phase and line-item
            mappings.
          </p>
        </section>

        <div className="space-y-5">
          {grouped.map((group) => (
            <section
              className="rounded-lg border border-[#dfe5dc] bg-white"
              key={group.role}
            >
              <div className="flex items-center justify-between border-b border-[#e6ebe3] px-4 py-3">
                <h2 className="text-sm font-semibold">{roleLabels[group.role]}</h2>
                <span
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${roleStyles[group.role]}`}
                >
                  {group.accounts.length}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead className="bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Account</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Confidence</th>
                      <th className="px-4 py-3 font-medium">Why</th>
                      <th className="px-4 py-3 font-medium">QB ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.accounts.map((item) => (
                      <tr className="border-t border-[#edf0eb]" key={item.account.Id}>
                        <td className="px-4 py-3 font-medium">
                          {item.account.FullyQualifiedName ?? item.account.Name}
                        </td>
                        <td className="px-4 py-3 text-[#5f6b66]">
                          {item.account.AccountType ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-md border border-[#dfe5dc] bg-[#fbfcfa] px-2 py-1 text-xs font-medium text-[#4f5b56]">
                            {item.confidence}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#5f6b66]">{item.reason}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[#69746f]">
                          {item.account.Id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
