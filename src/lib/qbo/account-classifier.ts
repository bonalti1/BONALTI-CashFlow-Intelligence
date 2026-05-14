import type { QboAccount } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName, isInternalBankAccount } from "@/lib/qbo/bank-account-map";

export type AccountClassification = {
  account: QboAccount;
  role:
    | "confirmed_house_bank"
    | "internal_bank_account"
    | "house_bank_candidate"
    | "construction_cost_candidate"
    | "job_site_overhead_candidate"
    | "non_project_account"
    | "needs_review";
  confidence: "high" | "medium" | "low";
  reason: string;
};

const constructionWords = [
  "labor",
  "materials",
  "material",
  "job",
  "permit",
  "permits",
  "rental",
  "equipment",
  "disposal",
  "installation",
  "maintenance",
  "repairs",
];

const overheadWords = ["dumpster", "toilet", "disposal", "rental"];

const nonProjectTypes = new Set([
  "Accounts Payable",
  "Accounts Receivable",
  "Credit Card",
  "Equity",
  "Fixed Asset",
  "Income",
  "Long Term Liability",
  "Other Current Asset",
  "Other Current Liability",
  "Other Expense",
  "Other Income",
]);

function accountName(account: QboAccount) {
  return (account.FullyQualifiedName ?? account.Name).toLowerCase();
}

export function classifyAccount(account: QboAccount): AccountClassification {
  const name = accountName(account);

  if (account.AccountType === "Bank") {
    const houseName = getConfirmedHouseName(account);

    if (houseName) {
      return {
        account,
        role: "confirmed_house_bank",
        confidence: "high",
        reason: `Confirmed by user as house/project bank account: ${houseName}.`,
      };
    }

    if (isInternalBankAccount(account)) {
      return {
        account,
        role: "internal_bank_account",
        confidence: "high",
        reason: "Confirmed as company/internal bank account, not a house.",
      };
    }

    return {
      account,
      role: "house_bank_candidate",
      confidence: "low",
      reason: "Bank account was not in the confirmed house list or internal-account list.",
    };
  }

  if (overheadWords.some((word) => name.includes(word))) {
    return {
      account,
      role: "job_site_overhead_candidate",
      confidence: "medium",
      reason: "Name looks like a site-running cost that may stay outside progress percent.",
    };
  }

  if (
    account.AccountType === "Cost of Goods Sold" ||
    (account.AccountType === "Expense" &&
      constructionWords.some((word) => name.includes(word)))
  ) {
    return {
      account,
      role: "construction_cost_candidate",
      confidence: account.AccountType === "Cost of Goods Sold" ? "high" : "medium",
      reason: "Account type or name looks related to job costs.",
    };
  }

  if (account.AccountType && nonProjectTypes.has(account.AccountType)) {
    return {
      account,
      role: "non_project_account",
      confidence: "high",
      reason: "This account type is not part of per-house construction cost tracking.",
    };
  }

  return {
    account,
    role: "needs_review",
    confidence: "low",
    reason: "The current name/type does not clearly map to the project-health model.",
  };
}

export function classifyAccounts(accounts: QboAccount[]) {
  return accounts.map(classifyAccount);
}

export function summarizeClassifications(classifications: AccountClassification[]) {
  return classifications.reduce<Record<AccountClassification["role"], number>>(
    (summary, item) => {
      summary[item.role] = (summary[item.role] ?? 0) + 1;
      return summary;
    },
    {
      confirmed_house_bank: 0,
      internal_bank_account: 0,
      house_bank_candidate: 0,
      construction_cost_candidate: 0,
      job_site_overhead_candidate: 0,
      non_project_account: 0,
      needs_review: 0,
    },
  );
}
