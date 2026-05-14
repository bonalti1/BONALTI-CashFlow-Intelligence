import { NextResponse } from "next/server";

import { getQboAuthorizationUrl, getQboSetupDiagnostics } from "@/lib/qbo/oauth";

export function GET() {
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

  const authorizationUrl = getQboAuthorizationUrl();

  return NextResponse.redirect(authorizationUrl);
}
