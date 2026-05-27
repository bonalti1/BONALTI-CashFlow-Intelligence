"use client";

import { useState } from "react";
import { Loader2, MessageSquareText, Send } from "lucide-react";

export function AiHealthChat({
  buttonLabel = "Ask AI",
  hideInput = false,
  initialQuestion = "Tell me which houses need attention first.",
  openAiReady,
}: {
  buttonLabel?: string;
  hideInput?: boolean;
  initialQuestion?: string;
  openAiReady: boolean;
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
          question,
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
    <div className="rounded-lg border border-dashed border-[#d9dee9] bg-[#f7f8f5] p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-[#121a36]">
        <MessageSquareText className="h-4 w-4 text-[#ff332b]" />
        Read-only construction analyst
      </div>
      <p className="mt-2 text-sm leading-6 text-[#5f6b66]">
        Ask questions about house risk, profit, budget health, and what needs attention. The AI
        reads the dashboard data and explains it. It does not change QuickBooks.
      </p>
      {hideInput ? null : (
        <textarea
          className="mt-4 min-h-28 w-full rounded-md border border-[#d9dee9] bg-white p-3 text-sm text-[#121a36] outline-none transition focus:border-[#ff332b]"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about a house, budget, profit, or risk..."
          disabled={!openAiReady || isLoading}
        />
      )}
      <button
        className={`${hideInput ? "mt-4" : "mt-3"} flex w-full items-center justify-center gap-2 rounded-md bg-[#121a36] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#ff332b] disabled:cursor-not-allowed disabled:opacity-60`}
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
