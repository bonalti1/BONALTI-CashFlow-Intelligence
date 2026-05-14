import { NextRequest, NextResponse } from "next/server";

import { requireEnv } from "@/lib/env";
import { createQboOAuthClient } from "@/lib/qbo/oauth";
import {
  qboConnectionCookieName,
  saveQboConnection,
  sealStoredQboConnectionForCookie,
} from "@/lib/qbo/token-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const realmId = searchParams.get("realmId");
  const code = searchParams.get("code");

  if (!code || !realmId) {
    return NextResponse.json(
      {
        status: "error",
        message: "QuickBooks did not send back the code and company ID we need.",
      },
      { status: 400 },
    );
  }

  try {
    const oauthClient = createQboOAuthClient();
    const authResponse = await oauthClient.createToken(request.url);
    const token = authResponse.getToken();
    const connection = await saveQboConnection({
      realmId,
      environment: requireEnv("QBO_ENVIRONMENT"),
      token,
    });

    const response = NextResponse.json({
      status: "connected",
      message: "QuickBooks connected successfully. Tokens were saved encrypted.",
      realmId: connection.realmId,
      environment: connection.environment,
      connectedAt: connection.connectedAt,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
    });

    response.cookies.set(qboConnectionCookieName, sealStoredQboConnectionForCookie(connection), {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "QuickBooks sent us back correctly, but the token exchange failed. The one-time code may have expired, so click Connect again.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
