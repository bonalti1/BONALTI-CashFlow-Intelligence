"use client";

import { useMemo, useState } from "react";
import { Brain, Loader2, Send } from "lucide-react";

import { AiHealthChat } from "@/app/ai-health/ai-health-chat";

type SummaryCardKey =
  | "overallRead"
  | "whatIsWorking"
  | "whatNeedsAttention"
  | "cashBudgetBottleneck"
  | "recommendedNextMoves";

type ExecutiveSummary = Record<SummaryCardKey, string>;

const defaultSummary: ExecutiveSummary = {
  overallRead:
    "Generate the summary to read the latest QuickBooks, house setup, spending, and project health data.",
  whatIsWorking:
    "The AI will identify the cleanest parts of the operation, such as healthy houses, strong internal buckets, or clean project setup.",
  whatNeedsAttention:
    "The AI will flag missing setup, budget pressure, unclear checks, stalled houses, or data that needs accounting cleanup.",
  cashBudgetBottleneck:
    "The AI will look for the biggest place where cash flow, checks, phase spending, or internal buckets may slow decisions.",
  recommendedNextMoves:
    "The AI will give the next practical moves for the owner, accountant, payroll team, or construction team.",
};

const summaryPrompt = `
Generate an executive summary for South Texas Builders using the latest dashboard data.
Return ONLY valid JSON with these exact keys:
{
  "overallRead": "short paragraph",
  "whatIsWorking": "short paragraph",
  "whatNeedsAttention": "short paragraph",
  "cashBudgetBottleneck": "short paragraph",
  "recommendedNextMoves": "short paragraph"
}

The summary should answer: what matters most today across houses, spending, checks, payees, and internal buckets?
Every field must be written at an 8th grade reading level.
Use short sentences and plain words.
Avoid accounting and finance jargon. If a hard word is needed, explain it in simple words.
Do not sound like a bank report. Sound like a clear owner update.
Do not invent missing data.
If Chart of Accounts or phase mapping is provisional, say so clearly.
`;

const cards: Array<{ key: SummaryCardKey; label: string }> = [
  { key: "overallRead", label: "Overall Read" },
  { key: "whatIsWorking", label: "What Is Working" },
  { key: "whatNeedsAttention", label: "What Needs Attention" },
  { key: "cashBudgetBottleneck", label: "Cash / Budget Bottleneck" },
  { key: "recommendedNextMoves", label: "Recommended Next Moves" },
];

function parseSummary(answer: string): ExecutiveSummary {
  try {
    const jsonStart = answer.indexOf("{");
    const jsonEnd = answer.lastIndexOf("}");
    const maybeJson = jsonStart >= 0 && jsonEnd >= 0 ? answer.slice(jsonStart, jsonEnd + 1) : answer;
    const parsed = JSON.parse(maybeJson) as Partial<ExecutiveSummary>;

    return {
      overallRead: parsed.overallRead || answer,
      whatIsWorking: parsed.whatIsWorking || "No clear working pattern was returned.",
      whatNeedsAttention: parsed.whatNeedsAttention || "No clear attention item was returned.",
      cashBudgetBottleneck: parsed.cashBudgetBottleneck || "No clear bottleneck was returned.",
      recommendedNextMoves: parsed.recommendedNextMoves || "No clear next move was returned.",
    };
  } catch {
    return {
      ...defaultSummary,
      overallRead: answer,
    };
  }
}

export function IntelligentSummary({ openAiReady }: { openAiReady: boolean }) {
  const [summary, setSummary] = useState<ExecutiveSummary>(defaultSummary);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const generatedLabel = useMemo(() => {
    if (generatedAt) {
      return `Generated ${generatedAt}`;
    }

    return "Ready to generate from live dashboard data";
  }, [generatedAt]);

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
      <section className="rounded-lg border border-[#dfe5dc] bg-white p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="brand-kicker text-xs font-bold uppercase text-[#121d49]">AI Strategy</p>
            <h2 className="mt-1 text-2xl font-semibold text-[#18211f]">Executive Summary</h2>
          </div>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#121d49] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#ff332b] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!openAiReady || isLoading}
            onClick={generateSummary}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {openAiReady ? "Generate Summary" : "Add OpenAI Key"}
          </button>
        </div>

        <div className="mb-3 rounded-lg border border-[#d9dee9] bg-[#eef3fb] px-4 py-3 text-sm font-semibold text-[#5f6b66]">
          {generatedLabel}
        </div>

        {error ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-[#ff332b]">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-5">
          {cards.map((card) => (
            <article
              className="min-h-[210px] rounded-lg border border-[#d9dee9] bg-white p-4"
              key={card.key}
            >
              <h3 className="brand-kicker text-xs font-bold uppercase text-[#121d49]">
                {card.label}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#18211f]">{summary[card.key]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[#dfe5dc] bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Send className="text-[#ff332b]" size={18} />
          <h2 className="text-sm font-semibold">Ask A Specific Question</h2>
        </div>
        <AiHealthChat openAiReady={openAiReady} />
      </section>
    </div>
  );
}
