import { NextResponse } from "next/server";

import { getAccountsSnapshot } from "@/lib/qbo/accounts-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const snapshot = await getAccountsSnapshot();

    return NextResponse.json({
      status: "ok",
      ...snapshot,
    });
  } catch {
    return NextResponse.json(
      {
        status: "missing",
        message: "No Chart of Accounts snapshot exists yet. Run POST /api/qbo/accounts/sync.",
      },
      { status: 404 },
    );
  }
}
