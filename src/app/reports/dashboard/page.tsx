import Image from "next/image";
import Link from "next/link";

import { PrintReportButton } from "@/app/reports/dashboard/print-button";
import {
  drawPhaseKeys,
  getDrawLineItemStatuses,
  getHousePhaseActuals,
  getPhaseLineItemActuals,
  getPhaseLineItemsByPhase,
  type DrawLineItemRecord,
  type DrawPhaseKey,
  type HousePhaseActual,
  type PhaseLineItem,
  type PhaseLineItemActual,
} from "@/lib/draws/draws-store";
import { getHouseDetailsMap } from "@/lib/houses/house-details-store";
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName } from "@/lib/qbo/bank-account-map";
import {
  getSchedulingDashboardMaps,
  getSchedulingProjectVisualList,
  type SchedulingProjectVisual,
} from "@/lib/scheduling/status-store";

export const dynamic = "force-dynamic";

type DashboardReportPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ReportLineItem = {
  id: string;
  name: string;
  spent: number;
  transactions: number;
  payees: string[];
  lastTxnDate: string | null;
  draw: DrawLineItemRecord | null;
};

type ReportPhase = {
  key: DrawPhaseKey;
  label: string;
  name: string;
  spent: number;
  budget: number | null;
  status: string;
  transactionCount: number;
  lineItems: ReportLineItem[];
};

type ReportHouse = {
  id: string;
  house: string;
  bank: string;
  city: string | null;
  soldPrice: number | null;
  squareFootage: number | null;
  totalSpent: number;
  currentPhase: string;
  completed: boolean;
  renderImageUrl: string | null;
  phases: ReportPhase[];
};

const phaseLabels: Record<DrawPhaseKey, { label: string; name: string }> = {
  pre: { label: "Pre", name: "Pre Phase" },
  p1: { label: "P1", name: "Foundation" },
  p2: { label: "P2", name: "Framing / Dry-in" },
  p3: { label: "P3", name: "Rough Trades" },
  p4: { label: "P4", name: "Exterior / Floors" },
  p5: { label: "P5", name: "Interior" },
  p6: { label: "P6", name: "Final" },
};

const demoHouses = [
  { house: "Cepeda", city: "Alice", soldPrice: 429900, squareFootage: 3391, phaseIndex: 4, review: true },
  { house: "Charles", city: "Alice", soldPrice: 200000, squareFootage: 2000, phaseIndex: 1, review: false },
  { house: "Chavez", city: "Alice", soldPrice: 265000, squareFootage: 2300, phaseIndex: 4, review: true },
  { house: "Delgadillo", city: "Alice", soldPrice: 275000, squareFootage: 2380, phaseIndex: 2, review: false },
  { house: "Gomez", city: "McAllen", soldPrice: 200000, squareFootage: 2180, phaseIndex: 6, review: true },
  { house: "Gonzalez", city: "Alice", soldPrice: 255000, squareFootage: 2225, phaseIndex: 2, review: false },
  { house: "HUNN", city: "Alice", soldPrice: 410000, squareFootage: 3150, phaseIndex: 5, review: true },
  { house: "Lot 6", city: "Alice", soldPrice: 319000, squareFootage: 2891, phaseIndex: 5, review: false },
  { house: "Pulido", city: "Alice", soldPrice: 295000, squareFootage: 2510, phaseIndex: 5, review: false },
  { house: "Ruvalcaba", city: "Alice", soldPrice: 245000, squareFootage: 2110, phaseIndex: 2, review: false },
  { house: "Valerio", city: "Alice", soldPrice: 264500, squareFootage: 2300, phaseIndex: 2, review: false },
  { house: "Vazquez", city: "Alice", soldPrice: 319000, squareFootage: 2891, phaseIndex: 1, review: false },
] as const;

function withReportTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 800) {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => {
      resolve(fallback);
    }, timeoutMs);

    promise
      .then((result) => {
        resolve(result);
      })
      .catch(() => {
        resolve(fallback);
      })
      .finally(() => {
        clearTimeout(timer);
      });
  });
}

function currency(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Pending";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Pending";
  }

  return `${Math.round(value)}%`;
}

