import { NextResponse } from "next/server";

import { authorizeReadOnlyKey } from "@/lib/auth/session";
import {
  clampTransactionLimit,
  clampTransactionOffset,
  parseIsoDate,
} from "@/lib/plaid/transaction-page";
import { cursorFromParam, listPlaidTransactions } from "@/lib/plaid/transactions-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function queryValue(url: URL, name: string) {
  const value = url.searchParams.get(name);

  return value === null ? null : value.trim();
}

// Reads stored /transactions/sync rows. The same read-only key as the other
// /api/readonly/v1 routes is required. This does not move money.
export async function GET(request: Request) {
  const authorization = await authorizeReadOnlyKey(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  const url = new URL(request.url);
  const limit = clampTransactionLimit(queryValue(url, "limit"));
  const offset = clampTransactionOffset(queryValue(url, "offset"));
  const from = parseIsoDate(queryValue(url, "from"));
  const to = parseIsoDate(queryValue(url, "to"));
  const cursor = cursorFromParam(queryValue(url, "cursor"));

  if (!limit.ok || !offset.ok || !from.ok || !to.ok || !cursor.ok) {
    return NextResponse.json(
      {
        message:
          "Use limit 1-2000 (default 500), offset 0 or more, from and to as YYYY-MM-DD, and a cursor from a previous page.",
      },
      { status: 400 },
    );
  }

  const mask = queryValue(url, "mask");
  const accountId = queryValue(url, "account_id");

  try {
    const page = await listPlaidTransactions({
      accountId: accountId || null,
      mask: mask || null,
      from: from.date,
      to: to.date,
      cursor: cursor.cursor,
      offset: offset.offset,
      limit: limit.limit,
    });

    return NextResponse.json(
      {
        transactions: page.transactions,
        limit: limit.limit,
        offset: cursor.cursor ? 0 : offset.offset,
        has_more: page.hasMore,
        next_cursor: page.nextCursor,
        ...(page.syncWarnings.length > 0 ? { sync_warnings: page.syncWarnings } : {}),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Read-only Plaid transactions failed", {
      message: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json({ message: "Could not load bank transactions right now." }, { status: 500 });
  }
}
