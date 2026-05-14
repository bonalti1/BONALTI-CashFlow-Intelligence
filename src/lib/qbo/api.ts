import { getStoredQboConnection } from "@/lib/qbo/token-store";

const baseUrls = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
};

export async function qboApiGet(path: string) {
  const connection = await getStoredQboConnection();
  const baseUrl =
    baseUrls[connection.environment as keyof typeof baseUrls] ?? baseUrls.sandbox;
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${connection.accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(`QuickBooks API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<unknown>;
}

export function getQboQueryPath(realmId: string, query: string) {
  return `/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=75`;
}
