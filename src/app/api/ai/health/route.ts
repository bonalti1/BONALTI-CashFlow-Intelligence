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
  type SavedQboTransaction,
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

function transactionPayee(transaction: SavedQboTransaction) {
  return transaction.payeeName?.trim() || "No payee listed";
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
  const accountHouseNames = new Map<string, string>();
  const rows = bankAccounts
    .map((account) => {
      const house = getConfirmedHouseName(account);

      if (!house) {
        return null;
      }

      accountHouseNames.set(account.Id, house);
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
  const payeeRows = Array.from(transactionsByBankAccount.entries())
    .flatMap(([bankAccountId, transactions]) =>
      transactions
        .filter((transaction) => transaction.totalAmount >= 0 && Math.abs(transaction.totalAmount) > 0)
        .map((transaction) => ({
          payee: transactionPayee(transaction),
          house: accountHouseNames.get(bankAccountId) ?? "Internal account",
          amount: Math.abs(transaction.totalAmount),
          txnDate: transaction.txnDate,
          source: transaction.source,
          memo: transaction.memo || transaction.expenseAccountNames.join(", "),
        })),
    );
  const payeeSummaries = new Map<
    string,
    {
      payee: string;
      total: number;
      count: number;
      lastAmount: number;
      lastDate: string | null;
      averageBeforeLast: number | null;
      possibleIncrease: number | null;
      houses: Set<string>;
    }
  >();

  for (const row of payeeRows) {
    const existing = payeeSummaries.get(row.payee) ?? {
      payee: row.payee,
      total: 0,
      count: 0,
      lastAmount: 0,
      lastDate: null,
      averageBeforeLast: null,
      possibleIncrease: null,
      houses: new Set<string>(),
    };

    existing.total += row.amount;
    existing.count += 1;
    existing.houses.add(row.house);

    if (row.txnDate && (!existing.lastDate || row.txnDate > existing.lastDate)) {
      existing.lastDate = row.txnDate;
      existing.lastAmount = row.amount;
    }

    payeeSummaries.set(row.payee, existing);
  }

  const payeeTrends = Array.from(payeeSummaries.values())
    .map((summary) => {
      const historicalAmounts = payeeRows
        .filter((row) => row.payee === summary.payee && row.txnDate !== summary.lastDate)
        .map((row) => row.amount);
      const averageBeforeLast = historicalAmounts.length
        ? historicalAmounts.reduce((total, amount) => total + amount, 0) / historicalAmounts.length
        : null;
      const possibleIncrease =
        averageBeforeLast && summary.lastAmount > averageBeforeLast
          ? summary.lastAmount - averageBeforeLast
          : null;

      return {
        ...summary,
        averageBeforeLast,
        possibleIncrease,
      };
    })
    .sort((a, b) => {
      const increaseSort = (b.possibleIncrease ?? 0) - (a.possibleIncrease ?? 0);

      return increaseSort || b.total - a.total;
    })
    .slice(0, 15);
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
    "Payee and vendor review rows. Use this to look for who may be charging more than before:",
    ...payeeTrends.map((summary) =>
      [
        `- ${summary.payee}`,
        `totalPaid=${currency(summary.total)}`,
        `payments=${summary.count}`,
        `lastPayment=${summary.lastDate ?? "missing"}`,
        `lastAmount=${currency(summary.lastAmount)}`,
        `averageBeforeLast=${
          summary.averageBeforeLast ? currency(summary.averageBeforeLast) : "not enough history"
        }`,
        `possibleIncrease=${
          summary.possibleIncrease ? currency(summary.possibleIncrease) : "none found"
        }`,
        `houses=${Array.from(summary.houses).slice(0, 5).join(", ")}`,
      ].join("; "),
    ),
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
        content: `You are the South Texas Builders read-only AI CFO, meaning AI Chief Financial Officer, for custom home construction. Your job is to protect profit, watch phase budgets, review draw timing, identify vendor and subcontractor price changes, and explain what the accountant or owner should review next. Do not judge a house only by total dollars spent, because larger homes may cost more. Compare spending to sold price, square footage, current phase, budget rules, payee history, and data quality when those data points exist. When payee history shows a possible price increase, explain it carefully and say what should be checked before assuming it is a real problem. ${SIMPLE_REPORTING_RULES}`,
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
    title: "AI CFO Answer",
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
