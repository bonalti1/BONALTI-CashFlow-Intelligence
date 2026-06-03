import { getHouseDetailsMap } from "@/lib/houses/house-details-store";
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName } from "@/lib/qbo/bank-account-map";
import { getTransactionsByBankAccount } from "@/lib/qbo/transactions-store";
import type { SavedQboTransaction } from "@/lib/qbo/transactions-store";
import { hasDatabaseUrl, sql } from "@/lib/db/raw";

const phaseRules = [
  {
    key: "pre",
    label: "Pre",
    name: "Pre-Construction / Soft Costs",
    budgetPercent: 0.02,
    progressIncluded: true,
  },
  {
    key: "p1",
    label: "P1",
    name: "Foundation",
    budgetPercent: 0.10778,
    progressIncluded: true,
  },
  {
    key: "p2",
    label: "P2",
    name: "Framing / Dry-In",
    budgetPercent: 0.125,
    progressIncluded: true,
  },
  {
    key: "p3",
    label: "P3",
    name: "Rough Trades",
    budgetPercent: 0.09,
    progressIncluded: true,
  },
  {
    key: "p4",
    label: "P4",
    name: "Exterior / Floors",
    budgetPercent: 0.075,
    progressIncluded: true,
  },
  {
    key: "p5",
    label: "P5",
    name: "Interior",
    budgetPercent: 0.112,
    progressIncluded: true,
  },
  {
    key: "p6",
    label: "P6",
    name: "Final",
    budgetPercent: 0.078,
    progressIncluded: true,
  },
  {
    key: "job_site_overhead",
    label: "Overhead",
    name: "Job Site Overhead",
    budgetPercent: null,
    progressIncluded: false,
  },
  {
    key: "general_other",
    label: "Other",
    name: "General / Other",
    budgetPercent: null,
    progressIncluded: false,
  },
] as const;

type PhaseKey = (typeof phaseRules)[number]["key"] | "needs_review";

type PhaseMapping = {
  phaseKey: PhaseKey;
  phaseLabel: string;
  phaseName: string;
  confidence: "clean" | "legacy" | "needs_review";
  progressIncluded: boolean;
  isJobSiteOverhead: boolean;
};

