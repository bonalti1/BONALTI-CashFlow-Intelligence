import { hasDatabaseUrl } from "@/lib/db/raw";
import { runOnce } from "@/lib/db/run-once";

async function initializeSchema() {
  const [
    { ensureAuthTables },
    { ensureAuditTable },
    { ensurePlaidTables },
    { ensureDrawTables },
    { ensureHouseDashboardSummaryTable },
    houseDetails,
    { ensureCompanyBrainSchema },
    { ensureCfoSchema },
    { ensureQboAccountTables },
    { ensureQboTransactionTables },
    { ensureQboFinanceObjectTablesForExport },
    { ensureQboConnectionTable },
  ] = await Promise.all([
    import("@/lib/auth/auth-store"),
    import("@/lib/audit/audit-log"),
    import("@/lib/plaid/bank-store"),
    import("@/lib/draws/draws-store"),
    import("@/lib/dashboard/house-dashboard-summary-store"),
    import("@/lib/houses/house-details-store"),
    import("@/lib/company/brain-store"),
    import("@/lib/cfo/data-layer"),
    import("@/lib/qbo/accounts-store"),
    import("@/lib/qbo/transactions-store"),
    import("@/lib/qbo/finance-objects-store"),
    import("@/lib/qbo/token-store"),
  ]);

  // One statement stream at startup. Request handlers then reuse the finished promise.
  await ensureAuthTables();
  await ensureAuditTable();
  await ensurePlaidTables();
  await ensureDrawTables();
  await ensureHouseDashboardSummaryTable();
  await houseDetails.ensureHouseDetailsTable();
  await houseDetails.ensureHouseChangeOrdersTable();
  await houseDetails.ensureHouseProjectDocumentsTable();
  await ensureCompanyBrainSchema();
  await ensureCfoSchema();
  await ensureQboAccountTables();
  await ensureQboTransactionTables();
  await ensureQboFinanceObjectTablesForExport();
  await ensureQboConnectionTable();
}

const warmup = runOnce(initializeSchema);

export function warmupSchema() {
  if (!hasDatabaseUrl()) {
    return Promise.resolve();
  }

  return warmup();
}
