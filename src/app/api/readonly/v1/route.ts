import { NextResponse } from "next/server";

import { authorizeReadOnlyKey } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await authorizeReadOnlyKey(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  return NextResponse.json(
    {
      name: "South Texas Builders project source of truth (read-only)",
      key: authorization.apiKey.name,
      endpoints: {
        projects: {
          path: "/api/readonly/v1/projects",
          description:
            "Every project with contract facts, change orders, holdback, the linked Plaid bank balance and last sync time, phase budgets and spending, draw requests and payments, and uploaded documents.",
        },
        activity: {
          path: "/api/readonly/v1/activity",
          description:
            "Change history: who changed what and when, with before and after values. Filters: since (ISO date), project (house name), limit (max 1000).",
        },
        refreshBalances: {
          method: "POST",
          path: "/api/readonly/v1/plaid/refresh-balances",
          description:
            "Asks Plaid for each linked bank's live balances and stores them. Returns name, mask, type, current, available, and iso_currency, plus refreshed_at. A repeat call within 5 minutes returns the saved result with cached: true. This does not move money.",
        },
        transactions: {
          method: "GET",
          path: "/api/readonly/v1/plaid/transactions",
          description:
            "Bank transactions stored from Plaid /transactions/sync. Filters: mask, account_id, from and to (YYYY-MM-DD). Pages with limit (default 500, max 2000) and either cursor or offset. Each row includes date, authorized_date, amount, name, merchant_name, payee, check_number, mask, account_id, pending, pending_transaction_id, payment_channel, personal_finance_category, counterparties, transfer, and is_internal_transfer. A call at most once every 5 minutes pulls new transactions from Plaid and stores them. This does not move money.",
        },
      },
      notes: [
        "Money is in US dollars. Dates are ISO 8601.",
        "contract.currentPrice = contract.originalPrice + contract.changeOrderTotal.",
        "phases[].draw is null when no draw has been recorded for that phase.",
        "Changes made by the AI contract reader show actorName 'Contract reader (AI)' in the activity feed.",
        "bank.plaidLastSyncedAt is when that account's Plaid item last synced. Plaid balance fields stay null until the account is linked to the project.",
        "The same read-only key can also call GET /api/plaid/accounts and GET /api/ai-csuite/finance-export. It cannot link accounts or move money. POST /api/readonly/v1/plaid/refresh-balances stores balances. GET /api/readonly/v1/plaid/transactions can store newly synced transactions. Neither call changes projects, draws, or payments.",
      ],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
