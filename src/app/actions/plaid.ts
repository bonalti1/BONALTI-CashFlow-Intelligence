"use server";

import { revalidatePath } from "next/cache";

import { requireEditor, requireUser } from "@/lib/auth/session";
import {
  getPlaidBankAccounts,
  linkPlaidAccountToHouse,
  refreshLiveBalances,
  syncAllPlaidItems,
} from "@/lib/plaid/bank-store";

// Signed-in pages call these actions. The public JSON routes stay behind a
// bearer token or session, so the browser never receives a key.

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
  await requireUser();

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
  await requireEditor();
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
  await requireEditor();

  try {
    const result = await syncAllPlaidItems();

    revalidatePath("/bank-feed");
    revalidatePath("/draws-budget");

    if (result.failures.length > 0) {
      const synced = result.items - result.failures.length;
      const problems = result.failures
        .map((failure) => `${failure.institutionName}: ${failure.message}`)
        .join(" ");

      return {
        ok: false as const,
        message: `Synced ${synced} of ${result.items} bank logins. ${problems}`,
      };
    }

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

// Plaid bills each live balance check, so only admins trigger one: when an admin opens the
// Bank Feed or presses "Check again". Everyone else sees the result of the last admin check.
// A bank checked live in the last minute is reused (10 seconds for "Check again").
export async function checkLiveBalances({ force = false }: { force?: boolean } = {}) {
  const user = await requireUser();

  if (user.role !== "admin") {
    return {
      ok: false as const,
      message: "Live balance checks run when an admin opens this page.",
    };
  }

  try {
    const result = await refreshLiveBalances({ reuseWithinMs: force ? 10_000 : 60_000 });

    revalidatePath("/bank-feed");

    return { ok: true as const, ...result };
  } catch (error) {
    console.error("Live balance check failed", error);

    return {
      ok: false as const,
      message: "Could not check the banks right now. The balances shown are the last ones received.",
    };
  }
}