function shortDate(value: string | null | undefined) {
  if (!value) {
    return "Not marked";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function accountName(account: QboAccount) {
  return account.FullyQualifiedName ?? account.Name;
}

function currentPhaseFor(phases: ReportPhase[]) {
  const active = phases.filter((phase) => phase.transactionCount > 0);

  return active.at(-1)?.label ?? "Pre";
}

function projectSortNumber(houseName: string) {
  const match = houseName.match(/\((\d+)\)|\b(\d{2,})\b/);

  return match ? Number(match[1] ?? match[2]) : Number.POSITIVE_INFINITY;
}

function sortByProjectNumber(a: ReportHouse, b: ReportHouse) {
  const numberA = projectSortNumber(a.house);
  const numberB = projectSortNumber(b.house);

  if (numberA !== numberB) {
    return numberA - numberB;
  }

  return a.house.localeCompare(b.house);
}

function statusFor(actual: HousePhaseActual | null) {
  if (!actual || actual.transactionCount === 0) {
    return "Open";
  }

  if (actual.status === "over_budget") {
    return "Review";
  }

  return "On Budget";
}

function phasePercent(house: ReportHouse, phase: ReportPhase) {
  if (!house.soldPrice || house.soldPrice <= 0) {
    return null;
  }

  return (phase.spent / house.soldPrice) * 100;
}

function phaseCostPerSqft(house: ReportHouse, phase: ReportPhase) {
  if (!house.squareFootage || house.squareFootage <= 0) {
    return null;
  }

  return phase.spent / house.squareFootage;
}

function lineItemRows(
  accountId: string,
  houseName: string,
  phaseKey: DrawPhaseKey,
  phaseLineItems: PhaseLineItem[],
  phaseLineItemActuals: Map<string, PhaseLineItemActual>,
  drawLineItemStatuses: Map<string, DrawLineItemRecord>,
) {
  return phaseLineItems.map((item) => {
    const actual = phaseLineItemActuals.get(`${accountId}:${phaseKey}:${item.qboAccountId}`) ?? null;
    const draw = drawLineItemStatuses.get(`${accountId}:${phaseKey}:${item.qboAccountId}`) ?? null;

    return {
      id: item.qboAccountId,
      name: item.lineItemName,
      spent: actual?.spentAmount ?? 0,
      transactions: actual?.transactionCount ?? 0,
      payees: actual?.payeeNames ?? [],
      lastTxnDate: actual?.lastTxnDate ?? null,
      draw,
    };
  }).sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));
}

function buildDemoReportHouses(): ReportHouse[] {
  const budgetPercentages: Record<DrawPhaseKey, number> = {
    pre: 0.02,
    p1: 0.1077,
    p2: 0.125,
    p3: 0.115,
    p4: 0.11,
    p5: 0.12,
    p6: 0.055,
  };

  return demoHouses.map((house) => {
    const phases = drawPhaseKeys.map((key, index) => {
      const hasPhase = index <= house.phaseIndex;
      const overBudget = house.review && index === house.phaseIndex;
      const budget = Math.round(house.soldPrice * budgetPercentages[key]);
      const spent = hasPhase ? Math.round(budget * (overBudget ? 1.12 : 0.88 + index * 0.015)) : 0;

      return {
        key,
        label: phaseLabels[key].label,
        name: phaseLabels[key].name,
        spent,
        budget,
        status: overBudget ? "Review" : hasPhase ? "On Budget" : "Open",
        transactionCount: hasPhase ? Math.max(1, 3 + index) : 0,
        lineItems: [
          {
            id: `${house.house}-${key}-draw`,
            name: `${phaseLabels[key].name} Draw Item`,
            spent,
            transactions: hasPhase ? Math.max(1, 3 + index) : 0,
            payees: hasPhase ? ["QuickBooks payees"] : [],
            lastTxnDate: hasPhase ? new Date().toISOString() : null,
            draw: null,
          },
        ],
      };
    });
    const totalSpent = phases.reduce((total, phase) => total + phase.spent, 0);

    return {
      id: `demo-${house.house}`,
      house: house.house,
      bank: `${house.house} demo bank account`,
      city: house.city,
      soldPrice: house.soldPrice,
      squareFootage: house.squareFootage,
      totalSpent,
      currentPhase: phaseLabels[drawPhaseKeys[house.phaseIndex]].label,
      completed: house.phaseIndex >= drawPhaseKeys.length - 1,
      renderImageUrl: null,
      phases,
    };
  }).sort((a, b) => a.house.localeCompare(b.house));
}

