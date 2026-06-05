import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { syncCfoDataLayer } from "@/lib/cfo/data-layer";
import { syncCompanyBrainFromCurrentData } from "@/lib/company/brain-store";
import { getPublicAppUrl } from "@/lib/app-url";
import { syncQboAccounts } from "@/lib/qbo/accounts-sync";
import { syncQboFinanceObjects } from "@/lib/qbo/finance-objects-sync";
import { syncQboMoneyTransactions } from "@/lib/qbo/transactions-sync";
import {
  getStoredQboConnection,
  getStoredQboConnectionFromCookie,
  qboConnectionCookieName,
} from "@/lib/qbo/token-store";

export const runtime = "nodejs";

async function runAccountsSync(request: NextRequest) {
  try {
    const returnTo = request.nextUrl.searchParams.get("next");
    const cookieStore = await cookies();
    let connection;

    try {
      connection = await getStoredQboConnection();
    } catch {
      connection = getStoredQboConnectionFromCookie(
        cookieStore.get(qboConnectionCookieName)?.value,
      );
    }

    if (!connection) {
      const connectUrl = new URL("/api/qbo/connect", getPublicAppUrl());
      connectUrl.searchParams.set("next", returnTo?.startsWith("/") ? returnTo : "/house-accounts");

      return NextResponse.redirect(connectUrl);
    }

    const snapshot = await syncQboAccounts(connection);
    const transactionSnapshot = await syncQboMoneyTransactions(connection).catch((error) => ({
      total: 0,
      syncedAt: null,
      warnings: [
        `Transaction sync did not complete: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      ],
    }));
    const financeObjectsSnapshot = await syncQboFinanceObjects(connection).catch((error) => ({
      invoices: 0,
      vendorBills: 0,
      customers: 0,
      projects: 0,
      syncedAt: null,
      warnings: [
        `Invoice, bill, customer, and project sync did not complete: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      ],
    }));
    const cfoDataLayer = await syncCfoDataLayer().catch((error) => ({
      syncedAt: null,
      phaseLineItems: 0,
      housePhaseActuals: 0,
      housesCalculated: 0,
      needsReviewLineItems: 0,
      warnings: [
        `CFO data layer did not complete: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      ],
    }));
    const companyBrain = await syncCompanyBrainFromCurrentData().catch((error) => ({
      synced: false,
      warnings: [
        `Company brain did not complete: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      ],
    }));
    const responsePayload = {
      status: "ok",
      message: "Chart of Accounts synced from QuickBooks.",
      realmId: snapshot.realmId,
      syncedAt: snapshot.syncedAt,
      total: snapshot.total,
      transactionsSynced: {
        total: transactionSnapshot.total,
        syncedAt: transactionSnapshot.syncedAt,
        warnings: transactionSnapshot.warnings,
      },
      financeObjectsSynced: {
        invoices: financeObjectsSnapshot.invoices,
        vendorBills: financeObjectsSnapshot.vendorBills,
        customers: financeObjectsSnapshot.customers,
        projects: financeObjectsSnapshot.projects,
        syncedAt: financeObjectsSnapshot.syncedAt,
        warnings: financeObjectsSnapshot.warnings,
      },
      cfoDataLayer,
      companyBrain,
    };

    if (returnTo?.startsWith("/")) {
      return NextResponse.redirect(new URL(returnTo, getPublicAppUrl()));
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: "Chart of Accounts sync failed.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return runAccountsSync(request);
}

export async function GET(request: NextRequest) {
  return runAccountsSync(request);
}
