import type { TransactionSql } from "postgres";

import { getCfoDataStatus, getCfoPortfolioSummary } from "@/lib/cfo/data-layer";
import { hasDatabaseUrl, sql } from "@/lib/db/raw";
import { getAccountsSnapshotStatus } from "@/lib/qbo/accounts-store";
import { getTransactionsSnapshotStatus } from "@/lib/qbo/transactions-store";

export type CompanyBrainStatus = {
  synced: boolean;
  syncedAt?: string;
  dataSources?: number;
  metrics?: number;
  aiReports?: number;
};

type DataSourceInput = {
  slug: string;
  label: string;
  department: string;
  sourceType: string;
  status: string;
  lastSyncedAt?: string | null;
  healthNote: string;
  metadata?: Record<string, unknown>;
};

type MetricInput = {
  department: string;
  sourceSlug: string;
  metricKey: string;
  metricLabel: string;
  metricValue?: number | null;
  metricText?: string | null;
  unit?: string | null;
  context?: Record<string, unknown>;
};

function databaseJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

export type SavedCompanyAiReport = {
  reportType: string;
  department: string;
  title: string;
  question: string;
  answer: string;
  model?: string | null;
  dataScope?: Record<string, unknown>;
  traceRefs?: Record<string, unknown>;
};

async function ensureCompanyBrainTables() {
  await sql()`
    create table if not exists company_data_sources (
      slug text primary key,
      label text not null,
      department text not null,
      source_type text not null,
      status text not null,
      last_synced_at timestamptz,
      health_note text not null,
      metadata jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `;
  await sql()`
    create table if not exists company_executive_metrics (
      department text not null,
      source_slug text not null references company_data_sources(slug) on delete cascade,
      metric_key text not null,
      metric_label text not null,
      metric_value numeric,
      metric_text text,
      unit text,
      context jsonb not null default '{}'::jsonb,
      snapshot_at timestamptz not null default now(),
      primary key (department, source_slug, metric_key)
    )
  `;
  await sql()`
    create table if not exists company_ai_reports (
      id bigserial primary key,
      report_type text not null,
      department text not null,
      title text not null,
      question text not null,
      answer text not null,
      model text,
      data_scope jsonb not null default '{}'::jsonb,
      trace_refs jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `;
  await sql()`
    create table if not exists company_brain_sync_status (
      id integer primary key default 1,
      synced_at timestamptz not null,
      data_sources integer not null,
      metrics integer not null,
      ai_reports integer not null,
      updated_at timestamptz not null default now()
    )
  `;
}

async function upsertDataSource(transaction: TransactionSql, input: DataSourceInput) {
  await transaction`
    insert into company_data_sources (
      slug,
      label,
      department,
      source_type,
      status,
      last_synced_at,
      health_note,
      metadata,
      updated_at
    )
    values (
      ${input.slug},
      ${input.label},
      ${input.department},
      ${input.sourceType},
      ${input.status},
      ${input.lastSyncedAt ?? null},
      ${input.healthNote},
      ${transaction.json(databaseJson(input.metadata))},
      now()
    )
    on conflict (slug) do update set
      label = excluded.label,
      department = excluded.department,
      source_type = excluded.source_type,
      status = excluded.status,
      last_synced_at = excluded.last_synced_at,
      health_note = excluded.health_note,
      metadata = excluded.metadata,
      updated_at = now()
  `;
}

async function upsertMetric(transaction: TransactionSql, input: MetricInput) {
  await transaction`
    insert into company_executive_metrics (
      department,
      source_slug,
      metric_key,
      metric_label,
      metric_value,
      metric_text,
      unit,
      context,
      snapshot_at
    )
    values (
      ${input.department},
      ${input.sourceSlug},
      ${input.metricKey},
      ${input.metricLabel},
      ${input.metricValue ?? null},
      ${input.metricText ?? null},
      ${input.unit ?? null},
      ${transaction.json(databaseJson(input.context))},
      now()
    )
    on conflict (department, source_slug, metric_key) do update set
      metric_label = excluded.metric_label,
      metric_value = excluded.metric_value,
      metric_text = excluded.metric_text,
      unit = excluded.unit,
      context = excluded.context,
      snapshot_at = now()
  `;
}

export async function saveCompanyAiReport(report: SavedCompanyAiReport) {
  if (!hasDatabaseUrl()) {
    return null;
  }

  await ensureCompanyBrainTables();
  const rows = await sql()<
    Array<{
      id: string;
      created_at: Date;
    }>
  >`
    insert into company_ai_reports (
      report_type,
      department,
      title,
      question,
      answer,
      model,
      data_scope,
      trace_refs
    )
    values (
      ${report.reportType},
      ${report.department},
      ${report.title},
      ${report.question},
      ${report.answer},
      ${report.model ?? null},
      ${sql().json(databaseJson(report.dataScope))},
      ${sql().json(databaseJson(report.traceRefs))}
    )
    returning id, created_at
  `;

  return {
    id: rows[0]?.id,
    createdAt: rows[0]?.created_at.toISOString(),
  };
}

