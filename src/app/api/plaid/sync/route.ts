import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { syncAllPlaidItems } from "@/lib/plaid/bank-store";
import { authorizeApiRequest, editorRoles } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = await authorizeApiRequest(request, { roles: editorRoles, allowCronSecret: true });

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const result = await syncAllPlaidItems();

    revalidatePath("/bank-feed");
    revalidatePath("/draws-budget");

    return NextResponse.json({
      status: "ok",
      ...result,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plaid sync failed.";

    return NextResponse.json(
      {
        status: "error",
        message:
          message.includes("DATABASE_URL")
            ? "Syncing Plaid needs the database connection. Use the live Render app or add DATABASE_URL locally."
            : message,
      },
      { status: 500 },
    );
  }
}
