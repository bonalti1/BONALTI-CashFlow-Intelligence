import { NextRequest, NextResponse } from "next/server";

import { getPublicAppUrl } from "@/lib/app-url";
import { requireEnv } from "@/lib/env";
import { syncQboAccounts } from "@/lib/qbo/accounts-sync";
import { createQboOAuthClient } from "@/lib/qbo/oauth";
import {
  qboConnectionCookieName,
  saveQboConnection,
  sealStoredQboConnectionForCookie,
} from "@/lib/qbo/token-store";

export const runtime = "nodejs";

function decodeNextPath(state: string | null) {
  if (!state) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      nextPath?: string;
    };

    if (!parsed.nextPath?.startsWith("/")) {
      return null;
    }

    return parsed.nextPath;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const realmId = searchParams.get("realmId");
  const code = searchParams.get("code");
  const nextPath = decodeNextPath(searchParams.get("state"));

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
    const connectionWithTokens = {
      ...connection,
      accessToken: token.access_token!,
      refreshToken: token.refresh_token!,
    };
    const accountsSnapshot = await syncQboAccounts(connectionWithTokens);

    const responsePayload = {
      status: "connected",
      message:
        "QuickBooks connected successfully. Chart of Accounts was synced from QuickBooks.",
      realmId: connection.realmId,
      environment: connection.environment,
      connectedAt: connection.connectedAt,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
      accountsSynced: {
        total: accountsSnapshot.total,
        syncedAt: accountsSnapshot.syncedAt,
      },
    };
    const response = nextPath
      ? NextResponse.redirect(new URL(nextPath, getPublicAppUrl()))
      : NextResponse.json(responsePayload);

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
