import { NextResponse } from "next/server";

import { getAccountsSnapshot } from "@/lib/qbo/accounts-store";
import { authorizeApiRequest } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizeApiRequest(request);

  if (!authorization.ok) {
    return authorization.response;
  }

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
