import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  Banknote,
  Brain,
  Calculator,
  CheckCircle2,
  CircleAlert,
  Database,
  HandCoins,
  Landmark,
  Printer,
  ShieldCheck,
  Split,
  UploadCloud,
} from "lucide-react";

export const dynamic = "force-dynamic";

type Tone = "green" | "amber" | "red" | "blue" | "navy";
type SourceState = "connected" | "missing" | "partial" | "calculated";

const baseModel = {
  managementPct: 0.2,
  marketingPct: 0.15,
  operationsPct: 0.05,
  phaseCount: 6,
};

const kpis = {
  activeHouses: 17,
  bankAccounts: 33,
  bankCash: 179_873,
  transactions: 1_003,
  adSpend: 30_524,
  leads: 2_432,
  closed: 18,
};

const companyModules = [
  {
    description: "Contracts, draw sheets, deposits",
    href: "/setup-inputs",
    icon: UploadCloud,
    label: "Add Source",
  },
  {
    description: "Live bank cash and transactions",
    href: "/bank-feed",
    icon: Landmark,
    label: "Bank Feed",
  },
  {
    description: "Phase health and holdbacks",
    href: "/draws-budget",
    icon: Split,
    label: "Draws",
  },
  {
    description: "Vendor and subcontractor spend",
    href: "/payees",
    icon: HandCoins,
    label: "Payees",
  },
  {
    description: "Questions, risk, daily brief",
    href: "/ai-health",
    icon: Brain,
    label: "AI Center",
  },
];

const houseFiles = [
  {
    account: "Alto Expenses DC3730",
    actualSpent: 18_420,
    bankBalance: 238,
    contract: "Missing",
    depositReceived: 5_000,
    draw: "Missing",
    lender: "CFS",
    missing: ["Contract", "Draw Sheet", "Holdback"],
    name: "Delgadillo",
    phase: "P5",
    qbo: "Connected",
    salePrice: 230_000,
    sqft: 2_000,
    targetCost: 156_000,
    tone: "amber" as Tone,
  },
  {
    account: "Alto Profits DC2656",
    actualSpent: 47_800,
    bankBalance: 15_148,
    contract: "Uploaded",
    depositReceived: 5_000,
    draw: "Needs approval",
    lender: "Rally",
    missing: ["Funded Draw", "Cost Baseline"],
    name: "HUNN",
    phase: "P5",
    qbo: "Connected",
    salePrice: 195_500,
    sqft: 1_700,
    targetCost: 136_000,
    tone: "blue" as Tone,
  },
  {
    account: "LSNB Business Checking",
    actualSpent: 6_250,
    bankBalance: 25_181,
    contract: "Uploaded",
    depositReceived: 10_000,
    draw: "Uploaded",
    lender: "CFS",
    missing: ["Commission Proof", "Architect Final"],
    name: "Ruvalcaba",
    phase: "P3",
    qbo: "Connected",
    salePrice: 287_500,
    sqft: 2_500,
    targetCost: 200_000,
    tone: "blue" as Tone,
  },
];

const completedFiles = [
  {
    margin: "Needs final review",
    name: "Completed Project 01",
    source: "QuickBooks + final contract",
  },
  {
    margin: "Build cost library",
    name: "Completed Project 02",
    source: "Subcontractor cost history",
  },
];

const sourceRows = [
  {
    detail: "Bank accounts, balances, deposits, withdrawals, and daily cash movement.",
    label: "Plaid Bank Feed",
    state: "connected" as SourceState,
  },
  {
    detail: "Chart of accounts, checks, subcontractor payments, vendor bills, and classes.",
    label: "QuickBooks Ledger",
    state: "connected" as SourceState,
  },
  {
    detail: "Signed contract, square footage, sale price, deposit terms, and change orders.",
    label: "Contract Source",
    state: "missing" as SourceState,
  },
  {
    detail: "Draw percentages, requested amount, approved amount, funded amount, holdback.",
    label: "Draw Sheet Source",
    state: "partial" as SourceState,
  },
  {
    detail: "Sales manager, closer, architect, management, marketing, operations by house.",
    label: "House-Specific Rules",
    state: "calculated" as SourceState,
  },
];

