import { NextResponse } from "next/server";

import { syncCfoDataLayer } from "@/lib/cfo/data-layer";

export const runtime = "nodejs";

async function runCfoSync() {
  try {
    const result = await syncCfoDataLayer();

    return NextResponse.json({
      status: "ok",
      message: "CFO data layer synced.",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: "CFO data layer sync failed.",
        detail: error instanceof Error ? error.message : "Unknown error",
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
