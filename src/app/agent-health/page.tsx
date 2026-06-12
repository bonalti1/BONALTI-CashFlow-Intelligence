import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Brain } from "lucide-react";

import { IntelligentSummary } from "@/app/agent-health/intelligent-summary";
import { getEnvStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AgentHealthPage() {
  const env = await getEnvStatus();
  const openAiReady = Boolean(env.find((item) => item.key === "OPENAI_API_KEY")?.configured);

  return (
    <main className="min-h-screen bg-[#f2f1ea] text-[#17213c] [background-image:linear-gradient(rgba(18,29,73,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(18,29,73,0.045)_1px,transparent_1px)] [background-size:32px_32px]">
      <header className="bg-[#121d49] px-6 py-5 text-white shadow-sm">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[9px] bg-white p-2 shadow-sm">
              <Image
                alt="South Texas Builders"
                className="h-full w-full object-contain"
                height={1080}
                src="/south-texas-builders-logo.png"
                width={1080}
              />
            </div>
            <div>
              <p className="brand-kicker text-[11px] font-bold uppercase tracking-[0.22em] text-[#ff332b]">
                AI Controller
              </p>
              <h1 className="brand-heading mt-1 flex items-center gap-3 text-[28px] font-bold uppercase tracking-[0.05em]">
                <Brain size={26} />
                AI Center
              </h1>
            </div>
          </div>

          <Link
            className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-white/20 bg-white/10 px-4 text-sm font-bold uppercase tracking-[0.06em] text-white hover:bg-white/15"
            href="/draws-budget"
          >
            <ArrowLeft size={17} />
            Back
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1440px] px-6 py-6">
        <div className="mb-5 rounded-[12px] border border-[#dedbd1] bg-white p-5 shadow-sm">
          <p className="brand-kicker text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff332b]">
            Executive Read
          </p>
          <h2 className="brand-heading mt-1 text-[24px] font-bold uppercase tracking-[0.04em] text-[#121d49]">
            AI Center
          </h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#727d78]">
            Generate a simple finance summary, then ask a follow-up question when needed.
          </p>
        </div>

        <IntelligentSummary openAiReady={openAiReady} />
      </section>
    </main>
  );
}
