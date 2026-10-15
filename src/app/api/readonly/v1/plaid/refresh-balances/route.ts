import { NextResponse } from "next/server";

import { authorizeReadOnlyKey } from "@/lib/auth/session";
import { refreshPlaidBalances } from "@/lib/plaid/bank-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Reads live balances from Plaid and stores them. It does not move money.
// The same read-only key as the other /api/readonly/v1 routes is required.
export async function POST(request: Request) {
  const authorization = await authorizeReadOnlyKey(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const result = await refreshPlaidBalances();

    return NextResponse.json(
      {
        cached: result.cached,
        refreshed_at: result.refreshedAt,
        accounts: result.accounts,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Read-only balance refresh failed", {
      message: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json({ message: "Could not refresh bank balances right now." }, { status: 500 });
  }
}
