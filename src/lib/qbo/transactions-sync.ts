import { getQboQueryPath, qboApiGet } from "@/lib/qbo/api";
import {
  normalizeQboTransaction,
  saveTransactionsSnapshot,
  type QboMoneyTransaction,
  type SavedQboTransaction,
} from "@/lib/qbo/transactions-store";
import {
  getStoredQboConnection,
  type StoredQboConnectionWithTokens,
} from "@/lib/qbo/token-store";

type MoneyTransactionQueryResponse = {
  QueryResponse?: Record<string, QboMoneyTransaction[] | number | undefined>;
};

const moneyTransactionSources = ["Purchase", "Check", "Transfer"];

async function queryMoneyTransactions({
  connection,
  source,
}: {
  connection: StoredQboConnectionWithTokens;
  source: string;
}) {
  const pageSize = 1000;
  let startPosition = 1;
  const transactions: QboMoneyTransaction[] = [];

  while (true) {
    const query = `select * from ${source} startposition ${startPosition} maxresults ${pageSize}`;
    const data = (await qboApiGet(
      getQboQueryPath(connection.realmId, query),
      connection,
    )) as MoneyTransactionQueryResponse;
    const page = data.QueryResponse?.[source] as QboMoneyTransaction[] | undefined;
    const items = page ?? [];

    transactions.push(...items);

    if (items.length < pageSize) {
      break;
    }

    startPosition += pageSize;
  }

  return transactions;
}

export async function syncQboMoneyTransactions(
  connectionOverride?: StoredQboConnectionWithTokens,
) {
  const connection = connectionOverride ?? await getStoredQboConnection();
  const transactions: SavedQboTransaction[] = [];
  const warnings: string[] = [];

  for (const source of moneyTransactionSources) {
    try {
      const sourceTransactions = await queryMoneyTransactions({ connection, source });

      transactions.push(
        ...sourceTransactions.map((transaction) =>
          normalizeQboTransaction({
            realmId: connection.realmId,
            source,
            transaction,
          }),
        ),
      );
    } catch (error) {
      warnings.push(
        `${source} sync skipped: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  transactions.sort((a, b) => {
    const dateCompare = String(b.txnDate ?? "").localeCompare(String(a.txnDate ?? ""));

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return a.source.localeCompare(b.source) || a.id.localeCompare(b.id);
  });

  const snapshot = await saveTransactionsSnapshot({
    realmId: connection.realmId,
    syncedAt: new Date().toISOString(),
    total: transactions.length,
    transactions,
  });

  return {
    ...snapshot,
    warnings,
  };
}
