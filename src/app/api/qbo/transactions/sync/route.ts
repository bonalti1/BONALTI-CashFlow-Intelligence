import { NextRequest, NextResponse } from "next/server";

import { getPublicAppUrl } from "@/lib/app-url";
import { syncQboMoneyTransactions } from "@/lib/qbo/transactions-sync";
import { authorizeApiRequest, editorRoles } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await authorizeApiRequest(request, { roles: editorRoles, allowCronSecret: true });

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const returnTo = request.nextUrl.searchParams.get("next");
    const snapshot = await syncQboMoneyTransactions();
    const responsePayload = {
      status: "ok",
      message: "QuickBooks checks and expense payments synced.",
      realmId: snapshot.realmId,
      syncedAt: snapshot.syncedAt,
      total: snapshot.total,
      warnings: snapshot.warnings,
    };

    if (returnTo?.startsWith("/")) {
      return NextResponse.redirect(new URL(returnTo, getPublicAppUrl()));
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: "QuickBooks transaction sync failed.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeApiRequest(request, { roles: editorRoles, allowCronSecret: true });

  if (!authorization.ok) {
    return authorization.response;
  }

  return GET(request);
}