export type CfoDataStatus = {
  synced: boolean;
  syncedAt?: string;
  phaseLineItems?: number;
  housePhaseActuals?: number;
  housesCalculated?: number;
  needsReviewLineItems?: number;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function accountFullName(account: QboAccount) {
  return account.FullyQualifiedName ?? account.Name;
}

function topLevelAccountName(account: QboAccount) {
  return accountFullName(account).split(":")[0] ?? account.Name;
}

function isConstructionCostAccount(account: QboAccount) {
  const type = normalize(account.AccountType ?? "");
  const classification = normalize(account.Classification ?? "");
  const name = normalize(accountFullName(account));

  return (
    type.includes("cost of goods sold") ||
    classification === "expense" ||
    name.includes("cost of good")
  );
}

function phaseRuleByKey(key: Exclude<PhaseKey, "needs_review">) {
  return phaseRules.find((phase) => phase.key === key)!;
}

function mappedPhase(
  key: Exclude<PhaseKey, "needs_review">,
  confidence: PhaseMapping["confidence"] = "clean",
): PhaseMapping {
  const rule = phaseRuleByKey(key);

  return {
    phaseKey: rule.key,
    phaseLabel: rule.label,
    phaseName: rule.name,
    confidence,
    progressIncluded: rule.progressIncluded,
    isJobSiteOverhead: rule.key === "job_site_overhead",
  };
}

export function mapAccountToPhase(account: QboAccount): PhaseMapping {
  const top = normalize(topLevelAccountName(account));
  const full = normalize(accountFullName(account));

  if (top.includes("job site overhead")) {
    return mappedPhase("job_site_overhead");
  }

  if (top.includes("general / other") || top.includes("general /other")) {
    return mappedPhase("general_other");
  }

  if (top.includes("pre-construction") || top.includes("soft costs")) {
    return mappedPhase("pre", top.includes("phase") ? "legacy" : "clean");
  }

  if (top.includes("p1 foundation") || top.includes("phase 1") || top.includes("foundation")) {
    return mappedPhase("p1", top.includes("p1") ? "clean" : "legacy");
  }

  if (
    top.includes("p2 framing") ||
    top.includes("framing / dry-in") ||
    top.includes("framing & structure")
  ) {
    return mappedPhase("p2", top.includes("p2") ? "clean" : "legacy");
  }

  if (top.includes("p3 rough trades") || top.includes("mep rough-in")) {
    return mappedPhase("p3", top.includes("p3") ? "clean" : "legacy");
  }

  if (
    top.includes("p4 exterior") ||
    top.includes("exterior finishes") ||
    top.includes("tile & flooring")
  ) {
    return mappedPhase("p4", top.includes("p4") ? "clean" : "legacy");
  }

  if (top.includes("p5 interior") || top.includes("interior rough")) {
    return mappedPhase("p5", top.includes("p5") ? "clean" : "legacy");
  }

  if (top.includes("p6 final") || top.includes("finishes & fixtures")) {
    return mappedPhase("p6", top.includes("p6") ? "clean" : "legacy");
  }

  if (full.includes("change order")) {
    return {
      phaseKey: "needs_review",
      phaseLabel: "Review",
      phaseName: "Needs Review",
      confidence: "needs_review",
      progressIncluded: false,
      isJobSiteOverhead: false,
    };
  }

  return {
    phaseKey: "needs_review",
    phaseLabel: "Review",
    phaseName: "Needs Review",
    confidence: "needs_review",
    progressIncluded: false,
    isJobSiteOverhead: false,
  };
}

async function ensureCfoTables() {
  await sql()`
    create table if not exists cfo_phase_line_items (
      qbo_account_id text primary key,
      realm_id text not null,
      qbo_account_name text not null,
      qbo_fully_qualified_name text,
      parent_qbo_id text,
      phase_key text not null,
      phase_label text not null,
      phase_name text not null,
      line_item_name text not null,
      mapping_confidence text not null,
      progress_included boolean not null,
      is_job_site_overhead boolean not null,
      active boolean not null default true,
      raw jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql()`
    create table if not exists cfo_phase_budget_rules (
      phase_key text primary key,
      phase_label text not null,
      phase_name text not null,
      budget_percent numeric,
      progress_included boolean not null,
      is_job_site_overhead boolean not null,
      rule_note text not null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql()`
    create table if not exists cfo_house_phase_actuals (
      bank_account_qbo_id text not null,
      house_name text not null,
      phase_key text not null,
      phase_label text not null,
      phase_name text not null,
      sale_price numeric,
      square_feet integer,
      city text,
      budget_amount numeric,
      spent_amount numeric not null default 0,
      transaction_count integer not null default 0,
      over_budget_amount numeric not null default 0,
      status text not null,
      calculated_at timestamptz not null default now(),
      primary key (bank_account_qbo_id, phase_key)
    )
  `;
  await sql()`
    create table if not exists cfo_internal_draw_rules (
      slug text primary key,
      label text not null,
      amount_per_phase numeric,
      percent_on_close numeric,
      rule_note text not null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql()`
    create table if not exists cfo_data_sync_status (
      id integer primary key default 1,
      synced_at timestamptz not null,
      phase_line_items integer not null,
      house_phase_actuals integer not null,
      houses_calculated integer not null,
      needs_review_line_items integer not null,
      updated_at timestamptz not null default now()
    )
  `;
}

function phaseForTransaction({
  transaction,
  lineItemMap,
}: {
  transaction: SavedQboTransaction;
  lineItemMap: Map<string, PhaseMapping>;
}) {
  for (const accountId of transaction.expenseAccountIds) {
    const mapping = lineItemMap.get(accountId);

    if (mapping) {
      return mapping;
    }
  }

  for (const accountName of transaction.expenseAccountNames) {
    const fakeAccount: QboAccount = {
      Id: accountName,
      Name: accountName,
      FullyQualifiedName: accountName,
    };
    const mapping = mapAccountToPhase(fakeAccount);

    if (mapping.phaseKey !== "needs_review") {
      return mapping;
    }
  }

  return {
    phaseKey: "needs_review",
    phaseLabel: "Review",
    phaseName: "Needs Review",
    confidence: "needs_review",
    progressIncluded: false,
    isJobSiteOverhead: false,
  } satisfies PhaseMapping;
}

function actualStatus({
  soldPrice,
  spent,
  budget,
  transactionCount,
}: {
  soldPrice: number | null;
  spent: number;
  budget: number | null;
  transactionCount: number;
}) {
  if (!soldPrice) {
    return transactionCount > 0 ? "needs_house_setup" : "not_started";
  }

  if (!budget) {
    return transactionCount > 0 ? "review" : "not_started";
  }

  if (spent > budget) {
    return "over_budget";
  }

  return transactionCount > 0 ? "on_budget" : "not_started";
}

export async function syncCfoDataLayer() {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required for the CFO data layer.");
  }

  await ensureCfoTables();

  const [snapshot, houseDetails, transactionsByBankAccount] = await Promise.all([
    getAccountsSnapshot(),
    getHouseDetailsMap(),
    getTransactionsByBankAccount(),
  ]);
  const constructionAccounts = snapshot.accounts.filter(isConstructionCostAccount);
  const lineItemMappings = new Map<string, PhaseMapping>();
  let needsReviewLineItems = 0;

  await sql().begin(async (transaction) => {
    for (const rule of phaseRules) {
      await transaction`
        insert into cfo_phase_budget_rules (
          phase_key,
          phase_label,
          phase_name,
          budget_percent,
          progress_included,
          is_job_site_overhead,
          rule_note,
          updated_at
        )
        values (
          ${rule.key},
          ${rule.label},
          ${rule.name},
          ${rule.budgetPercent},
          ${rule.progressIncluded},
          ${rule.key === "job_site_overhead"},
          ${rule.budgetPercent === null
            ? "No final budget percent set yet."
            : "Draft budget percent. Replace with final CFO-approved rule."},
          now()
        )
        on conflict (phase_key) do update set
          phase_label = excluded.phase_label,
          phase_name = excluded.phase_name,
          budget_percent = excluded.budget_percent,
          progress_included = excluded.progress_included,
          is_job_site_overhead = excluded.is_job_site_overhead,
          rule_note = excluded.rule_note,
          updated_at = now()
      `;
    }

    await transaction`
      insert into cfo_internal_draw_rules (
        slug,
        label,
        amount_per_phase,
        percent_on_close,
        rule_note,
        updated_at
      )
      values
        (
          'marketing',
          'Marketing',
          1500,
          null,
          '$1,500 should be added to Marketing for each completed phase draw.',
          now()
        ),
        (
          'management_payroll',
          'Management Payroll',
          2000,
          null,
          '$2,000 should be added to Management Payroll for each completed phase draw.',
          now()
        ),
        (
          'operations',
          'Operations',
          null,
          0.05,
          '5% is planned for Operations after a house closes.',
          now()
        )
      on conflict (slug) do update set
        label = excluded.label,
        amount_per_phase = excluded.amount_per_phase,
        percent_on_close = excluded.percent_on_close,
        rule_note = excluded.rule_note,
        updated_at = now()
    `;

    for (const account of constructionAccounts) {
      const mapping = mapAccountToPhase(account);

      lineItemMappings.set(account.Id, mapping);

      if (mapping.phaseKey === "needs_review") {
        needsReviewLineItems += 1;
      }

      await transaction`
        insert into cfo_phase_line_items (
          qbo_account_id,
          realm_id,
          qbo_account_name,
          qbo_fully_qualified_name,
          parent_qbo_id,
          phase_key,
          phase_label,
          phase_name,
          line_item_name,
          mapping_confidence,
          progress_included,
          is_job_site_overhead,
          active,
          raw,
          updated_at
        )
        values (
          ${account.Id},
          ${snapshot.realmId},
          ${account.Name},
          ${account.FullyQualifiedName ?? null},
          ${account.ParentRef?.value ?? null},
          ${mapping.phaseKey},
          ${mapping.phaseLabel},
          ${mapping.phaseName},
          ${account.Name},
          ${mapping.confidence},
          ${mapping.progressIncluded},
          ${mapping.isJobSiteOverhead},
          ${account.Active ?? true},
          ${transaction.json(JSON.parse(JSON.stringify(account)))},
          now()
        )
        on conflict (qbo_account_id) do update set
          realm_id = excluded.realm_id,
          qbo_account_name = excluded.qbo_account_name,
          qbo_fully_qualified_name = excluded.qbo_fully_qualified_name,
          parent_qbo_id = excluded.parent_qbo_id,
          phase_key = excluded.phase_key,
          phase_label = excluded.phase_label,
          phase_name = excluded.phase_name,
          line_item_name = excluded.line_item_name,
          mapping_confidence = excluded.mapping_confidence,
          progress_included = excluded.progress_included,
          is_job_site_overhead = excluded.is_job_site_overhead,
          active = excluded.active,
          raw = excluded.raw,
          updated_at = now()
      `;
    }
  });

  const bankAccounts = snapshot.accounts.filter((account) => account.AccountType === "Bank");
  const houseAccounts = bankAccounts
    .map((account) => ({
      account,
      houseName: getConfirmedHouseName(account),
    }))
    .filter((item): item is { account: QboAccount; houseName: string } =>
      Boolean(item.houseName),
    );

  let actualRows = 0;

  await sql().begin(async (transaction) => {
    for (const { account, houseName } of houseAccounts) {
      const details = houseDetails.get(account.Id);
      const salePrice = details?.soldPrice ?? null;
      const squareFeet = details?.squareFootage ?? null;
      const city = details?.city ?? null;
      const phaseTotals = new Map<
        string,
        {
          spent: number;
          transactionCount: number;
        }
      >();

      for (const item of phaseRules) {
        phaseTotals.set(item.key, {
          spent: 0,
          transactionCount: 0,
        });
      }
      phaseTotals.set("needs_review", {
        spent: 0,
        transactionCount: 0,
      });

      for (const moneyTransaction of transactionsByBankAccount.get(account.Id) ?? []) {
        const mapping = phaseForTransaction({
          transaction: moneyTransaction,
          lineItemMap: lineItemMappings,
        });
        const current = phaseTotals.get(mapping.phaseKey) ?? {
          spent: 0,
          transactionCount: 0,
        };

        current.spent += Math.abs(moneyTransaction.totalAmount);
        current.transactionCount += 1;
        phaseTotals.set(mapping.phaseKey, current);
      }

      for (const [phaseKey, total] of phaseTotals.entries()) {
        const rule = phaseRules.find((item) => item.key === phaseKey);
        const budgetPercent = rule?.budgetPercent ?? null;
        const budget = salePrice && budgetPercent ? salePrice * budgetPercent : null;
        const overBudget = budget && total.spent > budget ? total.spent - budget : 0;
        const status = actualStatus({
          soldPrice: salePrice,
          spent: total.spent,
          budget,
          transactionCount: total.transactionCount,
        });

        await transaction`
          insert into cfo_house_phase_actuals (
            bank_account_qbo_id,
            house_name,
            phase_key,
            phase_label,
            phase_name,
            sale_price,
            square_feet,
            city,
            budget_amount,
            spent_amount,
            transaction_count,
            over_budget_amount,
            status,
            calculated_at
          )
          values (
            ${account.Id},
            ${houseName},
            ${phaseKey},
            ${rule?.label ?? "Review"},
            ${rule?.name ?? "Needs Review"},
            ${salePrice},
            ${squareFeet},
            ${city},
            ${budget},
            ${total.spent},
            ${total.transactionCount},
            ${overBudget},
            ${status},
            now()
          )
          on conflict (bank_account_qbo_id, phase_key) do update set
            house_name = excluded.house_name,
            phase_label = excluded.phase_label,
            phase_name = excluded.phase_name,
            sale_price = excluded.sale_price,
            square_feet = excluded.square_feet,
            city = excluded.city,
            budget_amount = excluded.budget_amount,
            spent_amount = excluded.spent_amount,
            transaction_count = excluded.transaction_count,
            over_budget_amount = excluded.over_budget_amount,
            status = excluded.status,
            calculated_at = now()
        `;
        actualRows += 1;
      }
    }

    await transaction`
      insert into cfo_data_sync_status (
        id,
        synced_at,
        phase_line_items,
        house_phase_actuals,
        houses_calculated,
        needs_review_line_items,
        updated_at
      )
      values (
        1,
        ${new Date().toISOString()},
        ${constructionAccounts.length},
        ${actualRows},
        ${houseAccounts.length},
        ${needsReviewLineItems},
        now()
      )
      on conflict (id) do update set
        synced_at = excluded.synced_at,
        phase_line_items = excluded.phase_line_items,
        house_phase_actuals = excluded.house_phase_actuals,
        houses_calculated = excluded.houses_calculated,
        needs_review_line_items = excluded.needs_review_line_items,
        updated_at = now()
    `;
  });

  return {
    syncedAt: new Date().toISOString(),
    phaseLineItems: constructionAccounts.length,
    housePhaseActuals: actualRows,
    housesCalculated: houseAccounts.length,
    needsReviewLineItems,
  };
}

export async function getCfoDataStatus(): Promise<CfoDataStatus> {
  if (!hasDatabaseUrl()) {
    return { synced: false };
  }

  try {
    await ensureCfoTables();
    const rows = await sql()<
      Array<{
        synced_at: Date;
        phase_line_items: number;
        house_phase_actuals: number;
        houses_calculated: number;
        needs_review_line_items: number;
      }>
    >`
      select
        synced_at,
        phase_line_items,
        house_phase_actuals,
        houses_calculated,
        needs_review_line_items
      from cfo_data_sync_status
      where id = 1
      limit 1
    `;
    const row = rows[0];

    if (!row) {
      return { synced: false };
    }

    return {
      synced: true,
      syncedAt: row.synced_at.toISOString(),
      phaseLineItems: row.phase_line_items,
      housePhaseActuals: row.house_phase_actuals,
      housesCalculated: row.houses_calculated,
      needsReviewLineItems: row.needs_review_line_items,
    };
  } catch {
    return { synced: false };
  }
}

export async function getCfoPortfolioSummary() {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required for the CFO portfolio summary.");
  }

  await ensureCfoTables();
  const status = await getCfoDataStatus();
  const rows = await sql()<
    Array<{
      house_name: string;
      phase_key: string;
      phase_label: string;
      phase_name: string;
      sale_price: string | null;
      square_feet: number | null;
      city: string | null;
      budget_amount: string | null;
      spent_amount: string;
      transaction_count: number;
      over_budget_amount: string;
      status: string;
    }>
  >`
    select
      house_name,
      phase_key,
      phase_label,
      phase_name,
      sale_price,
      square_feet,
      city,
      budget_amount,
      spent_amount,
      transaction_count,
      over_budget_amount,
      status
    from cfo_house_phase_actuals
    order by house_name, phase_key
  `;
  const houses = new Map<
    string,
    {
      house: string;
      salePrice: number | null;
      squareFeet: number | null;
      city: string | null;
      totalSpent: number;
      totalBudget: number;
      totalOverBudget: number;
      phases: Array<{
        key: string;
        label: string;
        name: string;
        budget: number | null;
        spent: number;
        transactionCount: number;
        overBudget: number;
        status: string;
      }>;
    }
  >();

  for (const row of rows) {
    const existing = houses.get(row.house_name) ?? {
      house: row.house_name,
      salePrice: row.sale_price === null ? null : Number(row.sale_price),
      squareFeet: row.square_feet,
      city: row.city,
      totalSpent: 0,
      totalBudget: 0,
      totalOverBudget: 0,
      phases: [],
    };
    const budget = row.budget_amount === null ? null : Number(row.budget_amount);
    const spent = Number(row.spent_amount);
    const overBudget = Number(row.over_budget_amount);

    existing.totalSpent += spent;
    existing.totalBudget += budget ?? 0;
    existing.totalOverBudget += overBudget;
    existing.phases.push({
      key: row.phase_key,
      label: row.phase_label,
      name: row.phase_name,
      budget,
      spent,
      transactionCount: row.transaction_count,
      overBudget,
      status: row.status,
    });
    houses.set(row.house_name, existing);
  }

  return {
    status,
    houses: Array.from(houses.values()),
  };
}
