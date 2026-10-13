import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  aiCsuiteExportDenied,
  authorizeAiCsuiteExportToken,
} from "@/lib/auth/ai-csuite-export-token";
import { syncAllPlaidItems } from "@/lib/plaid/bank-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = authorizeAiCsuiteExportToken(request);

  if (!auth.ok) {
    return aiCsuiteExportDenied(auth);
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
