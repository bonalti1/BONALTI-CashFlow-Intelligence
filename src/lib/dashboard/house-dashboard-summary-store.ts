import {
  drawPhaseKeys,
  getDrawPhaseStatuses,
  getHousePhaseActuals,
  type DrawPhaseKey,
  type DrawPhaseRecord,
  type HousePhaseActual,
} from "@/lib/draws/draws-store";
import { hasDatabaseUrl, sql } from "@/lib/db/raw";
import { getHouseDetailsMap } from "@/lib/houses/house-details-store";
import { getAccountsSnapshot, type QboAccount } from "@/lib/qbo/accounts-store";
import { getConfirmedHouseName } from "@/lib/qbo/bank-account-map";

export type HouseDashboardSummaryPhase = {
  key: DrawPhaseKey;
  label: string;
  name: string;
  actual: HousePhaseActual | null;
  draw: DrawPhaseRecord | null;
};

export type HouseDashboardSummary = {
  id: string;
  house: string;
  bank: string;
  city: string | null;
  soldPrice: number | null;
  squareFootage: number | null;
  totalSpent: number;
  progress: number;
  currentPhaseKey: DrawPhaseKey;
  readyPhases: number;
  needsReview: number;
  phases: HouseDashboardSummaryPhase[];
  renderImageUrl: string | null;
  contractFileName: string | null;
  contractUploadedAt: string | null;
  contractPrice: number | null;
  contractSquareFootage: number | null;
  contractCity: string | null;
  contractSourceStatus: string | null;
  projectStatus: string;
  refreshedAt: string;
};

const phaseLabels: Record<DrawPhaseKey, { label: string; name: string }> = {
  pre: { label: "Pre", name: "Pre Phase" },
  p1: { label: "1", name: "Foundation" },
  p2: { label: "2", name: "Framing / Dry-in" },
  p3: { label: "3", name: "Rough Trades" },
  p4: { label: "4", name: "Exterior / Floors" },
  p5: { label: "5", name: "Interior" },
  p6: { label: "6", name: "Final" },
};

function accountName(account: QboAccount) {
  return account.FullyQualifiedName ?? account.Name;
}

function phaseHasMoney(phase: HouseDashboardSummaryPhase) {
  return (phase.actual?.spentAmount ?? 0) > 0 || (phase.actual?.transactionCount ?? 0) > 0;
}

function currentPhaseFor(phases: HouseDashboardSummaryPhase[]) {
  const active = phases.filter(phaseHasMoney);

  return active.at(-1)?.key ?? "pre";
}

function progressFor(
  phases: HouseDashboardSummaryPhase[],
  soldPrice: number | null,
  totalSpent: number,
) {
  if (!soldPrice || soldPrice <= 0) {
    const active = phases.filter(phaseHasMoney).length;

    return Math.round((active / drawPhaseKeys.length) * 100);
  }

  return Math.min(100, Math.round((totalSpent / soldPrice) * 100));
}

function drawIsReady(draw: DrawPhaseRecord | null) {
  return (
    draw?.drawStatus === "ready" ||
    draw?.drawStatus === "submitted" ||
    draw?.drawStatus === "received"
  );
}

let houseDashboardSummaryTableReady: Promise<void> | null = null;

async function initializeHouseDashboardSummaryTable() {
  await sql()`
    create table if not exists house_dashboard_summaries (
      house_id text primary key,
      house_name text not null,
      bank_name text not null,
      city text,
      sold_price numeric,
      square_footage integer,
      total_spent numeric not null default 0,
      progress integer not null default 0,
      current_phase_key text not null default 'pre',
      ready_phases integer not null default 0,
      needs_review integer not null default 0,
      phases jsonb not null,
      render_image_url text,
      contract_file_name text,
      contract_uploaded_at timestamptz,
      contract_price numeric,
      contract_square_footage integer,
      contract_city text,
      contract_source_status text,
      project_status text not null default 'active',
      refreshed_at timestamptz not null default now()
    )
  `;
  await sql()`alter table house_dashboard_summaries add column if not exists project_status text not null default 'active'`;
}

function ensureHouseDashboardSummaryTable() {
  houseDashboardSummaryTableReady ??= initializeHouseDashboardSummaryTable().catch((error) => {
    houseDashboardSummaryTableReady = null;
    throw error;
  });

  return houseDashboardSummaryTableReady;
}

