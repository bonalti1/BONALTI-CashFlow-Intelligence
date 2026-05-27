import Image from "next/image";
import Link from "next/link";
import {
  Brain,
  ClipboardList,
  HandCoins,
  LayoutDashboard,
  NotebookText,
  ShieldCheck,
} from "lucide-react";

import { AiHealthChat } from "@/app/ai-health/ai-health-chat";
import { getEnvStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

const bestQuestion =
  "What matters most today across houses, spending, checks, payees, and internal buckets?";

const summaryPrompt =
  "Generate a simple executive summary for South Texas Builders using the latest dashboard data. Answer this main question: what matters most today across houses, spending, checks, payees, and internal buckets? Keep it short, practical, and tell me what to check next.";

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
            <NavItem href="/ai-health" icon={Brain} label="AI Health Center" />
            <NavItem href="/payees" icon={HandCoins} label="Payees" />
            <NavItem active icon={NotebookText} label="Intelligent Center" />
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
              Simple AI command center. One question, one button, one clean summary.
            </p>
          </header>

          <section className="mx-auto max-w-3xl rounded-lg border border-[#dfe5dc] bg-white p-5">
            <section className="mb-4 rounded-lg bg-[#121a36] p-5 text-white">
              <div className="flex gap-3">
                <Brain className="mt-1 text-[#ff332b]" size={22} />
                <div>
                  <p className="brand-kicker text-xs font-bold uppercase text-[#ffb8b4]">
                    Best Question
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">{bestQuestion}</h2>
                  <p className="mt-2 text-sm leading-6 text-white/75">
                    This is the question that gives the best executive summary without making the
                    page complicated.
                  </p>
                </div>
              </div>
            </section>

            <AiHealthChat
              buttonLabel="Generate Summary With AI"
              hideInput
              initialQuestion={summaryPrompt}
              openAiReady={openAiReady}
            />
          </section>
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
