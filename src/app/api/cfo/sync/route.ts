import { NextResponse } from "next/server";

import { syncCfoDataLayer } from "@/lib/cfo/data-layer";
import { refreshHouseDashboardSummaries } from "@/lib/dashboard/house-dashboard-summary-store";

export const runtime = "nodejs";

function sanitizedSyncError(error: unknown) {
  const detail = error instanceof Error ? error.message : "";

  if (
    detail.includes("getaddrinfo") ||
    detail.includes("ENOTFOUND") ||
    detail.includes("DATABASE_URL")
  ) {
    return "Database is configured but unreachable. Fix the Render database connection, then rebuild summaries.";
  }

  return "CFO data layer sync failed.";
}

async function runCfoSync() {
  try {
    const result = await syncCfoDataLayer();
    const dashboardSummaries = await refreshHouseDashboardSummaries();

    return NextResponse.json({
      status: "ok",
      message: "CFO data layer synced.",
      dashboardSummaries: dashboardSummaries.length,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: "CFO data layer sync failed.",
        detail: sanitizedSyncError(error),
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return runCfoSync();
}

export async function POST() {
  return runCfoSync();
}
