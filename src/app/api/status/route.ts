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

function withStatusTimeout<T>(promise: Promise<T>, value: T, timeoutMs = 2000) {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => {
      resolve(value);
    }, timeoutMs);

    promise
      .then((result) => {
        resolve(result);
      })
      .catch(() => {
        resolve(value);
      })
      .finally(() => {
        clearTimeout(timer);
      });
  });
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
    withStatusTimeout(getDatabaseConnectionStatus(), {
      configured: Boolean(process.env.DATABASE_URL),
      connected: false,
      code: null,
      message: "Database status check failed.",
    }),
    withStatusTimeout(getQboConnectionStatus(), { connected: false }),
    withStatusTimeout(getAccountsSnapshotStatus(), { synced: false }),
    withStatusTimeout(getTransactionsSnapshotStatus(), { synced: false }),
    withStatusTimeout(getCfoDataStatus(), { synced: false }),
    withStatusTimeout(getCompanyBrainStatus(), { synced: false }),
    withStatusTimeout(getSchedulingConnectionStatus(), {
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
