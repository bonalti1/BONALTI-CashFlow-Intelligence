"use server";

import { revalidatePath } from "next/cache";

import {
  getPlaidBankAccounts,
  linkPlaidAccountToHouse,
  syncAllPlaidItems,
} from "@/lib/plaid/bank-store";

// Bank Feed and project cards call these actions instead of the public JSON
// routes. Next.js accepts the actions only from the same origin, so the
// browser never receives AI_CSUITE_EXPORT_TOKEN.

function requiredText(value: string) {
  const text = value.trim();

  return text || null;
}

function syncErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Plaid sync failed.";

  if (message.includes("DATABASE_URL")) {
    return "Syncing Plaid needs the database connection. Use the live Render app or add DATABASE_URL locally.";
  }

  return message;
}

export async function listPlaidAccountsForLink() {
  try {
    const accounts = await getPlaidBankAccounts();

    return {
      ok: true as const,
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
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Unable to load Plaid accounts.",
    };
  }
}

export async function linkProjectPlaidAccount(input: {
  houseName: string;
  plaidAccountId: string;
  qboBankAccountId: string;
}) {
  const houseName = requiredText(input.houseName);
  const plaidAccountId = requiredText(input.plaidAccountId);
  const qboBankAccountId = requiredText(input.qboBankAccountId);

  if (!houseName || !plaidAccountId || !qboBankAccountId) {
    return {
      ok: false as const,
      message: "Project and Plaid account are required.",
    };
  }

  try {
    const account = await linkPlaidAccountToHouse({
      houseName,
      plaidAccountId,
      qboBankAccountId,
    });

    revalidatePath("/bank-feed");
    revalidatePath("/draws-budget");

    return {
      ok: true as const,
      account,
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Unable to link this Plaid account.",
    };
  }
}

export async function syncPlaidBankFeed() {
  try {
    const result = await syncAllPlaidItems();

    revalidatePath("/bank-feed");
    revalidatePath("/draws-budget");

    return {
      ok: true as const,
      ...result,
      syncedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false as const,
      message: syncErrorMessage(error),
    };
  }
}
