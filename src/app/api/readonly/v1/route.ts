import { NextResponse } from "next/server";

import { authorizeReadOnlyKey } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only GET handlers exist under /api/readonly, so a key can never change data.
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
      },
      notes: [
        "Money is in US dollars. Dates are ISO 8601.",
        "contract.currentPrice = contract.originalPrice + contract.changeOrderTotal.",
        "phases[].draw is null when no draw has been recorded for that phase.",
        "Changes made by the AI contract reader show actorName 'Contract reader (AI)' in the activity feed.",
        "bank.plaidLastSyncedAt is when that account's Plaid item last synced. Plaid balance fields stay null until the account is linked to the project.",
        "The same read-only key can also call GET /api/plaid/accounts and GET /api/ai-csuite/finance-export. It cannot sync or link accounts.",
      ],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
