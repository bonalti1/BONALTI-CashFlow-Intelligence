"use client";

import { useState } from "react";
import { Brain, Loader2, Send } from "lucide-react";

import { AiHealthChat } from "@/app/ai-health/ai-health-chat";

type SummaryCardKey =
  | "marginRead"
  | "budgetPressure"
  | "vendorPricing"
  | "drawCashTiming"
  | "controllerNextMove";

type ExecutiveSummary = Record<SummaryCardKey, string>;

const defaultSummary: ExecutiveSummary = {
  marginRead:
    "Generate the summary to read where profit may be protected or at risk.",
  budgetPressure:
    "The AI will compare spending to sold price, square footage, phase budget, and setup data.",
  vendorPricing:
    "The AI will look for payees or subcontractors that may be charging more than before.",
  drawCashTiming:
    "The AI will review draw timing, missing draw marks, and internal bucket rules for marketing, management, and operations.",
  controllerNextMove:
    "The AI will give the next simple CFO action for the owner, accountant, payroll team, or construction team.",
};

const summaryPrompt = `
Generate an AI CFO summary for South Texas Builders using the latest dashboard data.
Return ONLY valid JSON with these exact keys:
{
  "marginRead": "short paragraph",
  "budgetPressure": "short paragraph",
  "vendorPricing": "short paragraph",
  "drawCashTiming": "short paragraph",
  "controllerNextMove": "short paragraph"
}

Think like an expert CFO for a custom home builder.
The summary should answer what matters most today across house margin, phase budget, vendor pricing, draw status, payees, and internal buckets.
Do not ask generic questions like which house spent the most. A larger house may spend more because it sold for more.
Compare cost against sold price, square footage, current phase, budget rules, and prior payee behavior when the data exists.
Every field must be written at an 8th grade reading level.
Use short sentences and plain words.
Avoid accounting and finance jargon. If a hard word is needed, explain it in simple words.
Do not sound like a bank report. Sound like a clear owner update.
Do not invent missing data.
If Chart of Accounts or phase mapping is provisional, say so clearly.
`;

const cards: Array<{ key: SummaryCardKey; label: string }> = [
  { key: "marginRead", label: "Margin Read" },
  { key: "budgetPressure", label: "Budget Pressure" },
  { key: "vendorPricing", label: "Vendor Pricing" },
  { key: "drawCashTiming", label: "Draw / Cash Timing" },
  { key: "controllerNextMove", label: "Controller Next Move" },
];

const controllerQuestions = [
  "Which contractors or payees look like they may be charging more than before, and what should we review first?",
  "Which houses may be losing margin after comparing sold price, square footage, current phase, and spending?",
  "Which draw items look submitted, missing, or delayed, and what money should we follow up on?",
  "What should the accountant and owner review today to protect profit and cash flow?",
];

function parseSummary(answer: string): ExecutiveSummary {
  try {
    const jsonStart = answer.indexOf("{");
    const jsonEnd = answer.lastIndexOf("}");
    const maybeJson = jsonStart >= 0 && jsonEnd >= 0 ? answer.slice(jsonStart, jsonEnd + 1) : answer;
    const parsed = JSON.parse(maybeJson) as Partial<ExecutiveSummary>;

    return {
      marginRead: parsed.marginRead || answer,
      budgetPressure: parsed.budgetPressure || "No clear budget pressure item was returned.",
      vendorPricing: parsed.vendorPricing || "No clear vendor pricing item was returned.",
      drawCashTiming: parsed.drawCashTiming || "No clear draw or cash timing item was returned.",
      controllerNextMove: parsed.controllerNextMove || "No clear next move was returned.",
    };
  } catch {
    return {
      ...defaultSummary,
      marginRead: answer,
    };
  }
}

export function IntelligentSummary({ openAiReady }: { openAiReady: boolean }) {
  const [summary, setSummary] = useState<ExecutiveSummary>(defaultSummary);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function generateSummary() {
    if (isLoading || !openAiReady) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ai/health", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: summaryPrompt,
        }),
      });
      const data = (await response.json()) as { answer?: string; message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "The AI could not generate the summary right now.");
      }

      setSummary(parseSummary(data.answer ?? ""));
      setGeneratedAt(new Date().toLocaleString());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The AI could not generate.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[12px] border-2 border-[#121d49] bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[9px] bg-[#121d49] text-white">
              <Send size={20} />
            </span>
            <div>
              <p className="brand-kicker text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff332b]">
                AI CFO
              </p>
              <h2 className="brand-heading text-[24px] font-bold uppercase tracking-[0.04em] text-[#121d49]">
                AI CFO (Chief Financial Officer)
              </h2>
            </div>
          </div>
          <p className="max-w-xl text-sm font-semibold leading-6 text-[#727d78]">
            Pick one CFO question, or ask anything you want about Project Health.
            The answer stays read-only.
          </p>
        </div>
        <AiHealthChat
          buttonLabel="Ask AI CFO"
          initialQuestion={controllerQuestions[0]}
          openAiReady={openAiReady}
          starterQuestions={controllerQuestions}
        />
      </section>

      <section className="rounded-[12px] border border-[#dedbd1] bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="brand-kicker text-[10px] font-bold uppercase tracking-[0.16em] text-[#ff332b]">
              AI Strategy
            </p>
            <h2 className="brand-heading mt-1 text-[18px] font-bold uppercase tracking-[0.04em] text-[#121d49]">
              AI CFO Summary
            </h2>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#121d49] px-4 text-xs font-bold uppercase tracking-[0.06em] text-white shadow-sm transition hover:bg-[#ff332b] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!openAiReady || isLoading}
            onClick={generateSummary}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {openAiReady ? "Generate Summary" : "Add OpenAI Key"}
          </button>
        </div>

        {generatedAt ? (
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-[#727d78]">
            Generated {generatedAt}
          </div>
        ) : null}

        {error ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-[#ff332b]">
            {error}
          </div>
        ) : null}

        <div className="grid gap-2 lg:grid-cols-5">
          {cards.map((card) => (
            <article
              className="min-h-[100px] rounded-[8px] border border-[#d9dee9] bg-white p-3"
              key={card.key}
            >
              <h3 className="brand-kicker text-[10px] font-bold uppercase tracking-[0.1em] text-[#121d49]">
                {card.label}
              </h3>
              <p className="mt-2 line-clamp-4 text-[11px] font-semibold leading-5 text-[#5f6b66]">
                {summary[card.key]}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