function buildSchedulingReportHouses(projects: SchedulingProjectVisual[]): ReportHouse[] {
  if (projects.length === 0) {
    return buildDemoReportHouses();
  }

  return projects
    .map((project, index): ReportHouse => {
      const phases = drawPhaseKeys.map((key) => ({
        key,
        label: phaseLabels[key].label,
        name: phaseLabels[key].name,
        spent: 0,
        budget: null,
        status: "Open",
        transactionCount: 0,
        lineItems: [],
      }));

      return {
        id: project.projectId ?? `scheduling-${index}-${project.projectName}`,
        house: project.projectName,
        bank: `${project.projectName} scheduling project`,
        city: null,
        soldPrice: null,
        squareFootage: null,
        totalSpent: 0,
        currentPhase: "Pre",
        completed: false,
        renderImageUrl: project.renderImage,
        phases,
      };
    })
    .sort((a, b) => sortByProjectNumber(a, b));
}

async function getReportHouses() {
  const schedulingProjectsPromise = withReportTimeout(getSchedulingProjectVisualList(), [], 1000);
  const [
    snapshot,
    houseDetails,
    actualsByPhase,
    phaseLineItemsByPhase,
    phaseLineItemActuals,
    drawLineItemStatuses,
  ] = await Promise.all([
    withReportTimeout(getAccountsSnapshot(), null),
    withReportTimeout(getHouseDetailsMap(), new Map()),
    withReportTimeout(getHousePhaseActuals(), new Map()),
    withReportTimeout(getPhaseLineItemsByPhase(), new Map()),
    withReportTimeout(getPhaseLineItemActuals(), new Map()),
    withReportTimeout(getDrawLineItemStatuses(), new Map()),
  ]);
  const bankAccounts = snapshot?.accounts.filter((account) => account.AccountType === "Bank") ?? [];
  const houses = bankAccounts
    .map((account) => {
      const house = getConfirmedHouseName(account);

      if (!house) {
        return null;
      }

      const details = houseDetails.get(account.Id);
      const phases = drawPhaseKeys.map((key) => {
        const actual = actualsByPhase.get(`${account.Id}:${key}`) ?? null;
        const lineItems = lineItemRows(
          account.Id,
          house,
          key,
          phaseLineItemsByPhase.get(key) ?? [],
          phaseLineItemActuals,
          drawLineItemStatuses,
        );

        return {
          key,
          label: phaseLabels[key].label,
          name: actual?.phaseName ?? phaseLabels[key].name,
          spent: actual?.spentAmount ?? 0,
          budget: actual?.budgetAmount ?? null,
          status: statusFor(actual),
          transactionCount: actual?.transactionCount ?? 0,
          lineItems,
        };
      });
      const totalSpent = phases.reduce((total, phase) => total + phase.spent, 0);

      const contractSoldPrice = details?.currentContractPrice ?? details?.contractPrice ?? null;
      const sourceSoldPrice = contractSoldPrice ?? details?.soldPrice ?? null;
      const sourceSquareFootage = details?.contractSquareFootage ?? details?.squareFootage ?? null;
      const sourceCity = details?.contractCity ?? details?.city ?? null;

      return {
        id: account.Id,
        house,
        bank: accountName(account),
        city: sourceCity,
        soldPrice: sourceSoldPrice,
        squareFootage: sourceSquareFootage,
        totalSpent,
        currentPhase: currentPhaseFor(phases),
        completed: false,
        renderImageUrl: details?.manualRenderImageUrl ?? null,
        phases,
      };
    })
    .filter((house): house is ReportHouse => Boolean(house))
    .sort((a, b) => a.house.localeCompare(b.house));

  if (houses.length === 0) {
    const schedulingProjects = await schedulingProjectsPromise;
    const fallbackHouses = buildSchedulingReportHouses(schedulingProjects);

    return fallbackHouses;
  }

  const schedulingMaps = await withReportTimeout(getSchedulingDashboardMaps(houses.map((house) => ({ house: house.house }))), {
    completion: new Map(),
    statuses: new Map(),
    visuals: new Map(),
  }, 1500);

  return houses.map((house) => ({
    ...house,
    completed:
      schedulingMaps.completion.get(house.house)?.completed ??
      Boolean(house.phases.find((phase) => phase.key === "p6" && phase.transactionCount > 0)),
    renderImageUrl: house.renderImageUrl ?? schedulingMaps.visuals.get(house.house)?.renderImage ?? null,
  }));
}

