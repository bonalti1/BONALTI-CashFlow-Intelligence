import Link from "next/link";
import Image from "next/image";
import {
  Brain,
  ClipboardList,
  Database,
  HandCoins,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";

import { saveHouseDetailsAction } from "@/app/actions/house-details";
import { getHouseDetailsMap } from "@/lib/houses/house-details-store";
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName } from "@/lib/qbo/bank-account-map";
import { PhaseBudgetCalculator } from "./phase-budget-calculator";

export const dynamic = "force-dynamic";

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
                Project Health Agent
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            <NavItem href="/" icon={LayoutDashboard} label="Portfolio" />
            <NavItem active icon={ClipboardList} label="House Setup" />
            <NavItem href="/payees" icon={HandCoins} label="Payees" />
            <NavItem href="/agent-health" icon={Brain} label="Intelligent Center" />
            <NavItem href="/company-brain" icon={Database} label="Company Brain" />
            <NavItem href="/setup" icon={ShieldCheck} label="Setup" />
          </nav>
        </aside>

        <section className="min-w-0 px-6 py-5">
          <header className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="brand-kicker text-xs font-bold uppercase text-[#ff332b]">
                How to set up inputs
              </p>
              <h1 className="mt-1 text-3xl font-semibold text-[#121d49]">
                House Setup Inputs
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f6b66]">
                Add the sale price, square footage, and city for each house. These are saved only
                in this dashboard database. QuickBooks stays read-only.
              </p>
            </div>
            <div className="rounded-lg border border-[#121d49] bg-[#121d49] px-4 py-3 text-sm text-white">
              <div className="brand-kicker text-[10px] uppercase text-white/70">
                Ready for budget math
              </div>
              <div className="mt-1 text-2xl font-semibold text-white">
                {completed}/{houses.length}
              </div>
            </div>
          </header>

          <section className="mb-5 overflow-hidden rounded-lg border border-[#121d49] bg-white">
            <div className="border-b border-[#121d49] bg-[#121d49] px-4 py-4 text-white">
              <h2 className="text-lg font-semibold">Inputs By House</h2>
              <p className="mt-1 text-xs text-white/75">
                Once these are filled in, the app can calculate price per sqft and budget percent
                against the sold price.
              </p>
            </div>
            <div className="grid max-h-[620px] grid-cols-2 gap-3 overflow-auto bg-[#fbfaf7] p-4">
              {houses.map((house) => (
                <form
                  action={saveHouseDetailsAction}
                  className="rounded-lg border border-[#d9dee9] bg-white p-3 shadow-sm"
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
                        className="mt-1 h-9 w-full rounded-md border border-[#c8cfde] bg-white px-2 text-sm text-[#121a36]"
                        defaultValue={house.soldPrice ?? ""}
                        inputMode="decimal"
                        name="soldPrice"
                        placeholder="250000"
                      />
                    </label>
                    <label className="text-xs text-[#69746f]">
                      Sq Ft
                      <input
                        className="mt-1 h-9 w-full rounded-md border border-[#c8cfde] bg-white px-2 text-sm text-[#121a36]"
                        defaultValue={house.squareFootage ?? ""}
                        inputMode="numeric"
                        name="squareFootage"
                        placeholder="2180"
                      />
                    </label>
                    <label className="text-xs text-[#69746f]">
                      City
                      <input
                        className="mt-1 h-9 w-full rounded-md border border-[#c8cfde] bg-white px-2 text-sm text-[#121a36]"
                        defaultValue={house.city ?? ""}
                        name="city"
                        placeholder="Laredo"
                      />
                    </label>
                    <button
                      className="mt-5 h-9 rounded-md bg-[#ff332b] px-3 text-sm font-bold text-white"
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

          <PhaseBudgetCalculator />
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
