import { NextResponse } from "next/server";

import {
  aiCsuiteExportDenied,
  authorizeAiCsuiteExportToken,
} from "@/lib/auth/ai-csuite-export-token";
import {
  getPlaidBankAccounts,
  linkPlaidAccountToHouse,
} from "@/lib/plaid/bank-store";

export const dynamic = "force-dynamic";

function requiredText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(request: Request) {
  const auth = authorizeAiCsuiteExportToken(request);

  if (!auth.ok) {
    return aiCsuiteExportDenied(auth);
  }

  const accounts = await getPlaidBankAccounts();

  return NextResponse.json(
    {
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        officialName: account.officialName,
        mask: account.mask,
        currentBalance: account.currentBalance,
        availableBalance: account.availableBalance,
        linkedHouseName: account.houseName,
        linkedQboBankAccountId: account.qboBankAccountId,
      })),
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  const auth = authorizeAiCsuiteExportToken(request);

  if (!auth.ok) {
    return aiCsuiteExportDenied(auth);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const houseName = requiredText(body?.houseName);
  const plaidAccountId = requiredText(body?.plaidAccountId);
  const qboBankAccountId = requiredText(body?.qboBankAccountId);

  if (!houseName || !plaidAccountId || !qboBankAccountId) {
    return NextResponse.json(
      { message: "Project and Plaid account are required." },
      { status: 400 },
    );
  }

  try {
    const account = await linkPlaidAccountToHouse({
      houseName,
      plaidAccountId,
      qboBankAccountId,
    });

    return NextResponse.json({ account });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to link this Plaid account.",
      },
      { status: 409 },
    );
  }
}
