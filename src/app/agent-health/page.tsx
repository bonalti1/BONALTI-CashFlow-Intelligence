import Image from "next/image";
import Link from "next/link";
import {
  Brain,
  ClipboardCheck,
  ClipboardList,
  Database,
  HandCoins,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";

import { IntelligentSummary } from "@/app/agent-health/intelligent-summary";
import { getEnvStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AgentHealthPage() {
  const env = await getEnvStatus();
  const openAiReady = Boolean(env.find((item) => item.key === "OPENAI_API_KEY")?.configured);

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-[#121a36]">
      <div className="grid min-h-screen grid-cols-[248px_1fr]">
        <aside className="border-r border-[#d9dee9] bg-white px-5 py-5">
          <div className="mb-8">
            <div className="mb-4 rounded-lg border border-[#d9dee9] bg-white p-3">
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
                Intelligent Center
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            <NavItem href="/" icon={LayoutDashboard} label="Portfolio" />
            <NavItem href="/setup-inputs" icon={ClipboardList} label="House Setup" />
            <NavItem href="/draws-budget" icon={ClipboardCheck} label="Draws & Budget" />
            <NavItem href="/payees" icon={HandCoins} label="Payees" />
            <NavItem active icon={Brain} label="Intelligent Center" />
            <NavItem href="/company-brain" icon={Database} label="Company Brain" />
            <NavItem href="/setup" icon={ShieldCheck} label="Setup" />
          </nav>
        </aside>

        <section className="min-w-0 px-6 py-5">
          <header className="mb-5">
            <p className="brand-kicker text-xs font-bold uppercase text-[#ff332b]">
              Intelligent Center
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-[#121d49]">
              Intelligent Center
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f6b66]">
              Generate a clean executive summary, then ask a specific follow-up question when
              needed.
            </p>
          </header>

          <IntelligentSummary openAiReady={openAiReady} />
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
      ? "bg-[#fff0ef] font-bold text-[#ff332b]"
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
