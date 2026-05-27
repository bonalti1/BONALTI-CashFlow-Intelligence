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

const intelligenceQuestions = [
  "Which houses need attention first today?",
  "Which house has the biggest budget risk?",
  "Which house may have the lowest profit if spending continues?",
  "Which houses are missing sold price, square footage, or city?",
  "Which checks or payments should accounting review?",
  "Which houses look stalled or have not had recent activity?",
  "Which vendors or payees are receiving the most money?",
  "Which internal bucket needs attention: marketing, management, payroll, or operations?",
  "Where could we be overspending compared with the budget rules?",
  "What changed since the last QuickBooks sync?",
  "What should I ask my accountant before approving the next draw?",
  "What is the simplest summary I should read before a team meeting?",
];

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
              Simple AI command center. Pick the question you care about, or generate one clean
              summary from the live dashboard data.
            </p>
          </header>

          <section className="grid grid-cols-[1fr_420px] gap-4">
            <section className="rounded-lg border border-[#dfe5dc] bg-white">
              <div className="border-b border-[#edf0eb] px-4 py-3">
                <h2 className="text-sm font-semibold">Questions To Ask</h2>
                <p className="mt-1 text-xs text-[#69746f]">
                  These are the main questions the AI should help answer as the data gets cleaner.
                </p>
              </div>

              <div className="grid gap-2 p-4 md:grid-cols-2">
                {intelligenceQuestions.map((question) => (
                  <div
                    className="rounded-md border border-[#edf0eb] bg-[#fbfcfa] p-3 text-sm leading-5 text-[#384641]"
                    key={question}
                  >
                    {question}
                  </div>
                ))}
              </div>
            </section>

            <aside className="rounded-lg border border-[#dfe5dc] bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Brain className="text-[#ff332b]" size={18} />
                <h2 className="text-sm font-semibold">Generate Summary With AI</h2>
              </div>
              <AiHealthChat
                buttonLabel="Generate Summary With AI"
                initialQuestion="Generate a simple executive summary for South Texas Builders using the latest dashboard data. Tell me what matters most today, what needs attention, and what question I should ask next."
                openAiReady={openAiReady}
              />
            </aside>
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
