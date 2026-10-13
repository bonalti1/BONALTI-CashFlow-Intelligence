import { NextResponse } from "next/server";

import { authorizeApiRequest, authorizePlaidAccountRead, editorRoles } from "@/lib/auth/session";
import { auditProjectChange } from "@/lib/audit/project-audit";
import {
  getPlaidBankAccounts,
  linkPlaidAccountToHouse,
} from "@/lib/plaid/bank-store";

export const dynamic = "force-dynamic";

function requiredText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(request: Request) {
  const authorization = await authorizePlaidAccountRead(request);

  if (!authorization.ok) {
    return authorization.response;
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
        lastSyncedAt: account.lastSyncedAt,
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
  const authorization = await authorizeApiRequest(request, { roles: editorRoles });

  if (!authorization.ok) {
    return authorization.response;
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
    const before = (await getPlaidBankAccounts()).find(
      (candidate) => candidate.qboBankAccountId === qboBankAccountId,
    );
    const account = await linkPlaidAccountToHouse({
      houseName,
      plaidAccountId,
      qboBankAccountId,
    });

    if (before?.id !== account.id) {
      await auditProjectChange({
        actor: authorization.actor,
        action: "project.bank_account_linked",
        qboBankAccountId,
        houseName,
        title: "Linked bank account",
        before: { bankAccount: before ? before.name : null },
        after: { bankAccount: account.name },
        spec: { bankAccount: { label: "Plaid bank account" } },
      });
    }

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