const aiDecisions = [
  {
    label: "Do not pull fixed buckets",
    text: "Management, marketing, and operations must scale with the house profit.",
    tone: "amber" as Tone,
  },
  {
    label: "Raw cash is not safe cash",
    text: "Deduct holdbacks, unpaid phase costs, commissions, and deposits first.",
    tone: "red" as Tone,
  },
  {
    label: "House file before payments",
    text: "Each new project should be mapped before major subcontractor checks start.",
    tone: "green" as Tone,
  },
];

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function percent(value: number) {
  return `${(value * 100).toFixed(1).replace(".0", "")}%`;
}

function projectModel(house: (typeof houseFiles)[number]) {
  const profit = house.salePrice - house.targetCost;
  const perDraw = {
    management: (profit * baseModel.managementPct) / baseModel.phaseCount,
    marketing: (profit * baseModel.marketingPct) / baseModel.phaseCount,
    operations: (profit * baseModel.operationsPct) / baseModel.phaseCount,
  };
  const earlyObligations = 500 + 900 + Math.max(300, house.sqft * 0.7 * 0.22);
  const depositRemaining = house.depositReceived - earlyObligations;
  const margin = profit / house.salePrice;

  return { depositRemaining, margin, perDraw, profit };
}

export default function AiCfoControlCenterPage() {
  const mappedCash = houseFiles.reduce((sum, house) => sum + house.bankBalance, 0);
  const projectedProfit = houseFiles.reduce((sum, house) => sum + projectModel(house).profit, 0);
  const missingSources = houseFiles.reduce((sum, house) => sum + house.missing.length, 0);

  return (
    <main className="min-h-screen bg-[#f4f3ec] font-['Barlow',Arial,sans-serif] text-[#16294d]">
      <section className="bg-[#19294f] text-white shadow-[0_10px_36px_rgba(14,27,54,0.22)]">
        <div className="mx-auto max-w-[1260px] px-4 py-5 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid size-[68px] place-items-center rounded-[9px] bg-white p-2">
                <Image
                  alt="South Texas Builders"
                  className="h-auto w-full"
                  height={1080}
                  priority
                  src="/south-texas-builders-logo.png"
                  width={1080}
                />
              </div>
              <div>
                <h1 className="font-['Barlow_Condensed',Barlow,sans-serif] text-[34px] font-extrabold uppercase leading-none tracking-[0.02em] md:text-[44px]">
                  AI CFO <span className="text-[#e23b2a]">Control Center</span>
                </h1>
                <p className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.34em] text-white/70">
                  Person in charge: Finance Team
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <HeaderPill label="Working Day" value="Today" />
              <HeaderPill label="Source Mode" value="Truth File" />
              <HeaderPill label="QuickBooks" value="Synced" tone="green" />
              <Link
                className="inline-flex h-[52px] items-center justify-center gap-2 rounded-[9px] px-5 text-sm font-extrabold shadow-[0_8px_18px_-16px_rgba(0,0,0,0.6)] transition bg-[#e34b37] text-white hover:bg-[#c83225]"
                href="/api/qbo/connect"
              >
                Sync QB
              </Link>
              <Link
                className="inline-flex h-[52px] items-center justify-center gap-2 rounded-[9px] px-5 text-sm font-extrabold shadow-[0_8px_18px_-16px_rgba(0,0,0,0.6)] transition bg-white/10 text-white hover:bg-white/16"
                href="/bank-feed"
              >
                <Landmark size={17} />
                Bank Feed
              </Link>
              <button className="inline-flex h-[52px] items-center justify-center gap-2 rounded-[9px] px-5 text-sm font-extrabold shadow-[0_8px_18px_-16px_rgba(0,0,0,0.6)] transition bg-white text-[#16294d] hover:bg-[#fbfaf7]">
                <Printer size={17} />
                Export Report
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="min-h-[calc(100vh-138px)] bg-[linear-gradient(rgba(22,41,77,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(22,41,77,0.06)_1px,transparent_1px)] bg-[size:42px_42px]">
        <div className="mx-auto max-w-[1260px] px-4 py-5 md:px-6">
          <section className="-mt-2 mb-5 rounded-[16px] border border-[#e3e1d7] bg-white p-2 shadow-[0_12px_34px_-24px_rgba(14,27,54,0.55)]">
            <div className="grid gap-2 md:grid-cols-5">
              {companyModules.map((module) => (
                <ModuleTile module={module} key={module.label} />
              ))}
            </div>
          </section>

          <section className="mb-5 grid gap-4 md:grid-cols-2">
            <StatusCard
              active
              count={kpis.activeHouses}
              label="Active Houses"
              note="Projects moving through contracts, schedules, draws, QuickBooks, and budget control."
            />
            <StatusCard
              count={completedFiles.length}
              label="Completed Houses"
              note="Closed projects kept for final cost, payee history, profit review, and future pricing."
            />
          </section>

          <section className="mb-5 rounded-[14px] border border-[#e3e1d7] bg-white shadow-[0_8px_24px_-18px_rgba(14,27,54,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ebe8dc] px-4 py-4">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#e23b2a]">
                  Control Center Data
                </div>
                <p className="mt-1 text-sm font-bold text-[#16294d]">
                  One front door. Bank Feed, QuickBooks, Draws, Payees, and AI Center live here.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="rounded-[9px] border border-[#e3e1d7] bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#16294d] transition hover:border-[#16294d]/30 hover:bg-[#fbfaf7]"
                  href="/draws-budget"
                >
                  Open Draws
                </Link>
                <Link
                  className="rounded-[9px] border border-[#16294d] bg-[#16294d] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-white transition hover:bg-[#223760]"
                  href="/setup-inputs"
                >
                  Add House File
                </Link>
              </div>
            </div>

            <div className="grid gap-3 p-4 lg:grid-cols-4">
              <DashboardMetric icon={Banknote} label="Bank Cash" value={currency(kpis.bankCash)} />
              <DashboardMetric icon={Database} label="QB / Plaid Txns" value={kpis.transactions.toLocaleString()} />
              <DashboardMetric icon={Calculator} label="Mapped Cash" value={currency(mappedCash)} />
              <DashboardMetric icon={CircleAlert} label="Missing Sources" tone="red" value={String(missingSources)} />
            </div>
          </section>

          <section className="mb-5 space-y-4">
            {houseFiles.map((house, index) => (
              <HouseSourceCard house={house} index={index} key={house.name} />
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <Panel title="Source Truth Layers" kicker="Verified Data">
              <div className="space-y-3">
                {sourceRows.map((row) => (
                  <SourceRow row={row} key={row.label} />
                ))}
              </div>
            </Panel>

            <Panel title="AI CFO Decisions" kicker="Decision Board">
              <div className="grid gap-3">
                {aiDecisions.map((decision) => (
                  <DecisionRow decision={decision} key={decision.label} />
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <SmallStat label="Ad Spend" value={currency(kpis.adSpend)} />
                <SmallStat label="Leads" value={kpis.leads.toLocaleString()} />
                <SmallStat label="Closed" value={String(kpis.closed)} />
              </div>
              <p className="mt-4 text-sm font-bold leading-6 text-[#7b8298]">
                Projected profit across the current sample house files is {currency(projectedProfit)}.
                The CFO should only recommend transfers after house-specific documents are verified.
              </p>
            </Panel>
          </section>
        </div>
      </section>
    </main>
  );
}

function HeaderPill({
  label,
  tone = "navy",
  value,
}: {
  label: string;
  tone?: "green" | "navy";
  value: string;
}) {
  return (
    <div className="rounded-[9px] border border-white/10 bg-white/10 px-4 py-3">
      <span className="mr-3 text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/50">
        {label}
      </span>
      <span className={`text-sm font-extrabold ${tone === "green" ? "text-[#b6e6c6]" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}

function ModuleTile({ module }: { module: (typeof companyModules)[number] }) {
  return (
    <Link
      className="group rounded-[10px] border border-[#e3e1d7] bg-white px-3 py-4 transition hover:border-[#e23b2a]/40 hover:bg-[#fbfaf7]"
      href={module.href}
    >
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-[9px] bg-[#fff2ef] text-[#e23b2a]">
          <module.icon size={18} />
        </div>
        <div className="min-w-0">
          <div className="font-['Barlow_Condensed',Barlow,sans-serif] text-[22px] font-extrabold uppercase leading-none tracking-[0.03em] text-[#16294d]">
            {module.label}
          </div>
          <p className="mt-2 truncate text-xs font-bold text-[#7b8298]">{module.description}</p>
        </div>
      </div>
    </Link>
  );
}

function StatusCard({
  active = false,
  count,
  label,
  note,
}: {
  active?: boolean;
  count: number;
  label: string;
  note: string;
}) {
  return (
    <div
      className={`rounded-[13px] border bg-white p-4 shadow-[0_8px_24px_-20px_rgba(14,27,54,0.45)] ${
        active ? "border-[#16294d] ring-2 ring-[#16294d]/10" : "border-[#e3e1d7]"
      }`}
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
    </div>
  );
}

function DashboardMetric({
  icon: Icon,
  label,
  tone = "navy",
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone?: "navy" | "red";
  value: string;
}) {
  return (
    <div className="rounded-[11px] border border-[#e3e1d7] border-t-4 border-t-[#e23b2a] bg-[#fbfaf7] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#9aa1b2]">
          {label}
        </div>
        <Icon className={tone === "red" ? "text-[#e23b2a]" : "text-[#16294d]"} size={17} />
      </div>
      <div
        className={`mt-2 font-['Barlow_Condensed',Barlow,sans-serif] text-[32px] font-extrabold leading-none ${
          tone === "red" ? "text-[#e23b2a]" : "text-[#16294d]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function HouseSourceCard({
  house,
  index,
}: {
  house: (typeof houseFiles)[number];
  index: number;
}) {
  const accent = index % 3 === 0 ? "#e6aa14" : "#27a0bd";
  const model = projectModel(house);

  return (
    <article className="overflow-hidden rounded-[14px] border border-[#e3e1d7] bg-white shadow-[0_8px_24px_-18px_rgba(14,27,54,0.45)]">
      <div className="relative px-4 py-4">
        <div className="absolute bottom-0 left-0 top-0 w-1" style={{ backgroundColor: accent }} />
        <div className="grid gap-3 lg:grid-cols-[104px_1.05fr_0.7fr_0.7fr_0.7fr_1.2fr_130px] lg:items-center">
          <div className="rounded-[9px] border border-[#e3e1d7] bg-[#fbfaf7] p-2">
            <div className="grid aspect-[1.25] place-items-center rounded-[7px] border border-[#e3e1d7] bg-white text-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#9aa1b2]">
              Source File
            </div>
            <button className="mt-2 w-full rounded-[7px] border border-[#e3e1d7] bg-white py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#16294d]">
              + Contract
            </button>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-['Barlow_Condensed',Barlow,sans-serif] text-[28px] font-extrabold uppercase leading-none text-[#16294d]">
                {house.name}
              </h2>
              <span className="rounded-[7px] bg-[#eaf2ff] px-2.5 py-1 text-xs font-extrabold text-[#16294d]">
                {house.phase}
              </span>
            </div>
            <p className="mt-2 text-xs font-bold text-[#7b8298]">
              {house.lender} · {house.account}
            </p>
            <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9aa1b2]">
              {house.sqft.toLocaleString()} sqft · {house.qbo}
            </p>
          </div>

          <SummaryMetric label="House Sold" subValue={`${currency(house.salePrice / house.sqft)} / sqft`} value={currency(house.salePrice)} />
          <SummaryMetric label="Project Spent" subValue="QuickBooks truth" value={currency(house.actualSpent)} />
          <SummaryMetric
            emphasis={model.depositRemaining < 0 ? "alert" : "quiet"}
            label="Deposit Left"
            subValue="after early obligations"
            value={currency(model.depositRemaining)}
          />

          <div className="rounded-[10px] border border-[#e3e1d7] bg-white px-3 py-2">
            <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#9aa1b2]">
              Bucket health
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <BucketPhase label="M" value={model.perDraw.management} />
              <BucketPhase label="MK" value={model.perDraw.marketing} />
              <BucketPhase label="O" value={model.perDraw.operations} />
            </div>
            <p className="mt-2 text-[11px] font-bold text-[#7b8298]">
              {currency(model.profit)} profit · {percent(model.margin)} margin
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Link
              className="rounded-[8px] border border-[#e3e1d7] px-3 py-2 text-center text-xs font-extrabold uppercase tracking-[0.1em] transition hover:border-[#e23b2a]/40 bg-white text-[#16294d]"
              href="/setup-inputs"
            >
              Add Source
            </Link>
            <Link
              className="rounded-[8px] border border-[#16294d] px-3 py-2 text-center text-xs font-extrabold uppercase tracking-[0.1em] transition hover:border-[#e23b2a]/40 bg-[#16294d] text-white"
              href="/draws-budget"
            >
              Open Details
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-2 pl-2 md:grid-cols-3 lg:pl-[112px]">
          <SourceChip label="Contract" value={house.contract} />
          <SourceChip label="Draw Sheet" value={house.draw} />
          <SourceChip label="Missing" value={house.missing.join(", ")} warning />
        </div>
      </div>
    </article>
  );
}

function SummaryMetric({
  emphasis = "quiet",
  label,
  subValue,
  value,
}: {
  emphasis?: "quiet" | "alert";
  label: string;
  subValue?: string;
  value: string;
}) {
  return (
    <div
      className={`flex h-[74px] min-w-[132px] flex-col justify-center rounded-[10px] border border-[#e3e1d7] border-t-4 ${
        emphasis === "alert" ? "border-t-[#e23b2a]" : "border-t-[#d6dceb]"
      } bg-white px-3 py-2 shadow-[0_8px_20px_-20px_rgba(14,27,54,0.55)]`}
    >
      <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#9aa1b2]">
        {label}
      </div>
      <div
        className={`mt-1 font-['Barlow_Condensed',Barlow,sans-serif] text-[24px] font-extrabold leading-none ${
          emphasis === "alert" ? "text-[#9d251c]" : "text-[#16294d]"
        }`}
      >
        {value}
      </div>
      {subValue ? <div className="mt-1 text-[11px] font-bold text-[#7b8298]">{subValue}</div> : null}
    </div>
  );
}

function BucketPhase({ label, value }: { label: string; value: number }) {
  return (
    <span className="grid h-10 place-items-center rounded-[7px] border border-[#b9dec9] bg-[#eaf7f0] px-1 text-center text-[10px] font-extrabold text-[#1f6f4b]">
      {label}
      <span className="block text-[9px]">{currency(value)}</span>
    </span>
  );
}

function SourceChip({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="rounded-[9px] border border-[#e3e1d7] bg-[#fbfaf7] px-3 py-2">
      <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#9aa1b2]">{label}</div>
      <div className={`mt-1 text-xs font-extrabold ${warning ? "text-[#9d251c]" : "text-[#16294d]"}`}>
        {value}
      </div>
    </div>
  );
}

function Panel({
  children,
  kicker,
  title,
}: {
  children: React.ReactNode;
  kicker: string;
  title: string;
}) {
  return (
    <section className="rounded-[14px] border border-[#e3e1d7] bg-white p-4 shadow-[0_8px_24px_-18px_rgba(14,27,54,0.45)]">
      <div className="mb-4">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#e23b2a]">
          {kicker}
        </div>
        <h2 className="mt-1 font-['Barlow_Condensed',Barlow,sans-serif] text-[30px] font-extrabold uppercase leading-none text-[#16294d]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function SourceRow({ row }: { row: (typeof sourceRows)[number] }) {
  const styles = {
    calculated: "bg-[#eaf2ff] text-[#16294d]",
    connected: "bg-[#eaf7f0] text-[#1f6f4b]",
    missing: "bg-[#fdebea] text-[#9d251c]",
    partial: "bg-[#fff7e6] text-[#9b6615]",
  } satisfies Record<SourceState, string>;

  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[#e3e1d7] bg-[#fbfaf7] p-3">
      <div className={`grid size-10 shrink-0 place-items-center rounded-[8px] ${styles[row.state]}`}>
        {row.state === "connected" ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-extrabold text-[#16294d]">{row.label}</p>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] ${styles[row.state]}`}>
            {row.state}
          </span>
        </div>
        <p className="mt-1 text-sm font-bold leading-5 text-[#7b8298]">{row.detail}</p>
      </div>
    </div>
  );
}

function DecisionRow({ decision }: { decision: (typeof aiDecisions)[number] }) {
  const tone =
    decision.tone === "green"
      ? "bg-[#eaf7f0] text-[#1f6f4b]"
      : decision.tone === "red"
        ? "bg-[#fdebea] text-[#9d251c]"
        : "bg-[#fff7e6] text-[#9b6615]";

  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-[#e3e1d7] bg-[#fbfaf7] p-3">
      <div className={`grid size-10 shrink-0 place-items-center rounded-[8px] ${tone}`}>
        {decision.tone === "green" ? <ShieldCheck size={18} /> : <CircleAlert size={18} />}
      </div>
      <div>
        <p className="text-sm font-extrabold text-[#16294d]">{decision.label}</p>
        <p className="mt-1 text-sm font-bold leading-5 text-[#7b8298]">{decision.text}</p>
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[#e3e1d7] bg-[#fbfaf7] p-3">
      <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#9aa1b2]">{label}</div>
      <div className="mt-1 font-['Barlow_Condensed',Barlow,sans-serif] text-[26px] font-extrabold leading-none text-[#16294d]">
        {value}
      </div>
    </div>
  );
}
