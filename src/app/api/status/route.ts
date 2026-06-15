import { NextResponse } from "next/server";

import { getCfoDataStatus } from "@/lib/cfo/data-layer";
import { getCompanyBrainStatus } from "@/lib/company/brain-store";
import { getDatabaseConnectionStatus } from "@/lib/db/raw";
import { getEnvStatus } from "@/lib/env";
import { getAccountsSnapshotStatus } from "@/lib/qbo/accounts-store";
import { getQboSetupDiagnostics } from "@/lib/qbo/oauth";
import { getQboConnectionStatus } from "@/lib/qbo/token-store";
import { getTransactionsSnapshotStatus } from "@/lib/qbo/transactions-store";
import { getSchedulingConnectionStatus } from "@/lib/scheduling/status-store";

export const runtime = "nodejs";

function fallback<T>(promise: Promise<T>, value: T) {
  return promise.catch(() => value);
}

export async function GET() {
  const [
    database,
    qboConnection,
    accountsSnapshot,
    transactionsSnapshot,
    cfoDataLayer,
    companyBrain,
    scheduling,
  ] = await Promise.all([
    fallback(getDatabaseConnectionStatus(), {
      configured: Boolean(process.env.DATABASE_URL),
      connected: false,
      code: null,
      message: "Database status check failed.",
    }),
    fallback(getQboConnectionStatus(), { connected: false }),
    fallback(getAccountsSnapshotStatus(), { synced: false }),
    fallback(getTransactionsSnapshotStatus(), { synced: false }),
    fallback(getCfoDataStatus(), { synced: false }),
    fallback(getCompanyBrainStatus(), { synced: false }),
    fallback(getSchedulingConnectionStatus(), {
      connected: false,
      activeProjects: 0,
      completedProjects: 0,
      projectsWithRender: 0,
      boardKey: process.env.SCHEDULING_BOARD_KEY ?? "stb_board_v1",
    }),
  ]);

  return NextResponse.json({
    app: "South Texas Builders Project Health",
    connected: {
      quickBooks: qboConnection.connected,
      database: database.connected,
      ai: Boolean(process.env.OPENAI_API_KEY),
      scheduling: scheduling.connected,
    },
    database,
    qboConnection,
    qboSetup: getQboSetupDiagnostics(),
    accountsSnapshot,
    transactionsSnapshot,
    scheduling,
    cfoDataLayer,
    companyBrain,
    env: getEnvStatus(),
  });
}
