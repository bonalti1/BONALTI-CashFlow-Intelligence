import { NextResponse } from "next/server";

import { getCfoPortfolioSummary } from "@/lib/cfo/data-layer";
import { authorizeApiRequest } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizeApiRequest(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const summary = await getCfoPortfolioSummary();

    return NextResponse.json({
      status: "ok",
      cfoDataStatus: summary.status,
      houses: summary.houses,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: "CFO portfolio summary failed.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
