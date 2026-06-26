import Link from "next/link";
import Image from "next/image";
import {
  ChevronDown,
  Landmark,
  Printer,
} from "lucide-react";

import { saveDrawLineItemStatusAction } from "@/app/actions/draw-status";
import { DrawsBudgetHouseLoader } from "@/app/draws-budget/house-loader";
import { ProjectRenderUpload } from "@/app/draws-budget/render-upload";
import {
  getHouseDashboardSummaries,
  refreshHouseDashboardSummaries,
  type HouseDashboardSummary,
} from "@/lib/dashboard/house-dashboard-summary-store";
import {
  drawPhaseKeys,
  getDrawLineItemStatuses,
  getDrawPhaseStatuses,
  getHousePhaseActuals,
  getPhaseLineItemActuals,
  getPhaseLineItemsByPhase,
  type DrawLineItemRecord,
  type DrawPhaseKey,
  type DrawPhaseRecord,
  type HousePhaseActual,
  type PhaseLineItem,
  type PhaseLineItemActual,
} from "@/lib/draws/draws-store";
import { getHouseDetailsMap } from "@/lib/houses/house-details-store";
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName } from "@/lib/qbo/bank-account-map";
import {
  getSchedulingDashboardMaps,
  type SchedulingLineStatus,
} from "@/lib/scheduling/status-store";

export const dynamic = "force-dynamic";

type PhaseView = {
  key: DrawPhaseKey;
  label: string;
  name: string;
  scheduleStatus: string;
  actual: HousePhaseActual | null;
  draw: DrawPhaseRecord | null;
  lineItems: PhaseLineItem[];
  lineItemActuals: PhaseLineItemActual[];
  lineItemDraws: DrawLineItemRecord[];
};

type HouseView = {
  id: string;
  house: string;
  bank: string;
  city: string | null;
  soldPrice: number | null;
  squareFootage: number | null;
  totalSpent: number;
  progress: number;
  currentPhase: PhaseView;
  readyPhases: number;
  needsReview: number;
  phases: PhaseView[];
  scheduleUrl: string | null;
  renderImageUrl: string | null;
  contractFileName: string | null;
  contractUploadedAt: string | null;
  contractPrice: number | null;
  contractSquareFootage: number | null;
  contractCity: string | null;
  contractSourceStatus: string | null;
  completed: boolean;
  completedAt: string | null;
};

type DrawsBudgetPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type HouseListView = "active" | "completed";

const fastDataTimeoutMs = 1200;
const detailDataTimeoutMs = 3000;
const schedulingTimeoutMs = 900;

function withDataTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = fastDataTimeoutMs) {
  let timeout: NodeJS.Timeout;
  const guarded = promise.catch(() => fallback);

  return Promise.race([
    guarded,
    new Promise<T>((resolve) => {
      timeout = setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

const phaseLabels: Record<DrawPhaseKey, { label: string; name: string }> = {
  pre: { label: "Pre", name: "Pre Phase" },
  p1: { label: "1", name: "Foundation" },
  p2: { label: "2", name: "Framing / Dry-in" },
  p3: { label: "3", name: "Rough Trades" },
  p4: { label: "4", name: "Exterior / Floors" },
  p5: { label: "5", name: "Interior" },
  p6: { label: "6", name: "Final" },
};

const phaseChargeItems: Record<DrawPhaseKey, string[]> = {
  pre: ["Architect", "Builders Risk Insurance", "City Permits", "Toilet Rental"],
  p1: [
    "Fill Dirt",
    "Plumbing Rough in",
    "Pre form Survey",
    "Termite Treatment",
    "Foundation Rebar Materials",
    "Foundation Concrete Materials",
    "Foundation Labor",
  ],
  p2: [
    "Wall Framing Materials",
    "Wall Framing Labor",
    "Roof Framing Materials",
    "Roof Framing Labor",
    "Roof Shingles Materials",
    "Roof Shingles labor",
    "Windows Vendor",
  ],
  p3: [
    "Plumbing Top-out",
    "A/C Duct Work",
    "Electrical Rough in",
    "Wall insulation",
    "Exterior Painting",
    "Sheetrock",
  ],
  p4: ["Tape & Float", "Texture", "Exterior Materials", "Exterior Material Labor", "Flooring"],
  p5: ["Cabinets and Vanities", "Trim, Doors, Shelving", "Interior Paint/Stain", "Counter Tops", "Front Doors"],
  p6: ["Electrical Final/Fixtures", "Plumbing Final/Fixtures", "Hardware/Mirrors", "Clean-up"],
};

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

function scheduleStatusFor(actual: HousePhaseActual | null) {
  if (!actual || actual.transactionCount === 0) {
    return "Scheduled";
  }

  if (actual.status === "over_budget") {
    return "Needs Review";
  }

  return "Working Today";
}

function scheduleUrl(houseName: string) {
  const baseUrl = process.env.SCHEDULING_APP_URL ?? process.env.NEXT_PUBLIC_SCHEDULING_APP_URL;

  if (!baseUrl) {
    return null;
  }

  const url = new URL(baseUrl);
  url.searchParams.set("house", houseName);

  return url.toString();
}

function phaseHasMoney(phase: PhaseView) {
  return Boolean(phase.actual && phase.actual.transactionCount > 0);
}

function isPhaseOverBudget(phase: PhaseView) {
  return phase.actual?.status === "over_budget";
}

function progressFor(phases: PhaseView[], soldPrice: number | null, totalSpent: number) {
  if (soldPrice && soldPrice > 0) {
    return Math.max(0, Math.min(100, Math.round((totalSpent / soldPrice) * 100)));
  }

  const active = phases.filter((phase) => phaseHasMoney(phase)).length;

  return Math.round((active / drawPhaseKeys.length) * 100);
}

function currentPhaseFor(phases: PhaseView[]) {
  const active = phases.filter((phase) => phaseHasMoney(phase));

  return active.at(-1) ?? phases[0];
}

function phaseDisplayName(phase: PhaseView) {
  return phase.key === "pre" ? "Pre Phase" : `Phase ${phase.label}`;
}

function selectedPhaseFromParams(
  house: HouseView,
  selectedHouseId: string | null,
  selectedPhaseKey: DrawPhaseKey | null,
) {
  const requestedPhase =
    selectedHouseId === house.id && selectedPhaseKey
      ? house.phases.find((phase) => phase.key === selectedPhaseKey)
      : null;

  return requestedPhase ?? house.currentPhase;
}

function anchorIdForHouse(id: string) {
  return `house-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function setupAnchorIdForHouse(id: string) {
  return `setup-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function sourceTruthAnchorIdForHouse(id: string) {
  return `source-truth-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function isDrawPhaseKey(value: string | string[] | undefined): value is DrawPhaseKey {
  return typeof value === "string" && drawPhaseKeys.includes(value as DrawPhaseKey);
}

function lineItemKeyFromName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function chargeRowsForPhase(phase: PhaseView) {
  if (phase.lineItems.length > 0) {
    return phase.lineItems.map((item) => {
      const actual = phase.lineItemActuals.find(
        (lineActual) => lineActual.qboAccountId === item.qboAccountId,
      );
      const draw = phase.lineItemDraws.find(
        (lineDraw) => lineDraw.lineItemKey === item.qboAccountId,
      );
      const paidAmount = actual?.spentAmount ?? 0;

      return {
        itemKey: item.qboAccountId,
        item: item.lineItemName,
        budgetAmount: null,
        paidAmount,
        draw,
        schedule: null as SchedulingLineStatus | null,
        payee:
          actual && actual.payeeNames.length > 0
            ? actual.payeeNames.slice(0, 2).join(", ")
            : "Waiting on check",
        status: actual && actual.transactionCount > 0 ? "Completed" : "Open",
        meta:
          actual && actual.transactionCount > 0
            ? `${actual.transactionCount} QB transaction${actual.transactionCount === 1 ? "" : "s"} · last ${shortDate(actual.lastTxnDate)}`
            : item.fullyQualifiedName ?? "Waiting for QuickBooks check/purchase",
      };
    });
  }

  const items = phaseChargeItems[phase.key];
  const budgetAmount = phase.actual?.budgetAmount ?? null;
  const spentAmount = phase.actual?.spentAmount ?? 0;
  const rowBudget = budgetAmount === null ? null : budgetAmount / items.length;
  const paidRows = Math.min(items.length, phase.actual?.transactionCount ?? 0);

  return items.map((item, index) => {
    const isPaid = index < paidRows && spentAmount > 0;
    const paidAmount = isPaid ? spentAmount / Math.max(paidRows, 1) : 0;
    const overBudget = rowBudget !== null && paidAmount > rowBudget;
    const itemKey = lineItemKeyFromName(item);
    const draw = phase.lineItemDraws.find((lineDraw) => lineDraw.lineItemKey === itemKey);

    return {
      itemKey,
      item,
      budgetAmount: rowBudget,
      paidAmount,
      draw,
      schedule: null as SchedulingLineStatus | null,
      payee: isPaid ? "QB payee mapped" : "Waiting on check",
      status: overBudget ? "Review" : isPaid ? "Completed" : "Open",
      meta: "Preview row until this phase is synced from Chart of Accounts.",
    };
  });
}

const demoHouses = [
  { house: "Cepeda", city: "Alice", soldPrice: 429900, squareFootage: 3391, phaseIndex: 4, review: true },
  { house: "Charles", city: "Alice", soldPrice: 200000, squareFootage: 2000, phaseIndex: 1, review: false },
  { house: "Chavez", city: "Alice", soldPrice: 265000, squareFootage: 2300, phaseIndex: 4, review: true },
  { house: "Delgadillo", city: "Alice", soldPrice: 275000, squareFootage: 2380, phaseIndex: 2, review: false },
  { house: "Gomez", city: "McAllen", soldPrice: 200000, squareFootage: 2180, phaseIndex: 6, review: true },
  { house: "Gonzalez", city: "Alice", soldPrice: 255000, squareFootage: 2225, phaseIndex: 2, review: false },
  { house: "HUNN", city: "Alice", soldPrice: 410000, squareFootage: 3150, phaseIndex: 5, review: true },
  { house: "Lot 6", city: "Alice", soldPrice: 319000, squareFootage: 2891, phaseIndex: 5, review: false },
  { house: "Ruvalcaba", city: "Alice", soldPrice: 245000, squareFootage: 2110, phaseIndex: 2, review: false },
  { house: "Hernandez", city: "Alice", soldPrice: 250000, squareFootage: 2180, phaseIndex: 0, review: false },
  { house: "Pulido", city: "Alice", soldPrice: 295000, squareFootage: 2510, phaseIndex: 5, review: false },
  { house: "Saavedra", city: "Alice", soldPrice: 238000, squareFootage: 2050, phaseIndex: 1, review: false },
  { house: "Valerio", city: "Alice", soldPrice: 264500, squareFootage: 2300, phaseIndex: 2, review: false },
  { house: "Vazquez", city: "Alice", soldPrice: 319000, squareFootage: 2891, phaseIndex: 1, review: false },
] as const;

function demoActual(
  house: (typeof demoHouses)[number],
  key: DrawPhaseKey,
  index: number,
): HousePhaseActual | null {
  if (index > house.phaseIndex) {
    return null;
  }

  const budgetPercentages: Record<DrawPhaseKey, number> = {
    pre: 0.02,
    p1: 0.1077,
    p2: 0.125,
    p3: 0.115,
    p4: 0.11,
    p5: 0.12,
    p6: 0.055,
  };
  const overBudget = house.review && index === house.phaseIndex;
  const budgetAmount = Math.round(house.soldPrice * budgetPercentages[key]);
  const spentAmount = Math.round(budgetAmount * (overBudget ? 1.12 : 0.88 + index * 0.015));

  return {
    bankAccountQboId: `demo-${house.house}`,
    houseName: house.house,
    phaseKey: key,
    phaseLabel: phaseLabels[key].label,
    phaseName: phaseLabels[key].name,
    budgetAmount,
    spentAmount,
    transactionCount: Math.max(1, 3 + index),
    overBudgetAmount: overBudget ? spentAmount - budgetAmount : 0,
    status: overBudget ? "over_budget" : "on_budget",
  };
}

function buildDemoHouses(): HouseView[] {
  return demoHouses.map((house) => {
    const phases: PhaseView[] = drawPhaseKeys.map((key, phaseIndex) => {
      const actual = demoActual(house, key, phaseIndex);

      return {
        key,
        label: phaseLabels[key].label,
        name: actual?.phaseName ?? phaseLabels[key].name,
        scheduleStatus: scheduleStatusFor(actual),
        actual,
        lineItems: [],
        lineItemActuals: [],
        lineItemDraws: [],
        draw:
          phaseIndex === house.phaseIndex
            ? {
                qboBankAccountId: `demo-${house.house}`,
                houseName: house.house,
                phaseKey: key,
                drawStatus: house.review ? "reviewing" : "ready",
                submittedDate: null,
                requestedAmount: actual?.budgetAmount ?? null,
                receivedAmount: null,
                receivedDate: null,
                accountantStatus: "waiting",
                notes: "Demo row for local testing.",
                updatedAt: new Date().toISOString(),
              }
            : null,
      };
    });
    const totalSpent = phases.reduce((total, phase) => total + (phase.actual?.spentAmount ?? 0), 0);
    const currentPhase = currentPhaseFor(phases);

    return {
      id: `demo-${house.house}`,
      house: house.house,
      bank: `${house.house} demo bank account`,
      city: house.city,
      soldPrice: house.soldPrice,
      squareFootage: house.squareFootage,
      totalSpent,
      progress: progressFor(phases, house.soldPrice, totalSpent),
      currentPhase,
      readyPhases: phases.filter((phase) => phase.draw?.drawStatus === "ready").length,
      needsReview: phases.filter((phase) => phase.actual?.status === "over_budget").length,
      phases,
      scheduleUrl: scheduleUrl(house.house),
      renderImageUrl: null,
      contractFileName: null,
      contractUploadedAt: null,
      contractPrice: null,
      contractSquareFootage: null,
      contractCity: null,
      contractSourceStatus: null,
      completed: house.phaseIndex >= drawPhaseKeys.length - 1,
      completedAt: null,
    };
  }).sort((a, b) => b.progress - a.progress || a.house.localeCompare(b.house));
}

function houseViewFromSummary(summary: HouseDashboardSummary): HouseView {
  const phases: PhaseView[] = summary.phases.map((phase) => ({
    key: phase.key,
    label: phase.label,
    name: phase.name,
    scheduleStatus: scheduleStatusFor(phase.actual),
    actual: phase.actual,
    draw: phase.draw,
    lineItems: [],
    lineItemActuals: [],
    lineItemDraws: [],
  }));
  const currentPhase =
    phases.find((phase) => phase.key === summary.currentPhaseKey) ?? phases[0];

  return {
    id: summary.id,
    house: summary.house,
    bank: summary.bank,
    city: summary.city,
    soldPrice: summary.soldPrice,
    squareFootage: summary.squareFootage,
    totalSpent: summary.totalSpent,
    progress: summary.progress,
    currentPhase,
    readyPhases: summary.readyPhases,
    needsReview: summary.needsReview,
    phases,
    scheduleUrl: scheduleUrl(summary.house),
    renderImageUrl: summary.renderImageUrl,
    contractFileName: summary.contractFileName,
    contractUploadedAt: summary.contractUploadedAt,
    contractPrice: summary.contractPrice,
    contractSquareFootage: summary.contractSquareFootage,
    contractCity: summary.contractCity,
    contractSourceStatus: summary.contractSourceStatus,
    completed: false,
    completedAt: null,
  };
}

async function getCollapsedHouseViews(forceRefresh = false) {
  let summaries = forceRefresh
    ? []
    : await withDataTimeout(getHouseDashboardSummaries(), []);

  if (forceRefresh) {
    summaries = await withDataTimeout(refreshHouseDashboardSummaries(), [], detailDataTimeoutMs);
  }

  return summaries.map(houseViewFromSummary);
}

async function getDetailedHouseViews(selectedHouseId: string | null) {
  const [
    snapshot,
    houseDetails,
    drawStatusesByPhase,
    actualsByPhase,
    drawLineItemStatuses,
    phaseLineItemsByPhase,
    phaseLineItemActuals,
  ] = await Promise.all([
    withDataTimeout(getAccountsSnapshot(), null, detailDataTimeoutMs),
    withDataTimeout(getHouseDetailsMap(), new Map(), detailDataTimeoutMs),
    withDataTimeout(getDrawPhaseStatuses(), new Map<string, DrawPhaseRecord>(), detailDataTimeoutMs),
    withDataTimeout(getHousePhaseActuals(), new Map<string, HousePhaseActual>(), detailDataTimeoutMs),
    withDataTimeout(getDrawLineItemStatuses(), new Map<string, DrawLineItemRecord>(), detailDataTimeoutMs),
    withDataTimeout(getPhaseLineItemsByPhase(), new Map<DrawPhaseKey, PhaseLineItem[]>(), detailDataTimeoutMs),
    withDataTimeout(getPhaseLineItemActuals(), new Map<string, PhaseLineItemActual>(), detailDataTimeoutMs),
  ]);
  const bankAccounts = snapshot?.accounts.filter((account) => account.AccountType === "Bank") ?? [];
  const houses = bankAccounts
    .map((account) => {
      const house = getConfirmedHouseName(account);

      if (!house) {
        return null;
      }

      const details = houseDetails.get(account.Id);
      const phases: PhaseView[] = drawPhaseKeys.map((key) => {
        const actual = actualsByPhase.get(`${account.Id}:${key}`) ?? null;
        const lineItems =
          account.Id === selectedHouseId
            ? phaseLineItemsByPhase.get(key) ?? []
            : [];

        return {
          key,
          label: phaseLabels[key].label,
          name: actual?.phaseName ?? phaseLabels[key].name,
          scheduleStatus: scheduleStatusFor(actual),
          actual,
          lineItems,
          lineItemActuals: lineItems
            .map((lineItem) =>
              phaseLineItemActuals.get(`${account.Id}:${key}:${lineItem.qboAccountId}`),
            )
            .filter((lineActual): lineActual is PhaseLineItemActual => Boolean(lineActual)),
          lineItemDraws: lineItems
            .map((lineItem) =>
              drawLineItemStatuses.get(`${account.Id}:${key}:${lineItem.qboAccountId}`),
            )
            .filter((lineDraw): lineDraw is DrawLineItemRecord => Boolean(lineDraw)),
          draw: drawStatusesByPhase.get(`${account.Id}:${key}`) ?? null,
        };
      });
      const totalSpent = phases.reduce((total, phase) => total + (phase.actual?.spentAmount ?? 0), 0);
      const readyPhases = phases.filter((phase) =>
        phase.draw?.drawStatus === "ready" ||
        phase.draw?.drawStatus === "submitted" ||
        phase.draw?.drawStatus === "received"
      ).length;
      const needsReview = phases.filter((phase) =>
        phase.actual?.status === "over_budget" || phase.actual?.status === "needs_house_setup"
      ).length;
      const currentPhase = currentPhaseFor(phases);

      const contractSoldPrice = details?.currentContractPrice ?? details?.contractPrice ?? null;
      const sourceSoldPrice = contractSoldPrice ?? details?.soldPrice ?? null;
      const sourceSquareFootage = details?.contractSquareFootage ?? details?.squareFootage ?? null;
      const sourceCity = details?.contractCity ?? details?.city ?? null;

      const houseView: HouseView = {
        id: account.Id,
        house,
        bank: accountName(account),
        city: sourceCity,
        soldPrice: sourceSoldPrice,
        squareFootage: sourceSquareFootage,
        totalSpent,
        progress: progressFor(phases, sourceSoldPrice, totalSpent),
        currentPhase,
        readyPhases,
        needsReview,
        phases,
        scheduleUrl: scheduleUrl(house),
        renderImageUrl: details?.manualRenderImageUrl ?? null,
        contractFileName: details?.contractFileName ?? null,
        contractUploadedAt: details?.contractUploadedAt ?? null,
        contractPrice: details?.contractPrice ?? null,
        contractSquareFootage: details?.contractSquareFootage ?? null,
        contractCity: details?.contractCity ?? null,
        contractSourceStatus: details?.contractSourceStatus ?? null,
        completed: false,
        completedAt: null,
      };

      return houseView;
    })
    .filter((house): house is HouseView => Boolean(house));

  return houses.sort((a, b) => b.progress - a.progress || a.house.localeCompare(b.house));
}

function DrawsBudgetShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f2f1ea] text-[#1b2233] [background-image:linear-gradient(rgba(22,41,77,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(22,41,77,0.055)_1px,transparent_1px)] [background-size:34px_34px] [font-family:Barlow,system-ui,sans-serif]">
      <header className="bg-[#16294d] px-7 py-4 text-white shadow-[0_6px_22px_-10px_rgba(14,27,54,0.6)]">
        <div className="mx-auto max-w-[1240px]">
          <div className="flex items-center gap-5">
            <div className="grid h-[66px] w-[76px] place-items-center rounded-[10px] bg-white shadow-sm">
              <Image
                alt="South Texas Builders"
                className="h-auto w-[54px]"
                height={1080}
                src="/south-texas-builders-logo.png"
                width={1080}
              />
            </div>
            <div>
              <h1 className="font-['Barlow_Condensed',Barlow,sans-serif] text-[29px] font-bold uppercase leading-none tracking-[0.04em]">
                Draws <span className="text-[#e23b2a]">Department</span>
              </h1>
              <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.22em] text-[#b9c5dc]">
                Person in charge: <span className="text-white">Finance Team</span>
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex h-12 items-center gap-3 rounded-[10px] border border-white/15 bg-white/10 px-4 text-sm font-bold">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[#b9c5dc]">Working Day</span>
              <span>Mon · Jun 8</span>
            </div>
            <div className="flex h-12 items-center gap-3 rounded-[10px] border border-white/15 bg-white/10 px-4 text-sm font-bold">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[#b9c5dc]">Updated by</span>
              <span className="rounded-[8px] border border-white/20 bg-white/10 px-4 py-2">Owner</span>
            </div>
            <div className="flex h-12 items-center rounded-[10px] border border-white/15 bg-white/10 px-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#b7ead1]">
              QuickBooks synced
            </div>
            <Link
              className="flex h-12 items-center rounded-[10px] bg-[#e23b2a] px-5 text-sm font-bold text-white shadow-sm"
              href="/api/qbo/accounts/sync?next=/draws-budget"
            >
              Sync QB
            </Link>
            <Link
              className="flex h-12 items-center gap-2 rounded-[10px] border border-white/15 bg-white/10 px-5 text-sm font-bold text-white shadow-sm"
              href="/bank-feed"
            >
              <Landmark size={16} />
              Bank Feed
            </Link>
            <Link
              className="flex h-12 items-center gap-2 rounded-[10px] border border-white/15 bg-white px-5 text-sm font-bold text-[#16294d] shadow-sm"
              href="/reports/dashboard"
            >
              <Printer size={16} />
              Export Report
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1240px] px-7 py-5">
        {children}

        <p className="mt-6 text-sm text-[#69746f]">
          Scheduling controls field status. Finance controls draw submitted, money received, accountant review, and budget notes.
        </p>
      </section>
    </main>
  );
}

export default async function DrawsBudgetPage({ searchParams }: DrawsBudgetPageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedHouseId = typeof params.house === "string" ? params.house : null;
  const selectedPhaseKey = isDrawPhaseKey(params.phase) ? params.phase : null;
  const detailsOpen = params.details === "1";
  const forceRefresh = params.refresh === "1";
  const listView: HouseListView = params.view === "completed" ? "completed" : "active";

  if (!detailsOpen) {
    return (
      <DrawsBudgetShell>
        <DrawsBudgetHouseLoader view={listView} />
      </DrawsBudgetShell>
    );
  }

  let houses: HouseView[] = detailsOpen
    ? await getDetailedHouseViews(selectedHouseId)
    : await getCollapsedHouseViews(forceRefresh);

  if (houses.length === 0) {
    houses = buildDemoHouses();
  }

  const schedulingInput =
    detailsOpen && selectedHouseId
      ? houses.map((house) =>
          house.id === selectedHouseId
            ? house
            : {
                house: house.house,
              },
        )
      : houses.map((house) => ({ house: house.house }));
  const emptySchedulingMaps = {
    completion: new Map(),
    statuses: new Map(),
    visuals: new Map(),
  };
  const schedulingMaps =
    detailsOpen || listView === "completed"
      ? await withDataTimeout(
          getSchedulingDashboardMaps(schedulingInput),
          emptySchedulingMaps,
          schedulingTimeoutMs,
        )
      : emptySchedulingMaps;
  const schedulingStatuses = schedulingMaps.statuses;
  const schedulingVisuals = schedulingMaps.visuals;
  const schedulingCompletion = schedulingMaps.completion;

  houses = houses.map((house) => ({
    ...house,
    renderImageUrl: house.renderImageUrl ?? schedulingVisuals.get(house.house)?.renderImage ?? null,
    completed:
      schedulingCompletion.get(house.house)?.completed ??
      (house.currentPhase.key === "p6" && phaseHasMoney(house.currentPhase)),
    completedAt: schedulingCompletion.get(house.house)?.completedAt ?? null,
  }));

  const activeHouses = houses.filter((house) => !house.completed);
  const completedHouses = houses.filter((house) => house.completed);
  const visibleHouses = listView === "completed" ? completedHouses : activeHouses;

  return (
    <main className="min-h-screen bg-[#f2f1ea] text-[#1b2233] [background-image:linear-gradient(rgba(22,41,77,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(22,41,77,0.055)_1px,transparent_1px)] [background-size:34px_34px] [font-family:Barlow,system-ui,sans-serif]">
      <header className="bg-[#16294d] px-7 py-4 text-white shadow-[0_6px_22px_-10px_rgba(14,27,54,0.6)]">
        <div className="mx-auto max-w-[1240px]">
          <div className="flex items-center gap-5">
            <div className="grid h-[66px] w-[76px] place-items-center rounded-[10px] bg-white shadow-sm">
              <Image
                alt="South Texas Builders"
                className="h-auto w-[54px]"
                height={1080}
                src="/south-texas-builders-logo.png"
                width={1080}
              />
            </div>
            <div>
              <h1 className="font-['Barlow_Condensed',Barlow,sans-serif] text-[29px] font-bold uppercase leading-none tracking-[0.04em]">
                Draws <span className="text-[#e23b2a]">Department</span>
              </h1>
              <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.22em] text-[#b9c5dc]">
                Person in charge: <span className="text-white">Finance Team</span>
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex h-12 items-center gap-3 rounded-[10px] border border-white/15 bg-white/10 px-4 text-sm font-bold">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[#b9c5dc]">Working Day</span>
              <span>Mon · Jun 8</span>
            </div>
            <div className="flex h-12 items-center gap-3 rounded-[10px] border border-white/15 bg-white/10 px-4 text-sm font-bold">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[#b9c5dc]">Updated by</span>
              <span className="rounded-[8px] border border-white/20 bg-white/10 px-4 py-2">Owner</span>
            </div>
            <div className="flex h-12 items-center rounded-[10px] border border-white/15 bg-white/10 px-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#b7ead1]">
              QuickBooks synced
            </div>
            <Link
              className="flex h-12 items-center rounded-[10px] bg-[#e23b2a] px-5 text-sm font-bold text-white shadow-sm"
              href="/api/qbo/accounts/sync?next=/draws-budget"
            >
              Sync QB
            </Link>
            <Link
              className="flex h-12 items-center gap-2 rounded-[10px] border border-white/15 bg-white/10 px-5 text-sm font-bold text-white shadow-sm"
              href="/bank-feed"
            >
              <Landmark size={16} />
              Bank Feed
            </Link>
            <Link
              className="flex h-12 items-center gap-2 rounded-[10px] border border-white/15 bg-white px-5 text-sm font-bold text-[#16294d] shadow-sm"
              href="/reports/dashboard"
            >
              <Printer size={16} />
              Export Report
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1240px] px-7 py-5">
        <section className="mb-5 grid gap-3 md:grid-cols-2">
          <HouseStatusCard
            active={listView === "active"}
            count={activeHouses.length}
            href="/draws-budget"
            label="Active Houses"
            note="Projects still moving through schedule, draws, and budget control."
          />
          <HouseStatusCard
            active={listView === "completed"}
            count={completedHouses.length}
            href="/draws-budget?view=completed"
            label="Completed Houses"
            note="Closed projects kept for final cost, payee history, and profit review."
          />
        </section>

        {visibleHouses.length === 0 ? (
          <div className="rounded-[14px] border border-[#f4d48a] bg-[#fff6df] p-4 text-sm font-semibold text-[#9a6500]">
            {houses.length === 0
              ? "No house draw cards are loaded yet. Click Sync QB to pull the latest QuickBooks accounts, checks, and phase totals."
              : listView === "completed"
                ? "No completed houses are in this area yet."
                : "No active houses are in this area right now."}
          </div>
        ) : null}

        <section className="space-y-4">
          {visibleHouses.map((house, index) => (
            <HouseCard
              house={house}
              index={index}
              key={house.id}
              selectedPhase={selectedPhaseFromParams(house, selectedHouseId, selectedPhaseKey)}
              schedulingStatuses={schedulingStatuses}
              showDetails={detailsOpen && selectedHouseId === house.id}
            />
          ))}
        </section>

        <p className="mt-6 text-sm text-[#69746f]">
          Scheduling controls field status. Finance controls draw submitted, money received, accountant review, and budget notes.
        </p>
      </section>
    </main>
  );
}

function HouseStatusCard({
  active,
  count,
  href,
  label,
  note,
}: {
  active: boolean;
  count: number;
  href: string;
  label: string;
  note: string;
}) {
  return (
    <Link
      className={`rounded-[13px] border bg-white p-4 shadow-[0_8px_24px_-20px_rgba(14,27,54,0.45)] transition hover:border-[#16294d]/25 hover:bg-[#fbfaf7] ${
        active ? "border-[#16294d] ring-2 ring-[#16294d]/10" : "border-[#e3e1d7]"
      }`}
      href={href}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#e23b2a]">
            {label}
          </div>
          <div className="mt-2 font-['Barlow_Condensed',Barlow,sans-serif] text-[38px] font-bold leading-none text-[#16294d]">
            {count}
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] ${
            active ? "bg-[#16294d] text-white" : "bg-[#f2f1ea] text-[#7b8298]"
          }`}
        >
          {active ? "Open" : "View"}
        </span>
      </div>
      <p className="mt-2 max-w-[520px] text-sm font-bold leading-5 text-[#7b8298]">{note}</p>
    </Link>
  );
}

function HouseCard({
  house,
  index,
  selectedPhase,
  schedulingStatuses,
  showDetails,
}: {
  house: HouseView;
  index: number;
  selectedPhase: PhaseView;
  schedulingStatuses: Map<string, SchedulingLineStatus>;
  showDetails: boolean;
}) {
  const accent = index % 3 === 0 ? "#e6aa14" : "#27a0bd";
  const anchorId = anchorIdForHouse(house.id);
  const pricePerSqft =
    house.soldPrice && house.squareFootage
      ? house.soldPrice / house.squareFootage
      : null;
  const projectSpendPercent =
    house.soldPrice && house.soldPrice > 0
      ? Math.round((house.totalSpent / house.soldPrice) * 100)
      : null;
  const projectSpendPerSqft =
    house.squareFootage && house.squareFootage > 0
      ? house.totalSpent / house.squareFootage
      : null;
  const remainingMoney =
    house.soldPrice === null ? null : house.soldPrice - house.totalSpent;
  const remainingPercent =
    house.soldPrice && house.soldPrice > 0 && remainingMoney !== null
      ? Math.round((remainingMoney / house.soldPrice) * 100)
      : null;
  const activePhase = house.currentPhase.key === "pre" ? "Pre" : `P${house.currentPhase.label}`;
  const detailHref = `/draws-budget?house=${encodeURIComponent(house.id)}&phase=${house.currentPhase.key}&details=1`;
  const sourceTruthHref = `/draws-budget?house=${encodeURIComponent(house.id)}&phase=${selectedPhase.key}&details=1#${sourceTruthAnchorIdForHouse(house.id)}`;
  const collapseHref = "/draws-budget";
  const rowHref = showDetails ? collapseHref : detailHref;

  return (
    <article
      className="overflow-hidden rounded-[14px] border border-[#e3e1d7] bg-white shadow-[0_8px_24px_-18px_rgba(14,27,54,0.45)]"
      id={anchorId}
    >
      <div className="relative block px-4 py-4 transition hover:bg-[#fbfaf7]">
        <div className="absolute bottom-0 left-0 top-0 w-1" style={{ backgroundColor: accent }} />
        <div className="grid gap-3 lg:grid-cols-[104px_1.1fr_0.72fr_0.72fr_0.72fr_1.25fr_130px] lg:items-center">
          <ProjectRenderUpload
            houseName={house.house}
            contractCity={house.contractCity}
            contractFileName={house.contractFileName}
            contractPrice={house.contractPrice}
            contractSquareFootage={house.contractSquareFootage}
            contractSourceStatus={house.contractSourceStatus}
            imageUrl={house.renderImageUrl}
            qboBankAccountId={house.id}
            returnTo={`/draws-budget?house=${encodeURIComponent(house.id)}&phase=${selectedPhase.key}&details=${showDetails ? "1" : "0"}`}
          />

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold text-[#16294d]">{house.house}</h2>
              <span className="rounded-[7px] bg-[#eaf2ff] px-2.5 py-1 text-xs font-extrabold text-[#16294d]">
                {activePhase}
              </span>
            </div>
            <p className="mt-1 text-xs font-bold text-[#7b8298]">
              {house.city ?? "City missing"} · Current phase {phaseDisplayName(house.currentPhase)}
            </p>
            <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9aa1b2]">
              {house.squareFootage ? `${house.squareFootage.toLocaleString()} sqft` : "Sqft missing"}
            </p>
          </div>

          <SummaryMetric
            label="House sold"
            subValue={pricePerSqft ? `${currency(pricePerSqft)} / sold sqft` : undefined}
            value={currency(house.soldPrice)}
            emphasis="primary"
          />
          <SummaryMetric
            label="Project spent"
            subValue={[
              projectSpendPercent === null ? null : `${projectSpendPercent}% spent`,
              projectSpendPerSqft === null ? null : `${currency(projectSpendPerSqft)} / sqft`,
            ].filter(Boolean).join(" · ") || undefined}
            value={currency(house.totalSpent)}
            emphasis="secondary"
          />
          <SummaryMetric
            label="Remaining"
            subValue={
              remainingPercent === null
                ? undefined
                : remainingPercent >= 0
                  ? `${remainingPercent}% left`
                  : `${Math.abs(remainingPercent)}% over`
            }
            value={
              remainingMoney === null
                ? "Pending"
                : remainingMoney >= 0
                  ? currency(remainingMoney)
                  : `${currency(Math.abs(remainingMoney))} over`
            }
            emphasis={remainingMoney !== null && remainingMoney < 0 ? "alert" : "secondary"}
          />
          <MiniPhaseStrip house={house} />

          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
            <Link
              className="rounded-[9px] border border-[#e3e1d7] bg-white px-3 py-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[#16294d]"
              href={sourceTruthHref}
              prefetch={false}
            >
              Source Truth
            </Link>
            <Link
              className={`rounded-[9px] px-3 py-2 text-xs font-extrabold uppercase tracking-[0.08em] ${
                showDetails
                  ? "bg-[#e23b2a] text-white"
                  : "bg-[#16294d] text-white"
              }`}
              href={rowHref}
              prefetch={false}
            >
              {showDetails ? "Collapse" : "Open Details"}
            </Link>
          </div>
        </div>
      </div>

      {showDetails ? (
        <div className="border-t border-[#e3e1d7] px-4 pb-4 pt-3">
          <SourceTruthPanel house={house} />

          <SelectedPhasePanel
            house={house}
            phase={selectedPhase}
            schedulingStatuses={schedulingStatuses}
          />

          <PhaseSelectorStrip house={house} selectedPhase={selectedPhase} />
        </div>
      ) : null}
    </article>
  );
}

function MiniPhaseStrip({ house }: { house: HouseView }) {
  return (
    <div className="rounded-[10px] border border-[#e3e1d7] bg-white px-3 py-2">
      <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#9aa1b2]">
        Phase health
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {house.phases.map((phase) => {
          const label = phase.key === "pre" ? "Pre" : `P${phase.label}`;
          const isCurrent = phase.key === house.currentPhase.key;
          const overBudget = isPhaseOverBudget(phase);
          const hasMoney = phaseHasMoney(phase);
          const toneClassName = overBudget
            ? "border-[#e23b2a] bg-[#fdebea] text-[#9d251c]"
            : hasMoney
              ? "border-[#b9dec9] bg-[#eaf7f0] text-[#1f6f4b]"
              : "border-[#e3e1d7] bg-[#fbfaf7] text-[#7b8298]";

          return (
            <span
              className={`grid h-8 place-items-center rounded-[7px] border text-[10px] font-extrabold ${
                isCurrent ? "ring-2 ring-[#16294d] ring-offset-1" : ""
              } ${toneClassName}`}
              key={phase.key}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SourceTruthPanel({ house }: { house: HouseView }) {
  const docs = [
    {
      label: "Contract",
      status: house.contractFileName ? "Added" : "Missing",
      value: house.contractFileName ?? "Upload contract",
      href: `/setup-inputs#${setupAnchorIdForHouse(house.id)}`,
    },
    {
      label: "Draw Sheet",
      status: "Missing",
      value: "CFS or Rally budget sheet",
      href: `/draws-budget?house=${encodeURIComponent(house.id)}&details=1#${sourceTruthAnchorIdForHouse(house.id)}`,
    },
    {
      label: "Bank Draw",
      status: "Missing",
      value: "Bank schedule and releases",
      href: `/draws-budget?house=${encodeURIComponent(house.id)}&details=1#${sourceTruthAnchorIdForHouse(house.id)}`,
    },
    {
      label: "Holdback",
      status: "Missing",
      value: "Holdback amount and release trigger",
      href: `/draws-budget?house=${encodeURIComponent(house.id)}&details=1#${sourceTruthAnchorIdForHouse(house.id)}`,
    },
  ];
  const extracted = [
    { label: "Sold price", value: currency(house.soldPrice) },
    {
      label: "Square feet",
      value: house.squareFootage ? house.squareFootage.toLocaleString() : "Pending",
    },
    { label: "Contract city", value: house.contractCity ?? house.city ?? "Pending" },
    { label: "Total spent", value: currency(house.totalSpent) },
    { label: "Current phase", value: phaseDisplayName(house.currentPhase) },
    { label: "Reader status", value: house.contractSourceStatus ?? "Manual review" },
  ];
  const addedDocCount = docs.filter((doc) => doc.status === "Added").length;

  return (
    <details
      className="group mb-3 rounded-[14px] border border-[#d6dceb] bg-[#fbfaf7] p-4 [&>summary::-webkit-details-marker]:hidden"
      id={sourceTruthAnchorIdForHouse(house.id)}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#e23b2a]">
            Source of Truth
          </p>
          <h3 className="mt-1 font-['Barlow_Condensed',Barlow,sans-serif] text-[28px] font-bold uppercase leading-none tracking-[0.03em] text-[#16294d]">
            {house.house}
          </h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full border border-[#d6dceb] bg-white px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#16294d]">
            {addedDocCount}/{docs.length} docs
          </span>
          <span className="rounded-full border border-[#d6dceb] bg-white px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#16294d]">
            {currency(house.soldPrice)}
          </span>
          <span className="rounded-full bg-[#16294d] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">
            <span className="group-open:hidden">Open</span>
            <span className="hidden group-open:inline">Close</span>
          </span>
        </div>
      </summary>

      <div className="mt-4 flex justify-end">
        <Link
          className="rounded-[9px] bg-[#16294d] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.1em] text-white"
          href={`/setup-inputs#${setupAnchorIdForHouse(house.id)}`}
        >
          Edit Manual Inputs
        </Link>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        {docs.map((doc) => (
          <Link
            className="rounded-[11px] border border-[#e3e1d7] bg-white p-3 transition hover:border-[#16294d]/30 hover:bg-[#fff]"
            href={doc.href}
            key={doc.label}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#9aa1b2]">
                {doc.label}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] ${
                  doc.status === "Added"
                    ? "bg-[#eaf7f0] text-[#1f6f4b]"
                    : "bg-[#fff6df] text-[#9a6500]"
                }`}
              >
                {doc.status}
              </span>
            </div>
            <p className="mt-2 min-h-10 text-sm font-bold leading-5 text-[#16294d]">{doc.value}</p>
            <p className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#e23b2a]">
              Add / Review
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-4 rounded-[12px] border border-[#e3e1d7] bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#9aa1b2]">
            Extracted Numbers
          </p>
          <span className="rounded-full border border-[#d6dceb] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#16294d]">
            Editable
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {extracted.map((item) => (
            <div className="rounded-[10px] border border-[#edf0f5] bg-[#fbfaf7] px-3 py-2" key={item.label}>
              <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#9aa1b2]">
                {item.label}
              </div>
              <div className="mt-1 text-sm font-extrabold text-[#16294d]">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function SummaryMetric({
  emphasis = "quiet",
  label,
  subValue,
  value,
}: {
  emphasis?: "primary" | "secondary" | "quiet" | "alert";
  label: string;
  subValue?: string;
  value: string;
}) {
  const valueClassName =
    emphasis === "primary"
      ? "text-[19px] font-extrabold text-[#16294d]"
      : emphasis === "alert"
        ? "text-[18px] font-extrabold text-[#9d251c]"
      : emphasis === "secondary"
        ? "text-[18px] font-extrabold text-[#16294d]"
        : "text-[15px] font-bold text-[#26334f]";
  const accentClassName =
    emphasis === "alert"
      ? "border-t-[#9d251c]"
      : emphasis === "primary" || emphasis === "secondary"
        ? "border-t-[#e23b2a]"
        : "border-t-[#d6dceb]";

  return (
    <div className={`flex h-[74px] min-w-[132px] flex-col justify-center rounded-[10px] border border-[#e3e1d7] border-t-4 ${accentClassName} bg-white px-3 py-2 shadow-[0_8px_20px_-20px_rgba(14,27,54,0.55)]`}>
      <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#9aa1b2]">
        {label}
      </div>
      <div className={`mt-1 leading-none ${valueClassName}`}>
        {value}
      </div>
      {subValue ? (
        <div className="mt-1 text-[11px] font-bold text-[#7b8298]">{subValue}</div>
      ) : null}
    </div>
  );
}

function PhaseSelectorStrip({
  house,
  selectedPhase,
}: {
  house: HouseView;
  selectedPhase: PhaseView;
}) {
  const selectedLabel = selectedPhase.key === "pre" ? "Pre" : `P${selectedPhase.label}`;
  const selectedSpent = selectedPhase.actual?.spentAmount ?? 0;

  return (
    <details className="group mt-3 rounded-[12px] border border-[#e3e1d7] bg-white p-3 [&>summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9aa1b2]">
            All phases
          </p>
          <p className="mt-1 text-sm font-extrabold text-[#16294d]">
            Viewing {selectedLabel} · {selectedPhase.name} · {currency(selectedSpent)} spent
          </p>
        </div>
        <span className="rounded-full bg-[#16294d] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">
          <span className="group-open:hidden">Change phase</span>
          <span className="hidden group-open:inline">Close phases</span>
        </span>
      </summary>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {house.phases.map((phase) => {
          const isSelected = phase.key === selectedPhase.key;
          const label = phase.key === "pre" ? "Pre" : `P${phase.label}`;
          const hasMoney = phaseHasMoney(phase);
          const overBudget = isPhaseOverBudget(phase);
          const spentAmount = phase.actual?.spentAmount ?? 0;
          const dotClassName = overBudget
            ? "bg-[#e23b2a]"
            : hasMoney
              ? "bg-[#2e9166]"
              : "bg-[#c7c9c1]";
          const statusLabel = isSelected ? "Open" : overBudget ? "Review" : hasMoney ? "Spent" : "Empty";
          const statusClassName = isSelected
            ? "bg-[#16294d] text-white"
            : overBudget
              ? "bg-[#fdebea] text-[#9d251c]"
              : hasMoney
                ? "bg-[#eaf7f0] text-[#1f6f4b]"
                : "bg-[#f2f1ea] text-[#7b8298]";

          return (
            <Link
              className={`rounded-[10px] border bg-white px-3 py-2.5 transition hover:border-[#16294d]/40 hover:bg-[#fbfaf7] ${
                isSelected
                  ? "border-[#16294d] shadow-[0_12px_26px_-22px_rgba(14,27,54,0.75)] ring-2 ring-[#16294d]/10"
                  : "border-[#e3e1d7]"
              }`}
              href={`/draws-budget?house=${encodeURIComponent(house.id)}&phase=${phase.key}&details=1`}
              key={phase.key}
              prefetch={false}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${dotClassName}`} />
                  <span className="font-['Barlow_Condensed',Barlow,sans-serif] text-lg font-bold text-[#16294d]">
                    {label}
                  </span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] ${statusClassName}`}>
                  {statusLabel}
                </span>
              </div>
              <div className="mt-1 truncate text-[11px] font-bold text-[#69746f]">{phase.name}</div>
              <div className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#9aa1b2]">
                Spent
              </div>
              <div className="mt-1 text-sm font-extrabold text-[#16294d]">{currency(spentAmount)}</div>
            </Link>
          );
        })}
      </div>
    </details>
  );
}

function SelectedPhasePanel({
  house,
  phase,
  schedulingStatuses,
}: {
  house: HouseView;
  phase: PhaseView;
  schedulingStatuses: Map<string, SchedulingLineStatus>;
}) {
  const chargeRows = chargeRowsForPhase(phase).map((row) => ({
    ...row,
    schedule: schedulingStatuses.get(`${house.house}:${phase.key}:${row.item}`) ?? null,
  }));

  return (
    <section className="mt-3 overflow-hidden rounded-[12px] border border-[#e3e1d7] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e1d7] bg-[#fbfaf7] px-3 py-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#e23b2a]">
            Current phase
          </p>
          <h3 className="mt-1 font-['Barlow_Condensed',Barlow,sans-serif] text-2xl font-bold uppercase leading-none text-[#16294d]">
            {phase.key === "pre" ? "Pre" : `P${phase.label}`} · {phase.name}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-[#d6dceb] bg-white px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#16294d]">
            {currency(phase.actual?.spentAmount ?? 0)} spent
          </span>
          <span className="rounded-full border border-[#d6dceb] bg-white px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#16294d]">
            {chargeRows.length} line items
          </span>
        </div>
      </div>
      <div className="p-3">
        <div className="overflow-hidden rounded-[10px] border border-[#e3e1d7]">
          <div className="grid grid-cols-[2fr_1fr_1fr_1.1fr_1.2fr_1fr_112px_52px] border-b border-[#e3e1d7] bg-[#fbfaf7] px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#7b8298]">
            <span>Line item</span>
            <span>Budget</span>
            <span>Spent</span>
            <span>Schedule</span>
            <span>Draw submitted</span>
            <span>Received</span>
            <span>Status</span>
            <span />
          </div>
          {chargeRows.map((row) => (
            <PhaseLineItemRow house={house} key={row.item} phase={phase} row={row} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PhaseLineItemRow({
  house,
  phase,
  row,
}: {
  house: HouseView;
  phase: PhaseView;
  row: ReturnType<typeof chargeRowsForPhase>[number];
}) {
  const submitted = Boolean(row.draw?.drawSubmitted);
  const requestedAmount = row.draw?.requestedAmount ?? null;
  const drawReceived = Boolean(row.draw?.drawReceived);
  const receivedAmount = row.draw?.receivedAmount ?? null;
  const received = drawReceived || (receivedAmount !== null && receivedAmount > 0);
  const drawComplete = submitted && received;
  const statusTone =
    row.status === "Completed"
      ? "border-[#b9dec9] bg-[#eaf7f0] text-[#2e9166]"
      : row.status === "Review"
        ? "border-[#ffc7bf] bg-[#fdebea] text-[#9d251c]"
        : "border-[#f4d48a] bg-[#fff6df] text-[#9a6500]";
  const scheduleTone =
    row.schedule?.status === "done"
      ? "border-[#b9dec9] bg-[#eaf7f0] text-[#1f6f4b]"
      : row.schedule?.status === "today"
        ? "border-[#c8cdd6] bg-[#f4f5f7] text-[#16294d]"
        : row.schedule?.status === "scheduled"
          ? "border-[#f4d48a] bg-[#fff6df] text-[#9a6500]"
          : row.schedule?.status === "alert"
            ? "border-[#ffc7bf] bg-[#fdebea] text-[#9d251c]"
            : "border-[#e3e1d7] bg-white text-[#7b8298]";

  return (
    <details className="group border-b border-[#f0eee6] last:border-b-0">
      <summary className="grid cursor-pointer list-none grid-cols-[2fr_1fr_1fr_1.1fr_1.2fr_1fr_112px_52px] items-center px-3 py-2 text-sm transition hover:bg-[#fbfaf7]">
        <div className="flex items-center gap-2">
          <span
            className={`grid h-6 w-6 place-items-center rounded-[7px] border text-sm font-extrabold ${
              drawComplete
                ? "border-[#2e9166] bg-[#2e9166] text-white"
                : submitted
                  ? "border-[#f4d48a] bg-[#fff6df] text-[#9a6500]"
                : "border-[#e3e1d7] bg-white text-[#7b8298]"
            }`}
          >
            {drawComplete ? "✓" : submitted ? "•" : ""}
          </span>
          <span className="font-extrabold text-[#16294d]">{row.item}</span>
        </div>
        <span className="font-semibold text-[#1b2233]">{currency(row.budgetAmount)}</span>
        <span className="font-semibold text-[#1b2233]">{currency(row.paidAmount)}</span>
        <span>
          <span className={`inline-flex rounded-[7px] border px-2 py-1 text-[11px] font-extrabold ${scheduleTone}`}>
            {row.schedule?.label ?? "Not linked"}
          </span>
          <span className="mt-0.5 block truncate text-[10px] font-bold text-[#9aa1b2]">
            {row.schedule?.taskName ?? "Scheduling app"}
          </span>
        </span>
        <span className={submitted ? "font-extrabold text-[#1f6f4b]" : "font-bold text-[#7b8298]"}>
          {submitted ? "Submitted" : "Not sent"}
          <span className="mt-0.5 block text-[10px] font-bold text-[#9aa1b2]">
            {submitted ? shortDate(row.draw?.submittedAt) : "Open item to mark"}
          </span>
        </span>
        <span className={received ? "font-extrabold text-[#16294d]" : "font-bold text-[#7b8298]"}>
          {received ? currency(receivedAmount) : "$0"}
          <span className="mt-0.5 block text-[10px] font-bold text-[#9aa1b2]">
            {received ? shortDate(row.draw?.receivedAt) : "Pending"}
          </span>
        </span>
        <span className={`w-fit rounded-[7px] border px-2 py-1 text-xs font-extrabold ${statusTone}`}>
          {row.status}
        </span>
        <span className="grid justify-items-center gap-1">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#2e9166]">
            Draws
          </span>
          <span className="grid h-7 w-7 place-items-center rounded-[7px] border border-[#b9dec9] bg-[#eaf7f0] text-[#1f6f4b] transition group-open:rotate-180">
            <ChevronDown size={14} />
          </span>
        </span>
      </summary>
      <div className="border-t border-[#f0eee6] bg-[#fbfaf7] px-11 py-3">
        <form
          action={saveDrawLineItemStatusAction}
          className="rounded-[10px] border border-[#e3e1d7] bg-white p-3"
        >
          <input name="qboBankAccountId" type="hidden" value={house.id} />
          <input name="houseName" type="hidden" value={house.house} />
          <input name="phaseKey" type="hidden" value={phase.key} />
          <input name="lineItemKey" type="hidden" value={row.itemKey} />
          <input name="lineItemName" type="hidden" value={row.item} />
          <input
            name="returnTo"
            type="hidden"
            value={`/draws-budget?house=${encodeURIComponent(house.id)}&phase=${phase.key}&details=1#${anchorIdForHouse(house.id)}`}
          />

          <input name="existingSubmittedAt" type="hidden" value={row.draw?.submittedAt ?? ""} />
          <input name="existingReceivedAt" type="hidden" value={row.draw?.receivedAt ?? ""} />

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-end">
            <label className="flex min-h-10 items-center gap-2 rounded-[9px] border border-[#e3e1d7] bg-[#fbfaf7] px-3 text-sm font-extrabold text-[#16294d]">
              <input
                className="h-4 w-4 accent-[#2e9166]"
                defaultChecked={submitted}
                name="drawSubmitted"
                type="checkbox"
              />
              Draw submitted
            </label>
            <label className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#7b8298]">
              Amount asked
              <input
                className="mt-1 h-10 w-full rounded-[8px] border border-[#d6dceb] px-3 text-sm font-bold normal-case tracking-normal text-[#16294d]"
                defaultValue={requestedAmount ?? ""}
                min="0"
                name="requestedAmount"
                placeholder="0"
                step="0.01"
                type="number"
              />
            </label>
            <label className="flex min-h-10 items-center gap-2 rounded-[9px] border border-[#e3e1d7] bg-[#fbfaf7] px-3 text-sm font-extrabold text-[#16294d]">
              <input
                className="h-4 w-4 accent-[#2e9166]"
                defaultChecked={received}
                name="drawReceived"
                type="checkbox"
              />
              Draw received
            </label>
            <label className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#7b8298]">
              Money received
              <input
                className="mt-1 h-10 w-full rounded-[8px] border border-[#d6dceb] px-3 text-sm font-bold normal-case tracking-normal text-[#16294d]"
                defaultValue={row.draw?.receivedAmount ?? ""}
                min="0"
                name="receivedAmount"
                placeholder="0"
                step="0.01"
                type="number"
              />
            </label>
            <button className="h-10 rounded-[8px] bg-[#16294d] px-4 text-xs font-extrabold uppercase tracking-[0.08em] text-white">
              Save
            </button>
          </div>

        </form>
      </div>
    </details>
  );
}
