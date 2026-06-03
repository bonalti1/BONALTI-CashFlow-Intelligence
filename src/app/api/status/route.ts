import { NextResponse } from "next/server";

import { getCfoDataStatus } from "@/lib/cfo/data-layer";
import { getCompanyBrainStatus } from "@/lib/company/brain-store";
import { getEnvStatus } from "@/lib/env";
import { getAccountsSnapshotStatus } from "@/lib/qbo/accounts-store";
import { getQboSetupDiagnostics } from "@/lib/qbo/oauth";
import { getQboConnectionStatus } from "@/lib/qbo/token-store";
import { getTransactionsSnapshotStatus } from "@/lib/qbo/transactions-store";

export const runtime = "nodejs";

export async function GET() {
  const qboConnection = await getQboConnectionStatus();
  const accountsSnapshot = await getAccountsSnapshotStatus();
  const transactionsSnapshot = await getTransactionsSnapshotStatus();
  const cfoDataLayer = await getCfoDataStatus();
  const companyBrain = await getCompanyBrainStatus();

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
    transactionsSnapshot,
    cfoDataLayer,
    companyBrain,
    env: getEnvStatus(),
  });
}
