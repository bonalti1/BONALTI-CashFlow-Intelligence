import { NextResponse } from "next/server";

import { syncCompanyBrainFromCurrentData } from "@/lib/company/brain-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const companyBrain = await syncCompanyBrainFromCurrentData();

    return NextResponse.json({
      status: "ok",
      message: "Company brain synced from the current company data tables.",
      companyBrain,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: "Company brain sync failed.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  return GET();
}