export async function syncCompanyBrainFromCurrentData(): Promise<CompanyBrainStatus> {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required for the company brain.");
  }

  await ensureCompanyBrainTables();

  const [accountsStatus, transactionStatus, cfoStatus, cfoPortfolio] = await Promise.all([
    getAccountsSnapshotStatus(),
    getTransactionsSnapshotStatus(),
    getCfoDataStatus(),
    getCfoPortfolioSummary().catch(() => null),
  ]);
  const houses = cfoPortfolio?.houses ?? [];
  const housesWithSetup = houses.filter(
    (house) => house.salePrice && house.squareFeet && house.city,
  );
  const totalSpent = houses.reduce((sum, house) => sum + house.totalSpent, 0);
  const totalBudget = houses.reduce((sum, house) => sum + house.totalBudget, 0);
  const totalOverBudget = houses.reduce((sum, house) => sum + house.totalOverBudget, 0);
  let dataSourceCount = 0;
  let metricCount = 0;

  await sql().begin(async (transaction) => {
    const sources: DataSourceInput[] = [
      {
        slug: "quickbooks_accounts",
        label: "QuickBooks Chart of Accounts",
        department: "finance",
        sourceType: "api",
        status: accountsStatus.synced ? "healthy" : "missing",
        lastSyncedAt: accountsStatus.syncedAt,
        healthNote: accountsStatus.synced
          ? "QuickBooks accounts are stored in the company brain."
          : "QuickBooks accounts have not been synced yet.",
        metadata: accountsStatus,
      },
      {
        slug: "quickbooks_transactions",
        label: "QuickBooks Checks and Transactions",
        department: "finance",
        sourceType: "api",
        status: transactionStatus.synced ? "healthy" : "needs_refresh",
        lastSyncedAt: transactionStatus.syncedAt,
        healthNote: transactionStatus.synced
          ? "QuickBooks transactions are available for project analysis."
          : "Transaction sync needs to run before phase spending is fully trusted.",
        metadata: transactionStatus,
      },
      {
        slug: "cfo_project_health",
        label: "Project Health CFO Layer",
        department: "finance",
        sourceType: "analytics",
        status: cfoStatus.synced ? "healthy" : "missing",
        lastSyncedAt: cfoStatus.syncedAt,
        healthNote: cfoStatus.synced
          ? "House, phase, budget, and spending facts are calculated."
          : "CFO calculations have not been generated yet.",
        metadata: cfoStatus,
      },
      {
        slug: "openai_executive_analysis",
        label: "AI Executive Analysis",
        department: "executive",
        sourceType: "llm",
        status: process.env.OPENAI_API_KEY ? "ready" : "missing_key",
        lastSyncedAt: null,
        healthNote: process.env.OPENAI_API_KEY
          ? "AI can read company facts and produce executive summaries."
          : "OpenAI key is missing, so AI summaries are not available yet.",
        metadata: {
          provider: "OpenAI",
          storesReports: true,
        },
      },
    ];

    for (const source of sources) {
      await upsertDataSource(transaction, source);
      dataSourceCount += 1;
    }

    const metrics: MetricInput[] = [
      {
        department: "finance",
        sourceSlug: "quickbooks_accounts",
        metricKey: "qbo_accounts_total",
        metricLabel: "QuickBooks accounts stored",
        metricValue: accountsStatus.total ?? 0,
        unit: "accounts",
      },
      {
        department: "finance",
        sourceSlug: "quickbooks_transactions",
        metricKey: "qbo_transactions_total",
        metricLabel: "QuickBooks transactions stored",
        metricValue: transactionStatus.total ?? 0,
        unit: "transactions",
      },
      {
        department: "finance",
        sourceSlug: "cfo_project_health",
        metricKey: "active_houses",
        metricLabel: "Active houses tracked",
        metricValue: houses.length,
        unit: "houses",
      },
      {
        department: "finance",
        sourceSlug: "cfo_project_health",
        metricKey: "houses_with_setup",
        metricLabel: "Houses with price, sqft, and city",
        metricValue: housesWithSetup.length,
        unit: "houses",
      },
      {
        department: "finance",
        sourceSlug: "cfo_project_health",
        metricKey: "phase_line_items",
        metricLabel: "Phase line items mapped",
        metricValue: cfoStatus.phaseLineItems ?? 0,
        unit: "line items",
      },
      {
        department: "finance",
        sourceSlug: "cfo_project_health",
        metricKey: "phase_actual_rows",
        metricLabel: "House phase actual rows",
        metricValue: cfoStatus.housePhaseActuals ?? 0,
        unit: "rows",
      },
      {
        department: "finance",
        sourceSlug: "cfo_project_health",
        metricKey: "needs_review_line_items",
        metricLabel: "Line items needing review",
        metricValue: cfoStatus.needsReviewLineItems ?? 0,
        unit: "line items",
      },
      {
        department: "finance",
        sourceSlug: "cfo_project_health",
        metricKey: "total_project_spent",
        metricLabel: "Total project spending found",
        metricValue: Number(totalSpent.toFixed(2)),
        unit: "dollars",
      },
      {
        department: "finance",
        sourceSlug: "cfo_project_health",
        metricKey: "total_project_budget",
        metricLabel: "Total project budget from setup",
        metricValue: Number(totalBudget.toFixed(2)),
        unit: "dollars",
      },
      {
        department: "finance",
        sourceSlug: "cfo_project_health",
        metricKey: "total_over_budget",
        metricLabel: "Total over budget amount",
        metricValue: Number(totalOverBudget.toFixed(2)),
        unit: "dollars",
      },
    ];

    for (const metric of metrics) {
      await upsertMetric(transaction, metric);
      metricCount += 1;
    }

    const reportRows = await transaction<
      Array<{
        count: string;
      }>
    >`
      select count(*)::text as count
      from company_ai_reports
    `;
    const aiReports = Number(reportRows[0]?.count ?? 0);
    const syncedAt = new Date().toISOString();

    await transaction`
      insert into company_brain_sync_status (
        id,
        synced_at,
        data_sources,
        metrics,
        ai_reports,
        updated_at
      )
      values (
        1,
        ${syncedAt},
        ${dataSourceCount},
        ${metricCount},
        ${aiReports},
        now()
      )
      on conflict (id) do update set
        synced_at = excluded.synced_at,
        data_sources = excluded.data_sources,
        metrics = excluded.metrics,
        ai_reports = excluded.ai_reports,
        updated_at = now()
    `;
  });

  return getCompanyBrainStatus();
}