export default async function DashboardReportPage({ searchParams }: DashboardReportPageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedHouseId = typeof params.house === "string" ? params.house : null;
  const houses = await getReportHouses();
  const selectedHouse = selectedHouseId
    ? houses.find((house) => house.id === selectedHouseId || house.house === selectedHouseId)
    : null;
  const activeHouses = houses.filter((house) => !house.completed).sort(sortByProjectNumber);
  const completedHouses = houses.filter((house) => house.completed).sort(sortByProjectNumber);
  const generatedAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <main className="min-h-screen bg-[#f2f1ea] px-6 py-5 text-[#1b2233] [background-image:linear-gradient(rgba(22,41,77,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(22,41,77,0.055)_1px,transparent_1px)] [background-size:34px_34px] [font-family:Barlow,system-ui,sans-serif]">
      <div className="no-print mx-auto mb-4 flex max-w-[1180px] flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex h-11 items-center rounded-[9px] border border-[#d8d5ca] bg-white px-4 text-sm font-extrabold text-[#16294d]"
            href="/draws-budget"
          >
            Back to Dashboard
          </Link>
          <Link
            className="inline-flex h-11 items-center rounded-[9px] border border-[#d8d5ca] bg-white px-4 text-sm font-extrabold text-[#16294d]"
            href="/reports/dashboard"
          >
            General Report
          </Link>
        </div>
        <PrintReportButton />
      </div>

      <details className="no-print mx-auto mb-4 max-w-[1180px] rounded-[12px] border border-[#e3e1d7] bg-white p-3" open>
        <summary className="cursor-pointer list-none text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#16294d]">
          Report menu
        </summary>
        <div className="mt-3">
          <div className="rounded-[10px] border border-[#e3e1d7] bg-[#fbfaf7] p-3">
            <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#e23b2a]">
                  General report
                </p>
                <p className="mt-1 text-sm font-bold text-[#7b8298]">
                  One-page snapshot of all active and completed houses.
                </p>
                <Link
                  className="mt-3 inline-flex h-10 items-center rounded-[8px] border border-[#16294d] bg-[#16294d] px-3 text-xs font-extrabold text-white"
                  href="/reports/dashboard"
                >
                  Open House Dashboard
                </Link>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <HouseReportSelect
                  houses={activeHouses}
                  label="Active projects"
                  selectedHouseId={selectedHouse?.id ?? ""}
                />
                <HouseReportSelect
                  houses={completedHouses}
                  label="Completed projects"
                  selectedHouseId={selectedHouse?.id ?? ""}
                />
              </div>
            </div>
          </div>
        </div>
      </details>

      <section className="print-area mx-auto max-w-[1180px] rounded-[14px] border border-[#e3e1d7] bg-white p-5 shadow-[0_8px_24px_-18px_rgba(14,27,54,0.45)]">
        <ReportHeader
          generatedAt={generatedAt}
          title={selectedHouse ? `${selectedHouse.house} Full Breakdown` : "Dashboard Snapshot"}
        />
        {selectedHouse ? (
          <HouseDetailReport house={selectedHouse} />
        ) : (
          <DashboardSnapshot houses={houses} />
        )}
      </section>
    </main>
  );
}

function HouseReportSelect({
  houses,
  label,
  selectedHouseId,
}: {
  houses: ReportHouse[];
  label: string;
  selectedHouseId: string;
}) {
  return (
    <form action="/reports/dashboard" className="flex flex-wrap items-end gap-2" method="get">
      <label className="min-w-[240px] flex-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#7b8298]">
        {label}
        <select
          className="mt-1 h-10 w-full rounded-[8px] border border-[#d8d5ca] bg-white px-3 text-sm font-extrabold normal-case tracking-normal text-[#16294d]"
          defaultValue={houses.some((house) => house.id === selectedHouseId) ? selectedHouseId : ""}
          name="house"
        >
          <option value="" disabled>
            Choose a project
          </option>
          {houses.map((house, index) => {
            const projectNumber = projectSortNumber(house.house);
            const prefix = Number.isFinite(projectNumber)
              ? String(projectNumber).padStart(3, "0")
              : String(index + 1).padStart(2, "0");

            return (
              <option key={house.id} value={house.id}>
                {prefix} - {house.house}
              </option>
            );
          })}
        </select>
      </label>
      <button
        className="h-10 rounded-[8px] bg-[#16294d] px-4 text-xs font-extrabold uppercase tracking-[0.08em] text-white disabled:opacity-50"
        disabled={houses.length === 0}
      >
        Open
      </button>
    </form>
  );
}

