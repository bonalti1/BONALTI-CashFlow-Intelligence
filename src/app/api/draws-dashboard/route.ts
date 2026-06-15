import { NextResponse } from "next/server";

import {
  getHouseDashboardSummaries,
  type HouseDashboardSummary,
  type HouseDashboardSummaryPhase,
} from "@/lib/dashboard/house-dashboard-summary-store";
import type { DrawPhaseKey } from "@/lib/draws/draws-store";

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

function phaseHasMoney(phase: HouseDashboardSummaryPhase) {
  return (phase.actual?.spentAmount ?? 0) > 0 || (phase.actual?.transactionCount ?? 0) > 0;
}

function summaryIsCompleted(summary: HouseDashboardSummary) {
  const currentPhase =
    summary.phases.find((phase) => phase.key === summary.currentPhaseKey) ?? summary.phases[0];

  return Boolean(currentPhase && currentPhase.key === "p6" && phaseHasMoney(currentPhase));
}

function demoSummaries() {
  return demoHouses.map((house): HouseDashboardSummary & { completed: boolean } => {
    const phases = (Object.keys(phaseLabels) as DrawPhaseKey[]).map((key, index) => ({
      key,
      label: phaseLabels[key].label,
      name: phaseLabels[key].name,
      actual:
        index <= house.phaseIndex
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
      id: `demo-${house.house}`,
      house: house.house,
      bank: `${house.house} demo bank account`,
      city: house.city,
      soldPrice: house.soldPrice,
      squareFootage: house.squareFootage,
      totalSpent,
      progress: Math.min(100, Math.round((totalSpent / house.soldPrice) * 100)),
      currentPhaseKey: phases[Math.min(house.phaseIndex, phases.length - 1)].key,
      readyPhases: 0,
      needsReview: 0,
      phases,
      renderImageUrl: null,
      contractFileName: null,
      contractUploadedAt: null,
      contractPrice: null,
      contractSquareFootage: null,
      contractCity: null,
      contractSourceStatus: null,
      refreshedAt: new Date().toISOString(),
      completed: false,
    };
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") === "completed" ? "completed" : "active";

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

    return NextResponse.json({
      activeCount,
      completedCount,
      houses: visibleHouses,
      status: "ok",
      view,
    });
  } catch {
    const houses = demoSummaries();
    const visibleHouses = houses.filter((house) =>
      view === "completed" ? house.completed : !house.completed,
    );

    return NextResponse.json(
      {
        activeCount: houses.filter((house) => !house.completed).length,
        completedCount: 0,
        houses: visibleHouses,
        message: "Live database summaries are unavailable. Showing demo project cards until Render database DNS is fixed.",
        status: "fallback",
        view,
      },
      { status: 200 },
    );
  }
}
