"use client";

import { useState } from "react";
import { Loader2, MessageSquareText, Send } from "lucide-react";

export function AiHealthChat({
  buttonLabel = "Ask AI",
  hideInput = false,
  initialQuestion = "Tell me which houses need attention first.",
  openAiReady,
  starterQuestions = [],
}: {
  buttonLabel?: string;
  hideInput?: boolean;
  initialQuestion?: string;
  openAiReady: boolean;
  starterQuestions?: string[];
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function askAi() {
    if (!question.trim() || isLoading || !openAiReady) {
      return;
    }

    setIsLoading(true);
    setAnswer("");
    setError("");

    try {
      const response = await fetch("/api/ai/health", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: `${question}\n\nWrite this answer at an 8th grade reading level. Use short sentences, plain words, and clear bullets if helpful.`,
        }),
      });
      const data = (await response.json()) as { answer?: string; message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "The AI could not answer right now.");
      }

      setAnswer(data.answer ?? "");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The AI could not answer.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="rounded-[12px] border border-[#dedbd1] bg-[#fbfaf6] p-4">
      <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.08em] text-[#121a36]">
        <MessageSquareText className="h-4 w-4 text-[#ff332b]" />
        Read-only construction analyst
      </div>
      <p className="mt-2 text-sm font-semibold leading-6 text-[#5f6b66]">
        Ask questions about house risk, profit, budget health, and what needs attention. The AI
        reads the dashboard data and explains it in simple language. It does not change QuickBooks.
      </p>
      {starterQuestions.length > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {starterQuestions.map((starterQuestion) => (
            <button
              className="rounded-[8px] border border-[#d9dee9] bg-white px-3 py-2 text-left text-xs font-bold leading-5 text-[#121a36] transition hover:border-[#ff332b] hover:bg-[#fff8f7] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!openAiReady || isLoading}
              key={starterQuestion}
              onClick={() => setQuestion(starterQuestion)}
              type="button"
            >
              {starterQuestion}
            </button>
          ))}
        </div>
      ) : null}
      {hideInput ? null : (
        <textarea
          className="mt-4 min-h-36 w-full rounded-[10px] border-2 border-[#121d49] bg-white p-4 text-base font-semibold leading-7 text-[#121a36] outline-none transition placeholder:text-[#9aa3b7] focus:border-[#ff332b]"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask any Project Health question: house risk, budget, draws, vendors, payees, or cash flow..."
          disabled={!openAiReady || isLoading}
        />
      )}
      <button
        className={`${hideInput ? "mt-4" : "mt-3"} flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#121d49] px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-white transition hover:bg-[#ff332b] disabled:cursor-not-allowed disabled:opacity-60`}
        disabled={!openAiReady || isLoading || !question.trim()}
        onClick={askAi}
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {openAiReady ? buttonLabel : "Add OpenAI key to activate"}
      </button>
      {error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-[#ff332b]">
          {error}
        </div>
      ) : null}
      {answer ? (
        <div className="mt-4 whitespace-pre-wrap rounded-md border border-[#d9dee9] bg-white p-4 text-sm leading-6 text-[#121a36]">
          {answer}
        </div>
      ) : null}
    </div>
  );
}
