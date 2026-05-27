import { getFreshQboConnection, refreshQboConnection } from "@/lib/qbo/token-store";
import type { StoredQboConnectionWithTokens } from "@/lib/qbo/token-store";

const baseUrls = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
};

export async function qboApiGet(
  path: string,
  connectionOverride?: StoredQboConnectionWithTokens,
) {
  const connection = await getFreshQboConnection(connectionOverride);
  const baseUrl =
    baseUrls[connection.environment as keyof typeof baseUrls] ?? baseUrls.sandbox;
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${connection.accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();

    if (response.status === 401) {
      const refreshedConnection = await refreshQboConnection(connection);
      const retryResponse = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${refreshedConnection.accessToken}`,
        },
        cache: "no-store",
      });

      if (retryResponse.ok) {
        return retryResponse.json() as Promise<unknown>;
      }

      throw new Error(`QuickBooks API error ${retryResponse.status}: ${await retryResponse.text()}`);
    }

    throw new Error(`QuickBooks API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<unknown>;
}

export function getQboQueryPath(realmId: string, query: string) {
  return `/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=75`;
}
