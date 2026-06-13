import { NextResponse } from "next/server";

import { createPlaidLinkToken } from "@/lib/plaid/client";

export const runtime = "nodejs";

export async function POST() {
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