export async function getHouseDashboardSummaries() {
  if (!hasDatabaseUrl()) {
    return [];
  }

  await ensureHouseDashboardSummaryTable();
  const rows = await sql()<
    Array<{
      house_id: string;
      house_name: string;
      bank_name: string;
      city: string | null;
      sold_price: string | null;
      square_footage: number | null;
      total_spent: string;
      progress: number;
      current_phase_key: DrawPhaseKey;
      ready_phases: number;
      needs_review: number;
      phases: HouseDashboardSummaryPhase[];
      render_image_url: string | null;
      contract_file_name: string | null;
      contract_uploaded_at: Date | null;
      contract_price: string | null;
      contract_square_footage: number | null;
      contract_city: string | null;
      contract_source_status: string | null;
      project_status: string;
      refreshed_at: Date;
    }>
  >`
    select
      house_id,
      house_name,
      bank_name,
      city,
      sold_price,
      square_footage,
      total_spent,
      progress,
      current_phase_key,
      ready_phases,
      needs_review,
      phases,
      render_image_url,
      contract_file_name,
      contract_uploaded_at,
      contract_price,
      contract_square_footage,
      contract_city,
      contract_source_status,
      project_status,
      refreshed_at
    from house_dashboard_summaries
    order by progress desc, house_name
  `;

  return rows.map((row): HouseDashboardSummary => ({
    id: row.house_id,
    house: row.house_name,
    bank: row.bank_name,
    city: row.city,
    soldPrice: row.sold_price === null ? null : Number(row.sold_price),
    squareFootage: row.square_footage,
    totalSpent: Number(row.total_spent),
    progress: row.progress,
    currentPhaseKey: row.current_phase_key,
    readyPhases: row.ready_phases,
    needsReview: row.needs_review,
    phases: row.phases,
    renderImageUrl: row.render_image_url,
    contractFileName: row.contract_file_name,
    contractUploadedAt: row.contract_uploaded_at?.toISOString() ?? null,
    contractPrice: row.contract_price === null ? null : Number(row.contract_price),
    contractSquareFootage: row.contract_square_footage,
    contractCity: row.contract_city,
    contractSourceStatus: row.contract_source_status,
    projectStatus: row.project_status,
    refreshedAt: row.refreshed_at.toISOString(),
  }));
}

export async function refreshHouseDashboardSummaries() {
  if (!hasDatabaseUrl()) {
    return [];
  }

  await ensureHouseDashboardSummaryTable();
  const [snapshot, houseDetails, drawStatusesByPhase, actualsByPhase] = await Promise.all([
    getAccountsSnapshot(),
    getHouseDetailsMap(),
    getDrawPhaseStatuses(),
    getHousePhaseActuals(),
  ]);
  const bankAccounts = snapshot.accounts.filter((account) => account.AccountType === "Bank");
  const refreshedIds: string[] = [];

  await sql().begin(async (transaction) => {
    for (const account of bankAccounts) {
      const house = getConfirmedHouseName(account);

      if (!house) {
        continue;
      }

      const details = houseDetails.get(account.Id);
      const contractSoldPrice = details?.currentContractPrice ?? details?.contractPrice ?? null;
      const soldPrice = contractSoldPrice ?? details?.soldPrice ?? null;
      const squareFootage = details?.contractSquareFootage ?? details?.squareFootage ?? null;
      const city = details?.contractCity ?? details?.city ?? null;
      const phases = drawPhaseKeys.map((key): HouseDashboardSummaryPhase => {
        const actual = actualsByPhase.get(`${account.Id}:${key}`) ?? null;

        return {
          key,
          label: phaseLabels[key].label,
          name: actual?.phaseName ?? phaseLabels[key].name,
          actual,
          draw: drawStatusesByPhase.get(`${account.Id}:${key}`) ?? null,
        };
      });
      const totalSpent = phases.reduce(
        (total, phase) => total + (phase.actual?.spentAmount ?? 0),
        0,
      );
      const readyPhases = phases.filter((phase) => drawIsReady(phase.draw)).length;
      const needsReview = phases.filter((phase) =>
        phase.actual?.status === "over_budget" || phase.actual?.status === "needs_house_setup"
      ).length;

      refreshedIds.push(account.Id);
      await transaction`
        insert into house_dashboard_summaries (
          house_id,
          house_name,
          bank_name,
          city,
          sold_price,
          square_footage,
          total_spent,
          progress,
          current_phase_key,
          ready_phases,
          needs_review,
          phases,
          render_image_url,
          contract_file_name,
          contract_uploaded_at,
          contract_price,
          contract_square_footage,
          contract_city,
          contract_source_status,
          project_status,
          refreshed_at
        )
        values (
          ${account.Id},
          ${house},
          ${accountName(account)},
          ${city},
          ${soldPrice},
          ${squareFootage},
          ${totalSpent},
          ${progressFor(phases, soldPrice, totalSpent)},
          ${currentPhaseFor(phases)},
          ${readyPhases},
          ${needsReview},
          ${transaction.json(phases)},
          ${details?.manualRenderImageUrl ?? null},
          ${details?.contractFileName ?? null},
          ${details?.contractUploadedAt ?? null},
          ${details?.contractPrice ?? null},
          ${details?.contractSquareFootage ?? null},
          ${details?.contractCity ?? null},
          ${details?.contractSourceStatus ?? null},
          ${details?.projectStatus ?? "active"},
          now()
        )
        on conflict (house_id) do update set
          house_name = excluded.house_name,
          bank_name = excluded.bank_name,
          city = excluded.city,
          sold_price = excluded.sold_price,
          square_footage = excluded.square_footage,
          total_spent = excluded.total_spent,
          progress = excluded.progress,
          current_phase_key = excluded.current_phase_key,
          ready_phases = excluded.ready_phases,
          needs_review = excluded.needs_review,
          phases = excluded.phases,
          render_image_url = excluded.render_image_url,
          contract_file_name = excluded.contract_file_name,
          contract_uploaded_at = excluded.contract_uploaded_at,
          contract_price = excluded.contract_price,
          contract_square_footage = excluded.contract_square_footage,
          contract_city = excluded.contract_city,
          contract_source_status = excluded.contract_source_status,
          project_status = excluded.project_status,
          refreshed_at = now()
      `;
    }

    if (refreshedIds.length > 0) {
      await transaction`
        delete from house_dashboard_summaries
        where house_id <> all(${refreshedIds})
      `;
    }
  });

  return getHouseDashboardSummaries();
}
