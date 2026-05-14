import { NextResponse } from "next/server";

import { getQboAuthorizationUrl } from "@/lib/qbo/oauth";

export function GET() {
  const authorizationUrl = getQboAuthorizationUrl();

  return NextResponse.redirect(authorizationUrl);
}
