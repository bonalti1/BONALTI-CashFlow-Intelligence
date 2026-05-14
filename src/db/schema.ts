import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const houseStatus = pgEnum("house_status", [
  "active",
  "paused",
  "closed",
]);

export const syncStatus = pgEnum("sync_status", [
  "running",
  "succeeded",
  "failed",
]);

export const healthStatus = pgEnum("health_status", [
  "healthy",
  "watch",
  "at_risk",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const qboConnections = pgTable("qbo_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  realmId: text("realm_id").notNull().unique(),
  environment: text("environment").notNull().default("sandbox"),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }).notNull(),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }).notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
  lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
});

export const qbAccounts = pgTable("qb_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  qboId: text("qbo_id").notNull().unique(),
  name: text("name").notNull(),
  accountType: text("account_type").notNull(),
  accountSubType: text("account_sub_type"),
  parentQboId: text("parent_qbo_id"),
  fullyQualifiedName: text("fully_qualified_name"),
  active: boolean("active").default(true).notNull(),
  raw: jsonb("raw").notNull(),
  ...timestamps,
});

export const houses = pgTable("houses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  bankAccountQboId: text("bank_account_qbo_id").notNull().unique(),
  status: houseStatus("status").default("active").notNull(),
  salePriceCents: integer("sale_price_cents"),
  squareFeet: integer("square_feet"),
  ...timestamps,
});

export const lineItems = pgTable("line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  qboAccountId: text("qbo_account_id").notNull().unique(),
  phaseName: text("phase_name").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isJobSiteOverhead: boolean("is_job_site_overhead").default(false).notNull(),
  isProgressExcluded: boolean("is_progress_excluded").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
});

export const checks = pgTable("checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  qboId: text("qbo_id").notNull().unique(),
  houseId: uuid("house_id").notNull(),
  txnDate: timestamp("txn_date", { withTimezone: true }).notNull(),
  checkNumber: text("check_number"),
  payeeName: text("payee_name"),
  memo: text("memo"),
  amountCents: integer("amount_cents").notNull(),
  cleared: boolean("cleared").default(false).notNull(),
  raw: jsonb("raw").notNull(),
  ...timestamps,
});

export const checkLines = pgTable("check_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  checkId: uuid("check_id").notNull(),
  lineItemId: uuid("line_item_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  memo: text("memo"),
});

export const budgetTemplates = pgTable("budget_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  ...timestamps,
});

export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  houseId: uuid("house_id").notNull(),
  templateId: uuid("template_id"),
  totalBudgetCents: integer("total_budget_cents"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  ...timestamps,
});

export const budgetLines = pgTable("budget_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  budgetId: uuid("budget_id").notNull(),
  lineItemId: uuid("line_item_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
});

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: syncStatus("status").default("running").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  stats: jsonb("stats"),
});

export const healthSnapshots = pgTable("health_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  houseId: uuid("house_id").notNull(),
  syncRunId: uuid("sync_run_id"),
  status: healthStatus("status").notNull(),
  progressPercent: numeric("progress_percent", { precision: 5, scale: 2 }).notNull(),
  projectedTotalCostCents: integer("projected_total_cost_cents"),
  projectedMarginCents: integer("projected_margin_cents"),
  daysSinceLastActivity: integer("days_since_last_activity"),
  deterministicMetrics: jsonb("deterministic_metrics").notNull(),
  aiSummary: text("ai_summary").notNull(),
  traceRefs: jsonb("trace_refs").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
