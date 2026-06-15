"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ProjectRenderUpload } from "@/app/draws-budget/render-upload";
import type {
  HouseDashboardSummary,
  HouseDashboardSummaryPhase,
} from "@/lib/dashboard/house-dashboard-summary-store";

type DrawsDashboardHouse = HouseDashboardSummary & {
  completed: boolean;
};

type DrawsDashboardResponse = {
  activeCount: number;
  completedCount: number;
  houses: DrawsDashboardHouse[];
  message?: string;
  status: "ok" | "error" | "fallback";
  view: "active" | "completed";
};

type HouseListView = "active" | "completed";

function currency(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Pending";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function phaseHasMoney(phase: HouseDashboardSummaryPhase) {
  return Boolean(phase.actual && phase.actual.transactionCount > 0);
}

function currentPhaseFor(house: DrawsDashboardHouse) {
  return house.phases.find((phase) => phase.key === house.currentPhaseKey) ?? house.phases[0];
}

function phaseDisplayName(phase: HouseDashboardSummaryPhase | undefined) {
  if (!phase) {
    return "Pending";
  }

  return phase.key === "pre" ? "Pre Phase" : `Phase ${phase.label}`;
}

function anchorIdForHouse(id: string) {
  return `house-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function setupAnchorIdForHouse(id: string) {
  return `setup-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function HouseStatusCard({
  active,
  count,
  href,
  label,
  note,
}: {
  active: boolean;
  count: number;
  href: string;
  label: string;
  note: string;
}) {
  return (
    <Link
      className={`rounded-[13px] border bg-white p-4 shadow-[0_8px_24px_-20px_rgba(14,27,54,0.45)] transition hover:border-[#16294d]/25 hover:bg-[#fbfaf7] ${
        active ? "border-[#16294d] ring-2 ring-[#16294d]/10" : "border-[#e3e1d7]"
      }`}
      href={href}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#e23b2a]">
            {label}
          </div>
          <div className="mt-2 font-['Barlow_Condensed',Barlow,sans-serif] text-[38px] font-bold leading-none text-[#16294d]">
            {count}
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] ${
            active ? "bg-[#16294d] text-white" : "bg-[#f2f1ea] text-[#7b8298]"
          }`}
        >
          {active ? "Open" : "View"}
        </span>
      </div>
      <p className="mt-2 max-w-[520px] text-sm font-bold leading-5 text-[#7b8298]">{note}</p>
    </Link>
  );
}

function SummaryMetric({
  emphasis = "quiet",
  label,
  subValue,
  value,
}: {
  emphasis?: "primary" | "secondary" | "quiet" | "alert";
  label: string;
  subValue?: string;
  value: string;
}) {
  const valueClassName =
    emphasis === "primary"
      ? "text-[19px] font-extrabold text-[#16294d]"
      : emphasis === "alert"
        ? "text-[18px] font-extrabold text-[#9d251c]"
        : emphasis === "secondary"
          ? "text-[18px] font-extrabold text-[#16294d]"
          : "text-[15px] font-bold text-[#26334f]";
  const accentClassName =
    emphasis === "alert"
      ? "border-t-[#9d251c]"
      : emphasis === "primary" || emphasis === "secondary"
        ? "border-t-[#e23b2a]"
        : "border-t-[#d6dceb]";

  return (
    <div className={`flex h-[74px] min-w-[132px] flex-col justify-center rounded-[10px] border border-[#e3e1d7] border-t-4 ${accentClassName} bg-white px-3 py-2 shadow-[0_8px_20px_-20px_rgba(14,27,54,0.55)]`}>
      <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#9aa1b2]">
        {label}
      </div>
      <div className={`mt-1 leading-none ${valueClassName}`}>
        {value}
      </div>
      {subValue ? (
        <div className="mt-1 text-[11px] font-bold text-[#7b8298]">{subValue}</div>
      ) : null}
    </div>
  );
}

function MiniPhaseStrip({ house }: { house: DrawsDashboardHouse }) {
  return (
    <div className="rounded-[10px] border border-[#e3e1d7] bg-white px-3 py-2">
      <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#9aa1b2]">
        Phase health
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {house.phases.map((phase) => {
          const label = phase.key === "pre" ? "Pre" : `P${phase.label}`;
          const isCurrent = phase.key === house.currentPhaseKey;
          const overBudget = phase.actual?.status === "over_budget";
          const hasMoney = phaseHasMoney(phase);
          const toneClassName = overBudget
            ? "border-[#e23b2a] bg-[#fdebea] text-[#9d251c]"
            : hasMoney
              ? "border-[#b9dec9] bg-[#eaf7f0] text-[#1f6f4b]"
              : "border-[#e3e1d7] bg-[#fbfaf7] text-[#7b8298]";

          return (
            <span
              className={`grid h-8 place-items-center rounded-[7px] border text-[10px] font-extrabold ${
                isCurrent ? "ring-2 ring-[#16294d] ring-offset-1" : ""
              } ${toneClassName}`}
              key={phase.key}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function HouseCard({ house, index }: { house: DrawsDashboardHouse; index: number }) {
  const accent = index % 3 === 0 ? "#e6aa14" : "#27a0bd";
  const currentPhase = currentPhaseFor(house);
  const pricePerSqft =
    house.soldPrice && house.squareFootage ? house.soldPrice / house.squareFootage : null;
  const projectSpendPercent =
    house.soldPrice && house.soldPrice > 0
      ? Math.round((house.totalSpent / house.soldPrice) * 100)
      : null;
  const projectSpendPerSqft =
    house.squareFootage && house.squareFootage > 0
      ? house.totalSpent / house.squareFootage
      : null;
  const remainingMoney = house.soldPrice === null ? null : house.soldPrice - house.totalSpent;
  const remainingPercent =
    house.soldPrice && house.soldPrice > 0 && remainingMoney !== null
      ? Math.round((remainingMoney / house.soldPrice) * 100)
      : null;
  const activePhase = currentPhase?.key === "pre" ? "Pre" : `P${currentPhase?.label ?? "1"}`;
  const detailPhase = currentPhase?.key ?? house.currentPhaseKey;
  const detailHref = `/draws-budget?house=${encodeURIComponent(house.id)}&phase=${detailPhase}&details=1`;

  return (
    <article
      className="overflow-hidden rounded-[14px] border border-[#e3e1d7] bg-white shadow-[0_8px_24px_-18px_rgba(14,27,54,0.45)]"
      id={anchorIdForHouse(house.id)}
    >
      <div className="relative block px-4 py-4 transition hover:bg-[#fbfaf7]">
        <div className="absolute bottom-0 left-0 top-0 w-1" style={{ backgroundColor: accent }} />
        <div className="grid gap-3 lg:grid-cols-[104px_1.1fr_0.72fr_0.72fr_0.72fr_1.25fr_130px] lg:items-center">
          <ProjectRenderUpload
            houseName={house.house}
            contractCity={house.contractCity}
            contractFileName={house.contractFileName}
            contractPrice={house.contractPrice}
            contractSquareFootage={house.contractSquareFootage}
            contractSourceStatus={house.contractSourceStatus}
            imageUrl={house.renderImageUrl}
            qboBankAccountId={house.id}
            returnTo={`/draws-budget?house=${encodeURIComponent(house.id)}&phase=${detailPhase}&details=0`}
          />

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold text-[#16294d]">{house.house}</h2>
              <span className="rounded-[7px] bg-[#eaf2ff] px-2.5 py-1 text-xs font-extrabold text-[#16294d]">
                {activePhase}
              </span>
            </div>
            <p className="mt-1 text-xs font-bold text-[#7b8298]">
              {house.city ?? "City missing"} · Current phase {phaseDisplayName(currentPhase)}
            </p>
            <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9aa1b2]">
              {house.squareFootage ? `${house.squareFootage.toLocaleString()} sqft` : "Sqft missing"}
            </p>
          </div>

          <SummaryMetric
            label="House sold"
            subValue={pricePerSqft ? `${currency(pricePerSqft)} / sold sqft` : undefined}
            value={currency(house.soldPrice)}
            emphasis="primary"
          />
          <SummaryMetric
            label="Project spent"
            subValue={[
              projectSpendPercent === null ? null : `${projectSpendPercent}% spent`,
              projectSpendPerSqft === null ? null : `${currency(projectSpendPerSqft)} / sqft`,
            ].filter(Boolean).join(" · ") || undefined}
            value={currency(house.totalSpent)}
            emphasis="secondary"
          />
          <SummaryMetric
            label="Remaining"
            subValue={
              remainingPercent === null
                ? undefined
                : remainingPercent >= 0
                  ? `${remainingPercent}% left`
                  : `${Math.abs(remainingPercent)}% over`
            }
            value={
              remainingMoney === null
                ? "Pending"
                : remainingMoney >= 0
                  ? currency(remainingMoney)
                  : `${currency(Math.abs(remainingMoney))} over`
            }
            emphasis={remainingMoney !== null && remainingMoney < 0 ? "alert" : "secondary"}
          />
          <MiniPhaseStrip house={house} />

          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
            <Link
              className="rounded-[9px] border border-[#e3e1d7] bg-white px-3 py-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[#16294d]"
              href={`/setup-inputs#${setupAnchorIdForHouse(house.id)}`}
            >
              Contract
            </Link>
            <Link
              className="rounded-[9px] bg-[#16294d] px-3 py-2 text-xs font-extrabold uppercase tracking-[0.08em] text-white"
              href={detailHref}
            >
              Open Details
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function LoadingRows() {
  return (
    <section className="space-y-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          className="h-[108px] animate-pulse rounded-[14px] border border-[#e3e1d7] bg-white shadow-[0_8px_24px_-18px_rgba(14,27,54,0.45)]"
          key={index}
        />
      ))}
    </section>
  );
}

export function DrawsBudgetHouseLoader({ view }: { view: HouseListView }) {
  const [data, setData] = useState<DrawsDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch(`/api/draws-dashboard?view=${view}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as DrawsDashboardResponse;

        if (!response.ok || payload.status === "error") {
          throw new Error(payload.message ?? "Unable to load houses.");
        }

        return payload;
      })
      .then((payload) => {
        if (active) {
          setData(payload);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load houses.");
        }
      });

    return () => {
      active = false;
    };
  }, [view]);

  const counts = useMemo(
    () => ({
      active: data?.activeCount ?? 0,
      completed: data?.completedCount ?? 0,
    }),
    [data],
  );

  return (
    <>
      <section className="mb-5 grid gap-3 md:grid-cols-2">
        <HouseStatusCard
          active={view === "active"}
          count={counts.active}
          href="/draws-budget"
          label="Active Houses"
          note="Projects still moving through schedule, draws, and budget control."
        />
        <HouseStatusCard
          active={view === "completed"}
          count={counts.completed}
          href="/draws-budget?view=completed"
          label="Completed Houses"
          note="Closed projects kept for final cost, payee history, and profit review."
        />
      </section>

      {error ? (
        <div className="rounded-[14px] border border-[#f4d48a] bg-[#fff6df] p-4 text-sm font-semibold text-[#9a6500]">
          {error}
        </div>
      ) : null}

      {!data && !error ? <LoadingRows /> : null}

      {data && data.houses.length === 0 ? (
        <div className="rounded-[14px] border border-[#f4d48a] bg-[#fff6df] p-4 text-sm font-semibold text-[#9a6500]">
          {view === "completed"
            ? "No completed houses are in this area yet."
            : "No active houses are loaded yet. Click Sync QB to pull the latest QuickBooks accounts, checks, and phase totals."}
        </div>
      ) : null}

      {data && data.houses.length > 0 ? (
        <section className="space-y-4">
          {data.houses.map((house, index) => (
            <HouseCard house={house} index={index} key={house.id} />
          ))}
        </section>
      ) : null}
    </>
  );
}
