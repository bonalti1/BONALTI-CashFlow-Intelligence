import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { syncQboAccounts } from "@/lib/qbo/accounts-sync";
import {
  getStoredQboConnection,
  getStoredQboConnectionFromCookie,
  qboConnectionCookieName,
} from "@/lib/qbo/token-store";

export const runtime = "nodejs";

export async function POST() {
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
      throw new Error("QuickBooks token was not found. Connect QuickBooks again.");
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

export async function GET() {
  return NextResponse.json(
    {
      status: "method_not_allowed",
      message: "Use POST for sync so a browser refresh does not accidentally run it.",
    },
    { status: 405 },
  );
}
