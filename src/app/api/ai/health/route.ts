import { NextResponse } from "next/server";

import { createAgentClient, defaultAgentModel } from "@/lib/agent/client";
import { saveCompanyAiReport } from "@/lib/company/brain-store";
import { getEnvStatus } from "@/lib/env";
import { getHouseDetailsMap } from "@/lib/houses/house-details-store";
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName } from "@/lib/qbo/bank-account-map";
import {
  getTransactionsByBankAccount,
  getTransactionsSnapshotStatus,
} from "@/lib/qbo/transactions-store";

export const dynamic = "force-dynamic";

const TARGET_PROFIT_PER_HOME = 60_000;
const DRAFT_TOTAL_BUDGET_PERCENT = 0.75578;
const PHASE_ONE_BUDGET_PERCENT = 0.10778;
const SIMPLE_REPORTING_RULES = [
  "Every report, summary, and answer must be written at an 8th grade reading level.",
  "Use short sentences and plain words.",
  "Avoid accounting, finance, and software jargon. If a hard word is needed, explain it in simple words.",
  "Use clear bullets when it makes the answer easier to read.",
  "Say what matters, why it matters, and what to check next.",
  "If the data is missing, old, or not fully mapped, say that clearly.",
  "Never invent reasons, vendors, checks, or project facts.",
  "This app is read-only. Never claim you changed QuickBooks, moved money, sent messages, or edited data.",
].join(" ");

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function accountName(account: QboAccount) {
  return account.FullyQualifiedName ?? account.Name;
}

function bankBalance(account: QboAccount) {
  return account.CurrentBalance ?? 0;
}

async function buildHealthContext() {
  const [snapshot, detailsByBankAccount, transactionsByBankAccount, transactionsStatus] =
    await Promise.all([
      getAccountsSnapshot().catch(() => null),
      getHouseDetailsMap(),
      getTransactionsByBankAccount(),
      getTransactionsSnapshotStatus(),
    ]);
  const bankAccounts = snapshot?.accounts.filter((account) => account.AccountType === "Bank") ?? [];
  const rows = bankAccounts
    .map((account) => {
      const house = getConfirmedHouseName(account);

      if (!house) {
        return null;
      }

      const details = detailsByBankAccount.get(account.Id);
      const transactions = transactionsByBankAccount.get(account.Id) ?? [];
      const checksSeen = transactions.reduce(
        (total, transaction) => total + Math.abs(transaction.totalAmount),
        0,
      );
      const soldPrice = details?.soldPrice ?? null;
      const squareFootage = details?.squareFootage ?? null;
      const city = details?.city ?? null;
      const draftBudget = soldPrice ? soldPrice * DRAFT_TOTAL_BUDGET_PERCENT : null;
      const profitIfOnBudget = soldPrice && draftBudget ? soldPrice - draftBudget : null;
      const profitAfterChecksSeen = soldPrice ? soldPrice - checksSeen : null;
      const phaseOneBudget = soldPrice ? soldPrice * PHASE_ONE_BUDGET_PERCENT : null;
      const phaseOneOverage =
        phaseOneBudget && checksSeen > phaseOneBudget ? checksSeen - phaseOneBudget : 0;

      return {
        house,
        bankAccount: accountName(account),
        bankBalance: bankBalance(account),
        soldPrice,
        squareFootage,
        city,
        setupComplete: Boolean(soldPrice && squareFootage && city),
        checksSeen,
        transactionCount: transactions.length,
        draftBudget,
        profitIfOnBudget,
        profitAfterChecksSeen,
        phaseOneBudget,
        phaseOneOverage,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.house.localeCompare(b.house));
  const setupCompleteCount = rows.filter((row) => row.setupComplete).length;
  const totalOnBudgetProfit = rows.reduce((total, row) => total + (row.profitIfOnBudget ?? 0), 0);
  const targetProfit = setupCompleteCount * TARGET_PROFIT_PER_HOME;
  const totalProfitAtRisk = rows.reduce((total, row) => total + row.phaseOneOverage, 0);

  return [
    "South Texas Builders Project Health context:",
    `QuickBooks accounts snapshot: ${snapshot ? `${snapshot.total} accounts synced at ${snapshot.syncedAt}` : "not available"}.`,
    `Transactions snapshot: ${transactionsStatus.synced ? `${transactionsStatus.total} transactions synced at ${transactionsStatus.syncedAt}` : "not synced"}.`,
    `Confirmed house bank accounts: ${rows.length}. Houses with sold price, square footage, and city: ${setupCompleteCount}.`,
    `Target profit rule: ${currency(TARGET_PROFIT_PER_HOME)} per ready house. Current target profit total: ${currency(targetProfit)}.`,
    `Draft budget calculator total: ${(DRAFT_TOTAL_BUDGET_PERCENT * 100).toFixed(2)}% of sold price. Draft on-budget profit total: ${currency(totalOnBudgetProfit)}.`,
    `Provisional Phase 1 budget rule: ${(PHASE_ONE_BUDGET_PERCENT * 100).toFixed(2)}% of sold price. Current provisional profit at risk: ${currency(totalProfitAtRisk)}.`,
    "Important limitation: Phase mapping is provisional until the Chart of Accounts cleanup is finished. Do not pretend the phase overage is final if the data is not mapped cleanly.",
    "House rows:",
    ...rows.map((row) =>
      [
        `- ${row.house}`,
        `bank=${row.bankAccount}`,
        `bankBalance=${currency(row.bankBalance)}`,
        `soldPrice=${row.soldPrice ? currency(row.soldPrice) : "missing"}`,
        `sqft=${row.squareFootage ?? "missing"}`,
        `city=${row.city ?? "missing"}`,
        `checksSeen=${currency(row.checksSeen)}`,
        `transactionCount=${row.transactionCount}`,
        `profitIfOnBudget=${row.profitIfOnBudget ? currency(row.profitIfOnBudget) : "missing"}`,
        `profitAfterChecksSeen=${
          row.profitAfterChecksSeen ? currency(row.profitAfterChecksSeen) : "missing"
        }`,
        `phaseOneOverage=${currency(row.phaseOneOverage)}`,
      ].join("; "),
    ),
  ].join("\n");
}

export async function POST(request: Request) {
  const env = getEnvStatus();
  const openAiReady = Boolean(env.find((item) => item.key === "OPENAI_API_KEY")?.configured);

  if (!openAiReady) {
    return NextResponse.json(
      {
        message: "OPENAI_API_KEY is not configured yet.",
      },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";

  if (!question) {
    return NextResponse.json(
      {
        message: "Ask a question first.",
      },
      { status: 400 },
    );
  }

  const context = await buildHealthContext();
  const client = createAgentClient();
  const response = await client.responses.create({
    model: defaultAgentModel,
    input: [
      {
        role: "system",
        content: `You are the South Texas Builders read-only project health analyst. ${SIMPLE_REPORTING_RULES}`,
      },
      {
        role: "user",
        content: `${context}\n\nUser question: ${question}`,
      },
    ],
  });

  await saveCompanyAiReport({
    reportType: "project_health_answer",
    department: "finance",
    title: "Project Health AI Answer",
    question,
    answer: response.output_text,
    model: defaultAgentModel,
    dataScope: {
      source: "ai-health",
      includesQuickBooksAccounts: true,
      includesQuickBooksTransactions: true,
      readingLevel: "8th grade",
    },
  }).catch(() => null);

  return NextResponse.json({
    answer: response.output_text,
  });
}
