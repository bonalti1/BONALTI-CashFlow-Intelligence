import { NextResponse } from "next/server";

import { getQboQueryPath, qboApiGet } from "@/lib/qbo/api";
import { getStoredQboConnection } from "@/lib/qbo/token-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const connection = await getStoredQboConnection();
    const data = await qboApiGet(
      getQboQueryPath(connection.realmId, "select * from Account maxresults 5"),
    );

    return NextResponse.json({
      status: "ok",
      message: "QuickBooks read test worked. The app can read Chart of Accounts data.",
      realmId: connection.realmId,
      environment: connection.environment,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "QuickBooks is connected, but the read test failed. The token may need refresh or the app may need Accounting API permission.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
