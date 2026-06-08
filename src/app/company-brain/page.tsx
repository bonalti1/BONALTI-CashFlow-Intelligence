import Image from "next/image";
import Link from "next/link";
import {
  Brain,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Database,
  HandCoins,
  LayoutDashboard,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { getPublicAppUrl } from "@/lib/app-url";
import { getCompanyExecutiveBrief } from "@/lib/company/brain-store";

export const dynamic = "force-dynamic";

function formatMetric(value: number | null, unit: string | null) {
  if (value === null) {
    return "Not ready";
  }

  if (unit === "dollars") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function statusTone(status: string) {
  if (["healthy", "ready"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (["needs_refresh", "missing_key"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-[#d9dee9] bg-[#f7f8f5] text-[#5f6b66]";
}

export default async function CompanyBrainPage() {
  const appUrl = getPublicAppUrl();
  const brief = await getCompanyExecutiveBrief().catch(() => null);
  const status = brief?.status;
  const financeMetrics = brief?.metrics.filter((metric) => metric.department === "finance") ?? [];
  const dataSources = brief?.dataSources ?? [];
  const reports = brief?.latestAiReports ?? [];

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-[#121a36]">
      <div className="grid min-h-screen grid-cols-[248px_1fr]">
        <aside className="border-r border-[#d9dee9] bg-white px-5 py-5 shadow-sm">
          <div className="mb-8">
            <div className="mb-4 rounded-lg border border-[#d9dee9] bg-white p-3 shadow-sm">
              <Image
                alt="South Texas Builders"
                className="h-auto w-full"
                height={1080}
                src="/south-texas-builders-logo.png"
                width={1080}
              />
            </div>
            <div>
              <div className="brand-heading text-base font-semibold text-[#121d49]">
                South Texas Builders
              </div>
              <div className="brand-kicker mt-1 text-[10px] font-medium uppercase text-[#ff332b]">
                Company Brain
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            <NavItem href="/" icon={LayoutDashboard} label="Portfolio" />
            <NavItem href="/setup-inputs" icon={ClipboardList} label="House Setup" />
            <NavItem href="/draws-budget" icon={ClipboardCheck} label="Draws & Budget" />
            <NavItem href="/payees" icon={HandCoins} label="Payees" />
            <NavItem href="/agent-health" icon={Brain} label="Intelligent Center" />
            <NavItem active icon={Database} label="Company Brain" />
            <NavItem href="/setup" icon={ShieldCheck} label="Setup" />
          </nav>
        </aside>

        <section className="min-w-0 px-6 py-5">
          <header className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="brand-kicker text-xs font-bold uppercase text-[#ff332b]">
                Digital C-Suite Memory
              </p>
              <h1 className="mt-1 text-3xl font-semibold text-[#121d49]">
                Company Brain
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f6b66]">
                This is the shared memory for the company. QuickBooks, budgets, AI reports,
                marketing data, payroll data, and future departments can all feed this same
                database.
              </p>
            </div>
            <a
              className="inline-flex items-center gap-2 rounded-md bg-[#121d49] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#ff332b]"
              href={`${appUrl}/api/company-brain/sync`}
            >
              <RefreshCcw size={16} />
              Sync Brain
            </a>
          </header>

          {!brief ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-sm font-bold text-amber-900">Company Brain Not Ready</h2>
              <p className="mt-2 text-sm leading-6 text-amber-800">
                The page is ready, but the database has not returned the company brain yet. Click
                Sync Brain after QuickBooks and the CFO layer are connected.
              </p>
            </section>
          ) : (
            <div className="space-y-5">
              <section className="grid grid-cols-3 gap-3">
                <MetricCard
                  icon={Database}
                  label="Data Sources"
                  value={String(status?.dataSources ?? 0)}
                  detail="APIs and company systems connected to memory"
                />
                <MetricCard
                  icon={Building2}
                  label="Executive Metrics"
                  value={String(status?.metrics ?? 0)}
                  detail="Numbers saved for the future C-suite"
                />
                <MetricCard
                  icon={Sparkles}
                  label="Saved AI Reports"
                  value={String(status?.aiReports ?? 0)}
                  detail="AI answers stored for future review"
                />
              </section>

              <section className="rounded-lg border border-[#dfe5dc] bg-white shadow-sm">
                <div className="border-b border-[#e6ebe3] bg-[#fbfcfa] px-4 py-3">
                  <h2 className="text-sm font-bold text-[#121d49]">Connected Company Data</h2>
                  <p className="mt-1 text-xs text-[#69746f]">
                    These are the systems the digital C-suite can already see.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4">
                  {dataSources.map((source) => (
                    <div
                      className="rounded-lg border border-[#dfe5dc] bg-[#fbfcfa] p-4"
                      key={source.slug}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-[#121d49]">{source.label}</h3>
                          <p className="mt-1 text-xs uppercase text-[#69746f]">
                            {source.department} / {source.sourceType}
                          </p>
                        </div>
                        <span
                          className={`rounded-md border px-2 py-1 text-[11px] font-bold uppercase ${statusTone(
                            source.status,
                          )}`}
                        >
                          {source.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[#5f6b66]">{source.healthNote}</p>
                      <p className="mt-2 text-xs text-[#69746f]">
                        Last sync: {source.lastSyncedAt ?? "Not synced yet"}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-[#dfe5dc] bg-white shadow-sm">
                <div className="border-b border-[#e6ebe3] bg-[#fbfcfa] px-4 py-3">
                  <h2 className="text-sm font-bold text-[#121d49]">Executive Metrics</h2>
                  <p className="mt-1 text-xs text-[#69746f]">
                    Simple numbers saved from the current company tables.
                  </p>
                </div>
                <div className="grid grid-cols-5 gap-3 p-4">
                  {financeMetrics.map((metric) => (
                    <div
                      className="rounded-lg border border-[#dfe5dc] bg-white p-4"
                      key={`${metric.sourceSlug}-${metric.key}`}
                    >
                      <p className="text-[11px] font-bold uppercase text-[#69746f]">
                        {metric.label}
                      </p>
                      <div className="mt-2 text-xl font-bold text-[#121d49]">
                        {formatMetric(metric.value, metric.unit)}
                      </div>
                      {metric.unit ? (
                        <p className="mt-1 text-xs text-[#69746f]">{metric.unit}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid grid-cols-[1fr_360px] gap-5">
                <div className="rounded-lg border border-[#dfe5dc] bg-white p-5 shadow-sm">
                  <p className="brand-kicker text-[10px] font-bold uppercase text-[#ff332b]">
                    Future Structure
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-[#121d49]">
                    Digital C-Suite Seats
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#5f6b66]">
                    Each future agent should read the same company brain. That way the CFO, CMO,
                    COO, and payroll agent are not guessing from separate files.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {[
                      ["CFO Agent", "Project health, cash flow, phase budgets, margins."],
                      ["CMO Agent", "Meta, Google Sheets, GHL leads, ad spend, close rate."],
                      ["COO Agent", "Stalled projects, vendors, phase movement, capacity."],
                      ["Payroll Agent", "Management bucket, payroll burn, draw rules."],
                    ].map(([title, detail]) => (
                      <div className="rounded-lg border border-[#dfe5dc] bg-[#fbfcfa] p-4" key={title}>
                        <h3 className="text-sm font-bold text-[#121d49]">{title}</h3>
                        <p className="mt-2 text-sm leading-5 text-[#5f6b66]">{detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-[#dfe5dc] bg-white p-5 shadow-sm">
                  <p className="brand-kicker text-[10px] font-bold uppercase text-[#ff332b]">
                    AI Memory
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-[#121d49]">Latest AI Reports</h2>
                  {reports.length === 0 ? (
                    <p className="mt-3 text-sm leading-6 text-[#5f6b66]">
                      No AI reports are saved yet. Once you generate summaries in the Intelligent
                      Center, they will be stored here.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {reports.map((report) => (
                        <div className="rounded-lg border border-[#dfe5dc] p-3" key={report.id}>
                          <h3 className="text-sm font-bold text-[#121d49]">{report.title}</h3>
                          <p className="mt-1 line-clamp-3 text-xs leading-5 text-[#5f6b66]">
                            {report.answer}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function NavItem({
  icon: Icon,
  label,
  active = false,
  href,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  active?: boolean;
  href?: string;
}) {
  const className = `flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm ${
    active
      ? "border-l-4 border-[#ff332b] bg-[#fff0ef] font-bold text-[#ff332b]"
      : "text-[#5f6b66] hover:bg-[#fff0ef] hover:text-[#ff332b]"
  }`;

  if (href) {
    return (
      <Link className={className} href={href}>
        <Icon size={17} />
        {label}
      </Link>
    );
  }

  return (
    <div className={className}>
      <Icon size={17} />
      {label}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-[#dfe5dc] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-bold uppercase text-[#69746f]">{label}</span>
        <div className="flex size-9 items-center justify-center rounded-lg bg-[#fff0ef]">
          <Icon className="text-[#ff332b]" size={18} />
        </div>
      </div>
      <div className="text-2xl font-bold text-[#121d49]">{value}</div>
      <div className="mt-1 text-xs text-[#69746f]">{detail}</div>
    </div>
  );
}
