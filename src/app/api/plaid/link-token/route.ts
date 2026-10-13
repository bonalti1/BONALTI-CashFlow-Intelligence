import { NextResponse } from "next/server";

import { createPlaidLinkToken } from "@/lib/plaid/client";
import { authorizeApiRequest, adminRoles } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = await authorizeApiRequest(request, { roles: adminRoles });

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const token = await createPlaidLinkToken();

    return NextResponse.json({
      status: "ok",
      linkToken: token.link_token,
      expiration: token.expiration,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create Plaid Link token.";

    return NextResponse.json(
      {
        status: "error",
        message,
      },
      { status: 500 },
    );
  }
}
