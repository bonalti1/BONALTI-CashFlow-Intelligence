import { getQboQueryPath, qboApiGet } from "@/lib/qbo/api";
import { saveAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import {
  getStoredQboConnection,
  type StoredQboConnectionWithTokens,
} from "@/lib/qbo/token-store";

type AccountQueryResponse = {
  QueryResponse?: {
    Account?: QboAccount[];
    maxResults?: number;
  };
};

export async function syncQboAccounts(connectionOverride?: StoredQboConnectionWithTokens) {
  const connection = connectionOverride ?? await getStoredQboConnection();
  const pageSize = 1000;
  let startPosition = 1;
  const accounts: QboAccount[] = [];

  while (true) {
    const query = `select * from Account startposition ${startPosition} maxresults ${pageSize}`;
    const data = (await qboApiGet(
      getQboQueryPath(connection.realmId, query),
    )) as AccountQueryResponse;
    const page = data.QueryResponse?.Account ?? [];

    accounts.push(...page);

    if (page.length < pageSize) {
      break;
    }

    startPosition += pageSize;
  }

  accounts.sort((a, b) =>
    (a.FullyQualifiedName ?? a.Name).localeCompare(b.FullyQualifiedName ?? b.Name),
  );

  return saveAccountsSnapshot({
    realmId: connection.realmId,
    syncedAt: new Date().toISOString(),
    total: accounts.length,
    accounts,
  });
}
