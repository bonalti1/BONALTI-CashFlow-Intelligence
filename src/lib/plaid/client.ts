export type PlaidAccount = {
  account_id: string;
  balances: {
    available?: number | null;
    current?: number | null;
    iso_currency_code?: string | null;
  };
  mask?: string | null;
  name: string;
  official_name?: string | null;
  subtype?: string | null;
  type?: string | null;
};

export type PlaidTransaction = {
  account_id: string;
  account_owner?: string | null;
  amount: number;
  authorized_date?: string | null;
  category?: string[] | null;
  date: string;
  iso_currency_code?: string | null;
  merchant_name?: string | null;
  name: string;
  payment_channel?: string | null;
  pending: boolean;
  personal_finance_category?: unknown;
  transaction_id: string;
};

export type PlaidRemovedTransaction = {
  account_id?: string | null;
  transaction_id: string;
};

const plaidHosts = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
} as const;

type PlaidEnvironment = keyof typeof plaidHosts;

function plaidEnvironment(): PlaidEnvironment {
  const value = process.env.PLAID_ENV ?? "sandbox";

  if (value === "sandbox" || value === "development" || value === "production") {
    return value;
  }

  return "sandbox";
}

export function plaidConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function plaidEnvironmentLabel() {
  return plaidEnvironment();
}

async function plaidRequest<T>(path: string, body: Record<string, unknown>) {
  if (!plaidConfigured()) {
    throw new Error("Plaid keys are not configured.");
  }

  const response = await fetch(`${plaidHosts[plaidEnvironment()]}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...body,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error_code?: string;
    error_message?: string;
  };

  if (!response.ok) {
    throw new Error(
      data.error_message || data.error_code || `Plaid request failed with ${response.status}.`,
    );
  }

  return data;
}

export async function createPlaidLinkToken() {
  const redirectUri = process.env.PLAID_REDIRECT_URI;

  return plaidRequest<{
    expiration: string;
    link_token: string;
    request_id: string;
  }>("/link/token/create", {
    client_name: "South Texas Builders Cashflow",
    country_codes: ["US"],
    language: "en",
    products: ["transactions"],
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    transactions: {
      days_requested: 730,
    },
    user: {
      client_user_id: "south-texas-builders",
    },
  });
}

export async function exchangePublicToken(publicToken: string) {
  return plaidRequest<{
    access_token: string;
    item_id: string;
    request_id: string;
  }>("/item/public_token/exchange", {
    public_token: publicToken,
  });
}

export async function getPlaidAccounts(accessToken: string) {
  return plaidRequest<{
    accounts: PlaidAccount[];
    item: {
      institution_id?: string | null;
      item_id: string;
    };
    request_id: string;
  }>("/accounts/get", {
    access_token: accessToken,
  });
}

export async function syncPlaidTransactions(accessToken: string, cursor: string | null) {
  return plaidRequest<{
    accounts: PlaidAccount[];
    added: PlaidTransaction[];
    has_more: boolean;
    modified: PlaidTransaction[];
    next_cursor: string;
    removed: PlaidRemovedTransaction[];
    request_id: string;
  }>("/transactions/sync", {
    access_token: accessToken,
    cursor,
    count: 500,
    options: {
      include_original_description: true,
    },
  });
}
