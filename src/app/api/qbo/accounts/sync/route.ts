import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { syncQboAccounts } from "@/lib/qbo/accounts-sync";
import {
  getStoredQboConnection,
  getStoredQboConnectionFromCookie,
  qboConnectionCookieName,
} from "@/lib/qbo/token-store";

export const runtime = "nodejs";

async function runAccountsSync(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    let connection;

    try {
      connection = await getStoredQboConnection();
    } catch {
      connection = getStoredQboConnectionFromCookie(
        cookieStore.get(qboConnectionCookieName)?.value,
      );
    }

    if (!connection) {
      const connectUrl = new URL("/api/qbo/connect", request.nextUrl.origin);
      connectUrl.searchParams.set("next", "/api/qbo/accounts/sync");

      return NextResponse.redirect(connectUrl);
    }

    const snapshot = await syncQboAccounts(connection);

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

export async function POST(request: NextRequest) {
  return runAccountsSync(request);
}

export async function GET(request: NextRequest) {
  return runAccountsSync(request);
}