function ReportHeader({ generatedAt, title }: { generatedAt: string; title: string }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-[#e3e1d7] pb-5">
      <div className="flex items-center gap-4">
        <div className="grid h-[74px] w-[86px] place-items-center rounded-[10px] border border-[#e3e1d7] bg-white">
          <Image
            alt="South Texas Builders"
            className="h-auto w-[58px]"
            height={1080}
            src="/south-texas-builders-logo.png"
            width={1080}
          />
        </div>
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#e23b2a]">
            South Texas Builders
          </p>
          <h1 className="font-['Barlow_Condensed',Barlow,sans-serif] text-[34px] font-bold uppercase leading-none text-[#16294d]">
            {title}
          </h1>
          <p className="mt-2 text-sm font-bold text-[#7b8298]">Generated {generatedAt}</p>
        </div>
      </div>
      <div className="rounded-[10px] border border-[#d8d5ca] px-4 py-3 text-right">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#7b8298]">
          Report Source
        </p>
        <p className="mt-1 text-sm font-extrabold text-[#16294d]">
          QuickBooks + Scheduling + House Inputs
        </p>
      </div>
    </header>
  );
}

function DashboardSnapshot({ houses }: { houses: ReportHouse[] }) {
  const activeHouses = houses.filter((house) => !house.completed);
  const completedHouses = houses.filter((house) => house.completed);
  const totalSold = houses.reduce((total, house) => total + (house.soldPrice ?? 0), 0);
  const totalSpent = houses.reduce((total, house) => total + house.totalSpent, 0);
  const reviewCount = houses.filter((house) =>
    house.phases.some((phase) => phase.status === "Review"),
  ).length;

  return (
    <>
      <section className="mt-4 grid gap-2 md:grid-cols-5">
        <ReportMetric label="Active Houses" value={String(activeHouses.length)} />
        <ReportMetric label="Completed" value={String(completedHouses.length)} />
        <ReportMetric label="Sold Volume" value={currency(totalSold)} />
        <ReportMetric label="Spent So Far" value={currency(totalSpent)} />
        <ReportMetric label="Needs Review" value={String(reviewCount)} tone="red" />
      </section>

      <HouseCardGrid houses={activeHouses} title="Active Houses" />
      <HouseCardGrid houses={completedHouses} title="Completed Houses" />
    </>
  );
}

function HouseCardGrid({ houses, title }: { houses: ReportHouse[]; title: string }) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="font-['Barlow_Condensed',Barlow,sans-serif] text-2xl font-bold uppercase text-[#16294d]">
          {title}
        </h2>
        <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#7b8298]">
          {houses.length} houses
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {houses.map((house) => (
          <DashboardHouseCard house={house} key={house.id} />
        ))}
      </div>
    </section>
  );
}