export async function getCompanyBrainStatus(): Promise<CompanyBrainStatus> {
  if (!hasDatabaseUrl()) {
    return { synced: false };
  }

  try {
    await ensureCompanyBrainTables();
    const rows = await sql()<
      Array<{
        synced_at: Date;
        data_sources: number;
        metrics: number;
        ai_reports: number;
      }>
    >`
      select synced_at, data_sources, metrics, ai_reports
      from company_brain_sync_status
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
      dataSources: row.data_sources,
      metrics: row.metrics,
      aiReports: row.ai_reports,
    };
  } catch {
    return { synced: false };
  }
}

export async function getCompanyExecutiveBrief() {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required for the company executive brief.");
  }

  await ensureCompanyBrainTables();
  const [status, dataSources, metrics, reports] = await Promise.all([
    getCompanyBrainStatus(),
    sql()<
      Array<{
        slug: string;
        label: string;
        department: string;
        source_type: string;
        status: string;
        last_synced_at: Date | null;
        health_note: string;
        metadata: Record<string, unknown>;
      }>
    >`
      select slug, label, department, source_type, status, last_synced_at, health_note, metadata
      from company_data_sources
      order by department, label
    `,
    sql()<
      Array<{
        department: string;
        source_slug: string;
        metric_key: string;
        metric_label: string;
        metric_value: string | null;
        metric_text: string | null;
        unit: string | null;
        context: Record<string, unknown>;
        snapshot_at: Date;
      }>
    >`
      select
        department,
        source_slug,
        metric_key,
        metric_label,
        metric_value,
        metric_text,
        unit,
        context,
        snapshot_at
      from company_executive_metrics
      order by department, source_slug, metric_key
    `,
    sql()<
      Array<{
        id: string;
        report_type: string;
        department: string;
        title: string;
        question: string;
        answer: string;
        model: string | null;
        created_at: Date;
      }>
    >`
      select id, report_type, department, title, question, answer, model, created_at
      from company_ai_reports
      order by created_at desc
      limit 10
    `,
  ]);

  return {
    status,
    dataSources: dataSources.map((source) => ({
      slug: source.slug,
      label: source.label,
      department: source.department,
      sourceType: source.source_type,
      status: source.status,
      lastSyncedAt: source.last_synced_at?.toISOString() ?? null,
      healthNote: source.health_note,
      metadata: source.metadata,
    })),
    metrics: metrics.map((metric) => ({
      department: metric.department,
      sourceSlug: metric.source_slug,
      key: metric.metric_key,
      label: metric.metric_label,
      value: metric.metric_value === null ? null : Number(metric.metric_value),
      text: metric.metric_text,
      unit: metric.unit,
      context: metric.context,
      snapshotAt: metric.snapshot_at.toISOString(),
    })),
    latestAiReports: reports.map((report) => ({
      id: report.id,
      reportType: report.report_type,
      department: report.department,
      title: report.title,
      question: report.question,
      answer: report.answer,
      model: report.model,
      createdAt: report.created_at.toISOString(),
    })),
  };
}
