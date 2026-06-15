import { NextResponse } from "next/server";

import {
  getHouseDashboardSummaries,
  type HouseDashboardSummary,
  type HouseDashboardSummaryPhase,
} from "@/lib/dashboard/house-dashboard-summary-store";

function phaseHasMoney(phase: HouseDashboardSummaryPhase) {
  return (phase.actual?.spentAmount ?? 0) > 0 || (phase.actual?.transactionCount ?? 0) > 0;
}

function summaryIsCompleted(summary: HouseDashboardSummary) {
  const currentPhase =
    summary.phases.find((phase) => phase.key === summary.currentPhaseKey) ?? summary.phases[0];

  return Boolean(currentPhase && currentPhase.key === "p6" && phaseHasMoney(currentPhase));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") === "completed" ? "completed" : "active";

  try {
    const summaries = await getHouseDashboardSummaries();
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load draw dashboard.";

    return NextResponse.json(
      {
        activeCount: 0,
        completedCount: 0,
        houses: [],
        message,
        status: "error",
        view,
      },
      { status: 200 },
    );
  }
}