function DashboardHouseCard({ house }: { house: ReportHouse }) {
  const soldPerSqft =
    house.soldPrice && house.squareFootage ? house.soldPrice / house.squareFootage : null;
  const spentPercent =
    house.soldPrice && house.soldPrice > 0 ? (house.totalSpent / house.soldPrice) * 100 : null;
  const spentPerSqft =
    house.squareFootage && house.squareFootage > 0 ? house.totalSpent / house.squareFootage : null;
  const remaining =
    house.soldPrice === null || house.soldPrice === undefined ? null : house.soldPrice - house.totalSpent;

  return (
    <article className="break-inside-avoid rounded-[12px] border border-[#e3e1d7] bg-white p-4 shadow-[0_8px_20px_-22px_rgba(14,27,54,0.55)]">
      <div className="grid gap-3 sm:grid-cols-[170px_1fr]">
        <HouseRenderFrame house={house} />
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-extrabold text-[#16294d]">{house.house}</h3>
                <span className="rounded-[7px] bg-[#eaf2ff] px-2 py-1 text-[11px] font-extrabold text-[#16294d]">
                  {house.currentPhase}
                </span>
              </div>
              <p className="mt-1 text-xs font-bold text-[#7b8298]">
                {house.city ?? "City missing"} · {house.squareFootage?.toLocaleString() ?? "Sqft missing"} sqft
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <SmallMetric
              detail={soldPerSqft ? `${currency(soldPerSqft)} / sold sqft` : "Sold sqft pending"}
              label="House Sold"
              value={currency(house.soldPrice)}
            />
            <SmallMetric
              detail={[
                percent(spentPercent),
                spentPerSqft ? `${currency(spentPerSqft)} / sqft` : null,
              ].filter(Boolean).join(" · ")}
              label="Project Spent"
              value={currency(house.totalSpent)}
            />
            <SmallMetric
              detail="After current spend"
              label="Remaining"
              value={currency(remaining)}
            />
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {house.phases.map((phase) => (
              <span
                className={`grid min-h-10 place-items-center rounded-[7px] border px-1 text-center text-[10px] font-extrabold ${
                  phase.status === "Review"
                    ? "border-[#ffc7bf] bg-[#fdebea] text-[#9d251c]"
                    : phase.transactionCount > 0
                      ? "border-[#b9dec9] bg-[#eaf7f0] text-[#1f6f4b]"
                      : "border-[#e3e1d7] bg-[#fbfaf7] text-[#7b8298]"
                }`}
                key={phase.key}
              >
                {phase.label}
                <span className="block text-[9px]">{currency(phase.spent)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function HouseRenderFrame({ house }: { house: ReportHouse }) {
  return (
    <div className="grid min-h-[132px] place-items-center overflow-hidden rounded-[10px] border border-[#e3e1d7] bg-[#fbfaf7]">
      {house.renderImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={`${house.house} render`}
          className="h-full max-h-[170px] w-full object-contain object-center p-2"
          data-report-render="true"
          decoding="async"
          fetchPriority="low"
          loading="lazy"
          src={house.renderImageUrl}
        />
      ) : (
        <div className="grid h-full min-h-[132px] w-full place-items-center p-3 text-center">
          <Image
            alt="South Texas Builders"
            className="h-auto w-[70px] opacity-80"
            height={1080}
            src="/south-texas-builders-logo.png"
            width={1080}
          />
        </div>
      )}
    </div>
  );
}

function HouseDetailReport({ house }: { house: ReportHouse }) {
  const spentPercent =
    house.soldPrice && house.soldPrice > 0 ? (house.totalSpent / house.soldPrice) * 100 : null;
  const spentPerSqft =
    house.squareFootage && house.squareFootage > 0 ? house.totalSpent / house.squareFootage : null;

  return (
    <>
      <section className="mt-5 grid gap-4 md:grid-cols-[300px_1fr]">
        <HouseRenderFrame house={house} />
        <div className="rounded-[12px] border border-[#e3e1d7] bg-[#fbfaf7] p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#e23b2a]">
            House report
          </p>
          <h2 className="mt-1 text-2xl font-extrabold text-[#16294d]">{house.house}</h2>
          <p className="mt-1 text-sm font-bold text-[#7b8298]">
            {house.city ?? "City missing"} · Current phase {house.currentPhase}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
          <ReportMetric label="House Sold" value={currency(house.soldPrice)} />
          <ReportMetric label="Spent So Far" value={currency(house.totalSpent)} />
          <ReportMetric label="% Spent" value={percent(spentPercent)} />
          <ReportMetric label="Sqft" value={house.squareFootage?.toLocaleString() ?? "Pending"} />
          <ReportMetric label="Spent / Sqft" value={spentPerSqft ? currency(spentPerSqft) : "Pending"} />
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-3 md:grid-cols-7">
        {house.phases.map((phase) => (
          <div
            className={`break-inside-avoid rounded-[11px] border p-3 ${
              phase.status === "Review"
                ? "border-[#ffc7bf] bg-[#fff8f7]"
                : phase.transactionCount > 0
                  ? "border-[#b9dec9] bg-[#fbfffd]"
                  : "border-[#e3e1d7] bg-white"
            }`}
            key={phase.key}
          >
            <p className="font-['Barlow_Condensed',Barlow,sans-serif] text-xl font-bold uppercase text-[#16294d]">
              {phase.label}
            </p>
            <p className="text-[11px] font-bold text-[#7b8298]">{phase.name}</p>
            <p className="mt-2 text-lg font-extrabold text-[#16294d]">{currency(phase.spent)}</p>
            <p className="text-[10px] font-bold text-[#7b8298]">
              Budget {currency(phase.budget)}
            </p>
            <p className="mt-1 text-[10px] font-bold text-[#7b8298]">
              {percent(phasePercent(house, phase))} sale ·{" "}
              {phaseCostPerSqft(house, phase) ? currency(phaseCostPerSqft(house, phase)) : "Pending"} / sqft
            </p>
          </div>
        ))}
      </section>

      {house.phases.map((phase) => (
        <PhaseBreakdown house={house} key={phase.key} phase={phase} />
      ))}
    </>
  );
}

function PhaseBreakdown({ house, phase }: { house: ReportHouse; phase: ReportPhase }) {
  return (
    <section className="print-phase-card mt-6 overflow-hidden rounded-[12px] border border-[#e3e1d7]">
      <div className="flex items-center justify-between gap-3 bg-[#fbfaf7] px-4 py-3">
        <div>
          <h2 className="font-['Barlow_Condensed',Barlow,sans-serif] text-2xl font-bold uppercase text-[#16294d]">
            {phase.label}: {phase.name}
          </h2>
          <p className="text-xs font-bold text-[#7b8298]">
            Spent {currency(phase.spent)} · Budget {currency(phase.budget)} ·{" "}
            {percent(phasePercent(house, phase))} of sale
          </p>
        </div>
        <span
          className={`rounded-[8px] border px-3 py-1 text-xs font-extrabold ${
            phase.status === "Review"
              ? "border-[#ffc7bf] bg-[#fdebea] text-[#9d251c]"
              : phase.transactionCount > 0
                ? "border-[#b9dec9] bg-[#eaf7f0] text-[#1f6f4b]"
                : "border-[#e3e1d7] bg-white text-[#7b8298]"
          }`}
        >
          {phase.status}
        </span>
      </div>

      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-white text-[10px] uppercase tracking-[0.12em] text-[#7b8298]">
          <tr className="border-t border-[#e3e1d7]">
            <th className="px-3 py-2">Line Item</th>
            <th className="px-3 py-2">Spent</th>
            <th className="px-3 py-2">Payees</th>
            <th className="px-3 py-2">QB Checks</th>
            <th className="px-3 py-2">Draw</th>
            <th className="px-3 py-2">Received</th>
          </tr>
        </thead>
        <tbody>
          {phase.lineItems.length === 0 ? (
            <tr className="border-t border-[#e3e1d7]">
              <td className="px-3 py-3 text-sm font-bold text-[#7b8298]" colSpan={6}>
                No Chart of Accounts line items are mapped to this phase yet.
              </td>
            </tr>
          ) : (
            phase.lineItems.map((line) => (
              <tr className="border-t border-[#e3e1d7]" key={line.id}>
                <td className="px-3 py-2 font-extrabold text-[#16294d]">{line.name}</td>
                <td className="px-3 py-2 font-bold">{currency(line.spent)}</td>
                <td className="px-3 py-2 font-bold text-[#69746f]">
                  {line.payees.length > 0 ? line.payees.slice(0, 3).join(", ") : "Waiting on check"}
                </td>
                <td className="px-3 py-2 font-bold">
                  {line.transactions}
                  <span className="block text-[10px] text-[#7b8298]">{shortDate(line.lastTxnDate)}</span>
                </td>
                <td className="px-3 py-2 font-bold">
                  {line.draw?.drawSubmitted ? "Submitted" : "Not sent"}
                  <span className="block text-[10px] text-[#7b8298]">
                    {currency(line.draw?.requestedAmount)}
                  </span>
                </td>
                <td className="px-3 py-2 font-bold">
                  {line.draw?.drawReceived ? "Received" : "Pending"}
                  <span className="block text-[10px] text-[#7b8298]">
                    {currency(line.draw?.receivedAmount)}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function ReportMetric({
  label,
  tone = "navy",
  value,
}: {
  label: string;
  tone?: "navy" | "red";
  value: string;
}) {
  return (
    <div className="rounded-[9px] border border-[#e3e1d7] bg-[#fbfaf7] p-2.5">
      <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#7b8298]">{label}</p>
      <p className={`mt-1 text-xl font-extrabold leading-none ${tone === "red" ? "text-[#e23b2a]" : "text-[#16294d]"}`}>
        {value}
      </p>
    </div>
  );
}

function SmallMetric({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#e3e1d7] bg-[#fbfaf7] px-3 py-2.5">
      <p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#9aa1b2]">{label}</p>
      <p className="mt-1 text-base font-extrabold leading-none text-[#16294d]">{value}</p>
      {detail ? <p className="mt-1 text-[10px] font-bold text-[#7b8298]">{detail}</p> : null}
    </div>
  );
}
