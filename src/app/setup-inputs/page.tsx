import Link from "next/link";
import {
  ClipboardList,
  LayoutDashboard,
  NotebookText,
  ShieldCheck,
} from "lucide-react";

import { saveHouseDetailsAction } from "@/app/actions/house-details";
import { getHouseDetailsMap } from "@/lib/houses/house-details-store";
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName } from "@/lib/qbo/bank-account-map";

export const dynamic = "force-dynamic";

const phaseOneBudget = [
  { item: "Fill Dirt", vendor: "LEAL", percent: 0.0075 },
  { item: "Plumbing Rough-in", vendor: "STX Plumbing", percent: 0.01278 },
  { item: "Pre-form Survey", vendor: "RC Consulting", percent: 0.0022 },
  { item: "Termite Treatment", vendor: "Joseph Tex Guard", percent: 0.0011 },
  { item: "Foundation Rebar Materials", vendor: "Rio Grande Steel", percent: 0.018 },
  { item: "Foundation Concrete Materials", vendor: "VMK", percent: 0.0444 },
  { item: "Foundation Labor", vendor: "Edgar / Elite", percent: 0.0218 },
];

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function percent(value: number) {
  return `${(value * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

function accountName(account: QboAccount) {
  return account.FullyQualifiedName ?? account.Name;
}

function bankBalance(account: QboAccount) {
  return account.CurrentBalance ?? 0;
}

export default async function SetupInputsPage() {
  const [snapshot, detailsByBankAccount] = await Promise.all([
    getAccountsSnapshot().catch(() => null),
    getHouseDetailsMap(),
  ]);
  const bankAccounts = snapshot?.accounts.filter((account) => account.AccountType === "Bank") ?? [];
  const houses = bankAccounts
    .map((account) => {
      const house = getConfirmedHouseName(account);

      if (!house) {
        return null;
      }

      const details = detailsByBankAccount.get(account.Id);

      return {
        id: account.Id,
        house,
        bank: accountName(account),
        balance: bankBalance(account),
        soldPrice: details?.soldPrice ?? null,
        squareFootage: details?.squareFootage ?? null,
        city: details?.city ?? null,
        setupComplete: Boolean(details?.soldPrice && details?.squareFootage && details?.city),
      };
    })
    .filter((house): house is NonNullable<typeof house> => Boolean(house))
    .sort((a, b) => a.house.localeCompare(b.house));
  const completed = houses.filter((house) => house.setupComplete).length;
  const phaseOneTotalPercent = phaseOneBudget.reduce((total, line) => total + line.percent, 0);
  const exampleSoldPrice = 250_000;

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-[#18211f]">
      <div className="grid min-h-screen grid-cols-[248px_1fr]">
        <aside className="border-r border-[#dfe5dc] bg-white px-5 py-5">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-[#20745f] text-sm font-bold text-white">
              STB
            </div>
            <div>
              <div className="text-sm font-semibold">South Texas Builders</div>
              <div className="text-xs text-[#69746f]">Project Health Agent</div>
            </div>
          </div>

          <nav className="space-y-1">
            <NavItem href="/" icon={LayoutDashboard} label="Portfolio" />
            <NavItem active icon={ClipboardList} label="Edit Price & Square Foot" />
            <NavItem href="/agent-health" icon={NotebookText} label="Agent Health Notes" />
            <NavItem href="/setup" icon={ShieldCheck} label="Setup" />
          </nav>
        </aside>

        <section className="min-w-0 px-6 py-5">
          <header className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase text-[#69746f]">
                How to set up inputs
              </p>
              <h1 className="mt-1 text-2xl font-semibold">House Setup Inputs</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f6b66]">
                Add the sale price, square footage, and city for each house. These are saved only
                in this dashboard database. QuickBooks stays read-only.
              </p>
            </div>
            <div className="rounded-lg border border-[#dfe5dc] bg-white px-4 py-3 text-sm">
              <div className="text-xs uppercase text-[#69746f]">Ready for budget math</div>
              <div className="mt-1 text-2xl font-semibold">
                {completed}/{houses.length}
              </div>
            </div>
          </header>

          <section className="mb-5 rounded-lg border border-[#dfe5dc] bg-white">
            <div className="border-b border-[#e6ebe3] px-4 py-3">
              <h2 className="text-sm font-semibold">Inputs By House</h2>
              <p className="mt-1 text-xs text-[#69746f]">
                Once these are filled in, the app can calculate price per sqft and budget percent
                against the sold price.
              </p>
            </div>
            <div className="grid max-h-[620px] grid-cols-2 gap-3 overflow-auto p-4">
              {houses.map((house) => (
                <form
                  action={saveHouseDetailsAction}
                  className="rounded-lg border border-[#edf0eb] bg-[#fbfcfa] p-3"
                  key={house.id}
                >
                  <input name="qboBankAccountId" type="hidden" value={house.id} />
                  <input name="houseName" type="hidden" value={house.house} />
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{house.house}</div>
                      <div className="mt-1 text-xs text-[#69746f]">
                        {house.bank} · QB balance {currency(house.balance)}
                      </div>
                    </div>
                    <span
                      className={`rounded-md border px-2 py-1 text-xs ${
                        house.setupComplete
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {house.setupComplete ? "Ready" : "Missing setup"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_112px_112px_auto] gap-2">
                    <label className="text-xs text-[#69746f]">
                      Sold Price
                      <input
                        className="mt-1 h-9 w-full rounded-md border border-[#ccd6cf] bg-white px-2 text-sm text-[#18211f]"
                        defaultValue={house.soldPrice ?? ""}
                        inputMode="decimal"
                        name="soldPrice"
                        placeholder="250000"
                      />
                    </label>
                    <label className="text-xs text-[#69746f]">
                      Sq Ft
                      <input
                        className="mt-1 h-9 w-full rounded-md border border-[#ccd6cf] bg-white px-2 text-sm text-[#18211f]"
                        defaultValue={house.squareFootage ?? ""}
                        inputMode="numeric"
                        name="squareFootage"
                        placeholder="2180"
                      />
                    </label>
                    <label className="text-xs text-[#69746f]">
                      City
                      <input
                        className="mt-1 h-9 w-full rounded-md border border-[#ccd6cf] bg-white px-2 text-sm text-[#18211f]"
                        defaultValue={house.city ?? ""}
                        name="city"
                        placeholder="Laredo"
                      />
                    </label>
                    <button
                      className="mt-5 h-9 rounded-md bg-[#20745f] px-3 text-sm font-medium text-white"
                      type="submit"
                    >
                      Save
                    </button>
                  </div>
                  <div className="mt-3 text-xs text-[#69746f]">
                    {house.soldPrice && house.squareFootage
                      ? `Sale price per sqft: ${currency(house.soldPrice / house.squareFootage)}`
                      : "Enter sold price and square footage to calculate price per sqft."}
                  </div>
                </form>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-[#dfe5dc] bg-white">
            <div className="border-b border-[#e6ebe3] px-4 py-3">
              <h2 className="text-sm font-semibold">Phase 1 Budget Example</h2>
              <p className="mt-1 text-xs text-[#69746f]">
                Example based on a {currency(exampleSoldPrice)} sold price. This is the model we
                will repeat for Pre Phase and Phases 1 through 6.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="bg-[#fbfcfa] text-left text-xs uppercase text-[#69746f]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Line Item</th>
                    <th className="px-4 py-3 font-medium">Vendor</th>
                    <th className="px-4 py-3 font-medium">Budget %</th>
                    <th className="px-4 py-3 font-medium">Budget $</th>
                  </tr>
                </thead>
                <tbody>
                  {phaseOneBudget.map((line) => (
                    <tr className="border-t border-[#edf0eb]" key={line.item}>
                      <td className="px-4 py-3 font-medium">{line.item}</td>
                      <td className="px-4 py-3 text-[#4f5b56]">{line.vendor}</td>
                      <td className="px-4 py-3 text-[#4f5b56]">{percent(line.percent)}</td>
                      <td className="px-4 py-3 font-semibold">
                        {currency(exampleSoldPrice * line.percent)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-[#dfe5dc] bg-[#fbfcfa]">
                    <td className="px-4 py-3 font-semibold" colSpan={2}>
                      Phase 1 Total
                    </td>
                    <td className="px-4 py-3 font-semibold">{percent(phaseOneTotalPercent)}</td>
                    <td className="px-4 py-3 font-semibold">
                      {currency(exampleSoldPrice * phaseOneTotalPercent)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
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
      ? "bg-[#e7f1ec] font-medium text-[#174f42]"
      : "text-[#5f6b66] hover:bg-[#f1f4ef]"
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
