import { NextResponse } from "next/server";

import { authorizeCronSecret } from "@/lib/auth/session";
import { refreshPlaidBalances, syncPlaidTransactionsIfDue } from "@/lib/plaid/bank-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Render cron calls this with header x-cron-secret: $CRON_SECRET.
// It reads balances and, when Transactions is enabled, asks Plaid to refresh
// transactions, then stores new rows with /transactions/sync. It does not move money.
export async function POST(request: Request) {
  const authorization = authorizeCronSecret(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const result = await refreshPlaidBalances({ transactions: true });
    const sync = await syncPlaidTransactionsIfDue().catch((error: unknown) => {
      console.error("Scheduled Plaid transaction sync failed", {
        message: error instanceof Error ? error.message : "unknown",
      });

      return { synced: false as const, failures: [] };
    });

    return NextResponse.json(
      {
        ok: true,
        cached: result.cached,
        refreshed_at: result.refreshedAt,
        accounts: result.accounts,
        skipped_duplicate_items: result.skippedItems,
        transactions: result.transactions,
        transaction_sync: {
          synced: sync.synced,
          warnings: sync.failures.map((failure) => failure.message),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Scheduled Plaid refresh failed", {
      message: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json({ ok: false, message: "Could not refresh Plaid right now." }, { status: 500 });
  }
}
