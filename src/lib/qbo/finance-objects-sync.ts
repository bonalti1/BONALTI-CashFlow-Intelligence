import { getQboQueryPath, qboApiGet } from "@/lib/qbo/api";
import {
  normalizeQboBill,
  normalizeQboCustomer,
  normalizeQboInvoice,
  saveFinanceObjectsSnapshot,
  type QboBill,
  type QboCustomer,
  type QboInvoice,
} from "@/lib/qbo/finance-objects-store";
import {
  getStoredQboConnection,
  type StoredQboConnectionWithTokens,
} from "@/lib/qbo/token-store";

type QueryResponse<T> = {
  QueryResponse?: Record<string, T[] | number | undefined>;
};

async function queryQboObjects<T>({
  connection,
  source,
}: {
  connection: StoredQboConnectionWithTokens;
  source: string;
}) {
  const pageSize = 1000;
  let startPosition = 1;
  const objects: T[] = [];

  while (true) {
    const query = `select * from ${source} startposition ${startPosition} maxresults ${pageSize}`;
    const data = (await qboApiGet(
      getQboQueryPath(connection.realmId, query),
      connection,
    )) as QueryResponse<T>;
    const page = data.QueryResponse?.[source] as T[] | undefined;
    const items = page ?? [];

    objects.push(...items);

    if (items.length < pageSize) {
      break;
    }

    startPosition += pageSize;
  }

  return objects;
}

export async function syncQboFinanceObjects(
  connectionOverride?: StoredQboConnectionWithTokens,
) {
  const connection = connectionOverride ?? await getStoredQboConnection();
  const warnings: string[] = [];
  let invoices: QboInvoice[] = [];
  let bills: QboBill[] = [];
  let customers: QboCustomer[] = [];

  try {
    invoices = await queryQboObjects<QboInvoice>({
      connection,
      source: "Invoice",
    });
  } catch (error) {
    warnings.push(
      `Invoice sync skipped: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    bills = await queryQboObjects<QboBill>({
      connection,
      source: "Bill",
    });
  } catch (error) {
    warnings.push(
      `Bill sync skipped: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    customers = await queryQboObjects<QboCustomer>({
      connection,
      source: "Customer",
    });
  } catch (error) {
    warnings.push(
      `Customer sync skipped: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  const snapshot = await saveFinanceObjectsSnapshot({
    realmId: connection.realmId,
    syncedAt: new Date().toISOString(),
    invoices: invoices
      .map((invoice) => normalizeQboInvoice({ realmId: connection.realmId, invoice }))
      .sort((a, b) => String(b.invoiceDate ?? "").localeCompare(String(a.invoiceDate ?? ""))),
    bills: bills
      .map((bill) => normalizeQboBill({ realmId: connection.realmId, bill }))
      .sort((a, b) => String(b.billDate ?? "").localeCompare(String(a.billDate ?? ""))),
    customers: customers
      .map((customer) => normalizeQboCustomer({ realmId: connection.realmId, customer }))
      .sort((a, b) => String(a.displayName ?? "").localeCompare(String(b.displayName ?? ""))),
    warnings,
  });

  return {
    realmId: snapshot.realmId,
    syncedAt: snapshot.syncedAt,
    invoices: snapshot.invoices.length,
    vendorBills: snapshot.bills.length,
    customers: snapshot.customers.length,
    projects: snapshot.customers.filter((customer) => customer.isProject).length,
    warnings,
  };
}
