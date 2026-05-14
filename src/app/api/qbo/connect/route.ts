import { NextRequest, NextResponse } from "next/server";

import { getQboAuthorizationUrl, getQboSetupDiagnostics } from "@/lib/qbo/oauth";

function encodeState(nextPath: string | null) {
  return Buffer.from(
    JSON.stringify({
      id: crypto.randomUUID(),
      nextPath,
    }),
  ).toString("base64url");
}

export function GET(request: NextRequest) {
  const diagnostics = getQboSetupDiagnostics();

  if (!diagnostics.ready) {
    return NextResponse.json(
      {
        status: "setup_error",
        message: "QuickBooks is not ready to connect yet. Fix the Render environment variables below, then redeploy.",
        diagnostics,
      },
      { status: 500 },
    );
  }

  const nextPath = request.nextUrl.searchParams.get("next");
  const authorizationUrl = getQboAuthorizationUrl(encodeState(nextPath));

  return NextResponse.redirect(authorizationUrl);
}
