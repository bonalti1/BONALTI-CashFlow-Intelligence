import { NextResponse } from "next/server";

import { syncQboAccounts } from "@/lib/qbo/accounts-sync";

export const runtime = "nodejs";

export async function POST() {
  try {
    const snapshot = await syncQboAccounts();

    return NextResponse.json({
      status: "ok",
      message: "Chart of Accounts synced from QuickBooks.",
      realmId: snapshot.realmId,
      syncedAt: snapshot.syncedAt,
      total: snapshot.total,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: "Chart of Accounts sync failed.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      status: "method_not_allowed",
      message: "Use POST for sync so a browser refresh does not accidentally run it.",
    },
    { status: 405 },
  );
}
