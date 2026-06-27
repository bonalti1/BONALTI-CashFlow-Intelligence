import { NextResponse } from "next/server";

import {
  getHouseDashboardSummaries,
  type HouseDashboardSummary,
} from "@/lib/dashboard/house-dashboard-summary-store";
import type { DrawPhaseKey } from "@/lib/draws/draws-store";
import {
  getSchedulingProjectVisualList,
  type SchedulingProjectVisual,
} from "@/lib/scheduling/status-store";

export const dynamic = "force-dynamic";

const dashboardCacheMs = 30_000;

type DrawsDashboardPayload = {
  activeCount: number;
  completedCount: number;
  houses: Array<HouseDashboardSummary & { completed: boolean }>;
  message?: string;
  status: "ok" | "fallback";
  view: "active" | "completed";
};

const dashboardCache = new Map<
  string,
  {
    expiresAt: number;
    payload: DrawsDashboardPayload;
  }
>();

const phaseLabels: Record<DrawPhaseKey, { label: string; name: string }> = {
  pre: { label: "Pre", name: "Pre Phase" },
  p1: { label: "1", name: "Foundation" },
  p2: { label: "2", name: "Framing / Dry-in" },
  p3: { label: "3", name: "Rough Trades" },
  p4: { label: "4", name: "Exterior / Floors" },
  p5: { label: "5", name: "Interior" },
  p6: { label: "6", name: "Final" },
};

const demoHouses = [
  { house: "Cepeda", city: "Alice", soldPrice: 429900, squareFootage: 3391, phaseIndex: 4 },
  { house: "Chavez", city: "Alice", soldPrice: 265000, squareFootage: 2300, phaseIndex: 4 },
  { house: "Delgadillo", city: "Alice", soldPrice: 275000, squareFootage: 2380, phaseIndex: 2 },
  { house: "Gonzalez", city: "Alice", soldPrice: 255000, squareFootage: 2225, phaseIndex: 2 },
  { house: "Lot 6", city: "Alice", soldPrice: 319000, squareFootage: 2891, phaseIndex: 5 },
  { house: "Pulido", city: "Alice", soldPrice: 295000, squareFootage: 2510, phaseIndex: 5 },
] as const;

function withDashboardTimeout<T>(promise: Promise<T>, timeoutMs = 2000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Dashboard summary read timed out."));
    }, timeoutMs);

    promise
      .then((result) => {
        resolve(result);
      })
      .catch((error) => {
        reject(error);
      })
      .finally(() => {
        clearTimeout(timer);
      });
  });
}

function summaryIsCompleted(summary: HouseDashboardSummary) {
  return summary.projectStatus === "completed" || summary.projectStatus === "closed_out";
}

function summaryFromFallbackHouse(
  house: {
    house: string;
    city: string | null;
    soldPrice: number | null;
    squareFootage: number | null;
    phaseIndex: number;
    renderImageUrl?: string | null;
  },
  houseIndex: number,
) {
    const phases = (Object.keys(phaseLabels) as DrawPhaseKey[]).map((key, index) => ({
      key,
      label: phaseLabels[key].label,
      name: phaseLabels[key].name,
      actual:
        index <= house.phaseIndex && house.soldPrice
          ? {
              bankAccountQboId: `demo-${house.house}`,
              budgetAmount: Math.round(house.soldPrice * 0.1),
              houseName: house.house,
              phaseKey: key,
              phaseLabel: phaseLabels[key].label,
              phaseName: phaseLabels[key].name,
              overBudgetAmount: 0,
              spentAmount: Math.round(house.soldPrice * 0.065),
              status: "on_track" as const,
              transactionCount: 2,
            }
          : null,
      draw: null,
    }));
    const totalSpent = phases.reduce(
      (total, phase) => total + (phase.actual?.spentAmount ?? 0),
      0,
    );

    return {
      id: `demo-${houseIndex}-${house.house}`,
      house: house.house,
      bank: `${house.house} demo bank account`,
      city: house.city,
      soldPrice: house.soldPrice,
      squareFootage: house.squareFootage,
      totalSpent,
      progress:
        house.soldPrice && house.soldPrice > 0
          ? Math.min(100, Math.round((totalSpent / house.soldPrice) * 100))
          : 0,
      currentPhaseKey: phases[Math.min(house.phaseIndex, phases.length - 1)].key,
      readyPhases: 0,
      needsReview: 0,
      phases,
      renderImageUrl: house.renderImageUrl ?? null,
      contractFileName: null,
      contractUploadedAt: null,
      contractPrice: null,
      contractSquareFootage: null,
      contractCity: null,
      contractSourceStatus: null,
      projectStatus: "active",
      projectNumber: null,
      holdbackAmount: null,
      holdbackNotes: null,
      refreshedAt: new Date().toISOString(),
      completed: false,
    };
}

function demoSummaries() {
  return demoHouses.map((house, index) => summaryFromFallbackHouse(house, index));
}

function schedulingFallbackSummaries(projects: SchedulingProjectVisual[]) {
  return projects.map((project, index) =>
    summaryFromFallbackHouse(
      {
        house: project.projectName,
        city: null,
        soldPrice: null,
        squareFootage: null,
        phaseIndex: 0,
        renderImageUrl: project.renderImage,
      },
      index,
    ),
  );
}

function timedJson(payload: DrawsDashboardPayload, startedAt: number, cacheStatus: "hit" | "miss") {
  const durationMs = Math.round(performance.now() - startedAt);

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      "Server-Timing": `draws-dashboard;dur=${durationMs};desc="${cacheStatus}"`,
    },
  });
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") === "completed" ? "completed" : "active";
  const force = searchParams.get("force") === "1";
  const cacheKey = view;

  if (!force) {
    const cached = dashboardCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return timedJson(cached.payload, startedAt, "hit");
    }
  }

  try {
    const summaries = await withDashboardTimeout(getHouseDashboardSummaries());
    const houses = summaries.map((summary) => ({
      ...summary,
      completed: summaryIsCompleted(summary),
    }));
    const activeCount = houses.filter((house) => !house.completed).length;
    const completedCount = houses.length - activeCount;
    const visibleHouses = houses.filter((house) =>
      view === "completed" ? house.completed : !house.completed,
    );
    const payload: DrawsDashboardPayload = {
      activeCount,
      completedCount,
      houses: visibleHouses,
      status: "ok",
      view,
    };

    dashboardCache.set(cacheKey, {
      expiresAt: Date.now() + dashboardCacheMs,
      payload,
    });

    return timedJson(payload, startedAt, "miss");
  } catch {
    const schedulingHouses = await withDashboardTimeout(
      getSchedulingProjectVisualList(),
      1500,
    ).catch(() => []);
    const fallbackHouses =
      schedulingHouses.length > 0 ? schedulingFallbackSummaries(schedulingHouses) : demoSummaries();
    const houses = fallbackHouses;
    const visibleHouses = houses.filter((house) =>
      view === "completed" ? house.completed : !house.completed,
    );
    const payload: DrawsDashboardPayload = {
      activeCount: houses.filter((house) => !house.completed).length,
      completedCount: 0,
      houses: visibleHouses,
      message: "Live database summaries are unavailable. Showing demo project cards until Render database DNS is fixed.",
      status: "fallback",
      view,
    };

    dashboardCache.set(cacheKey, {
      expiresAt: Date.now() + dashboardCacheMs,
      payload,
    });

    return timedJson(payload, startedAt, "miss");
  }
}
