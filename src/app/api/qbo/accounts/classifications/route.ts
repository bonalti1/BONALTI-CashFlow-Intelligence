import { NextResponse } from "next/server";

import { classifyAccounts, summarizeClassifications } from "@/lib/qbo/account-classifier";
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
    const classifications = classifyAccounts(snapshot.accounts);

    return NextResponse.json({
      status: "ok",
      syncedAt: snapshot.syncedAt,
      total: snapshot.total,
      summary: summarizeClassifications(classifications),
      classifications,
    });
  } catch {
    return NextResponse.json(
      {
        status: "missing",
        message: "No Chart of Accounts snapshot exists yet.",
      },
      { status: 404 },
    );
  }
}
