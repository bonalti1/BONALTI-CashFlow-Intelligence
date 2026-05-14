import { NextResponse } from "next/server";

import { getConfirmedHouseName, isInternalBankAccount } from "@/lib/qbo/bank-account-map";
import { getAccountsSnapshot } from "@/lib/qbo/accounts-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const snapshot = await getAccountsSnapshot();
    const bankAccounts = snapshot.accounts.filter((account) => account.AccountType === "Bank");
    const houses = bankAccounts
      .map((account) => ({
        id: account.Id,
        house: getConfirmedHouseName(account),
        name: account.Name,
        fullyQualifiedName: account.FullyQualifiedName,
        subtype: account.AccountSubType,
        active: account.Active,
        balance: account.CurrentBalance,
      }))
      .filter((account) => account.house)
      .sort((a, b) => String(a.house).localeCompare(String(b.house)));
    const internal = bankAccounts
      .filter((account) => isInternalBankAccount(account))
      .map((account) => ({
        id: account.Id,
        name: account.Name,
        fullyQualifiedName: account.FullyQualifiedName,
        subtype: account.AccountSubType,
        active: account.Active,
        balance: account.CurrentBalance,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const needsReview = bankAccounts
      .filter((account) => !getConfirmedHouseName(account) && !isInternalBankAccount(account))
      .map((account) => ({
        id: account.Id,
        name: account.Name,
        fullyQualifiedName: account.FullyQualifiedName,
        subtype: account.AccountSubType,
        active: account.Active,
        balance: account.CurrentBalance,
      }));

    return NextResponse.json({
      status: "ok",
      syncedAt: snapshot.syncedAt,
      totalBankAccounts: bankAccounts.length,
      houseCount: houses.length,
      internalCount: internal.length,
      needsReviewCount: needsReview.length,
      houses,
      internal,
      needsReview,
    });
  } catch {
    return NextResponse.json(
      {
        status: "missing",
        message: "No Chart of Accounts snapshot exists yet. Sync QuickBooks accounts first.",
      },
      { status: 404 },
    );
  }
}

