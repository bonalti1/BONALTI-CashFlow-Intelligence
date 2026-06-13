"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

export function BankSyncButton({ disabled = false }: { disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    try {
      setBusy(true);
      setMessage(null);
      const response = await fetch("/api/plaid/sync", {
        method: "POST",
      });
      const data = (await response.json()) as {
        message?: string;
        status: string;
      };

      if (!response.ok) {
        throw new Error(data.message || "Bank sync failed.");
      }

      window.location.reload();
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Bank sync failed.");
    }
  }

  return (
    <div>
      <button
        className="inline-flex items-center gap-2 rounded-md border border-[#d8ded3] bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-[#13254b] shadow-sm disabled:opacity-50"
        disabled={disabled || busy}
        onClick={sync}
        type="button"
      >
        {busy ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
        Sync Bank
      </button>
      {message ? <p className="mt-2 text-sm font-bold text-[#d94736]">{message}</p> : null}
    </div>
  );
}
