import { NextResponse } from "next/server";

import { getEnvStatus } from "@/lib/env";
import { getAccountsSnapshotStatus } from "@/lib/qbo/accounts-store";
import { getQboSetupDiagnostics } from "@/lib/qbo/oauth";
import { getQboConnectionStatus } from "@/lib/qbo/token-store";

export const runtime = "nodejs";

export async function GET() {
  const qboConnection = await getQboConnectionStatus();
  const accountsSnapshot = await getAccountsSnapshotStatus();

  return NextResponse.json({
    app: "South Texas Builders Project Health",
    connected: {
      quickBooks: qboConnection.connected,
      database: Boolean(process.env.DATABASE_URL),
      ai: Boolean(process.env.OPENAI_API_KEY),
    },
    qboConnection,
    qboSetup: getQboSetupDiagnostics(),
    accountsSnapshot,
    env: getEnvStatus(),
  });
}
