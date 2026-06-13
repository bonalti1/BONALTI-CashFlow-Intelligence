"use client";

import { useEffect, useState, type ButtonHTMLAttributes } from "react";
import { Landmark, Loader2 } from "lucide-react";

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        onExit?: (error: unknown, metadata: unknown) => void;
        onSuccess: (
          publicToken: string,
          metadata: {
            institution?: {
              institution_id?: string;
              name?: string;
            };
          },
        ) => void;
        token: string;
      }) => {
        open: () => void;
      };
    };
  }
}

function loadPlaidScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.Plaid) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>("script[data-plaid-link]");

    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Plaid Link script failed.")));
      return;
    }

    const script = document.createElement("script");

    script.async = true;
    script.dataset.plaidLink = "true";
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Plaid Link script failed.")));
    document.head.appendChild(script);
  });
}

export function PlaidLinkButton({
  className,
  children = "Connect Bank",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadPlaidScript().catch(() => {
      setMessage("Plaid Link could not load. Refresh and try again.");
    });
  }, []);

  async function handleConnect() {
    try {
      setBusy(true);
      setMessage(null);
      await loadPlaidScript();

      const linkResponse = await fetch("/api/plaid/link-token", {
        method: "POST",
      });
      const linkData = (await linkResponse.json()) as {
        linkToken?: string;
        message?: string;
        status: string;
      };

      if (!linkResponse.ok || !linkData.linkToken) {
        throw new Error(linkData.message || "Could not start Plaid.");
      }

      window.Plaid?.create({
        token: linkData.linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const exchangeResponse = await fetch("/api/plaid/exchange", {
              body: JSON.stringify({
                institution: metadata.institution,
                publicToken,
              }),
              headers: {
                "Content-Type": "application/json",
              },
              method: "POST",
            });
            const exchangeData = (await exchangeResponse.json()) as {
              message?: string;
              status: string;
            };

            if (!exchangeResponse.ok) {
              throw new Error(exchangeData.message || "Could not save bank connection.");
            }

            window.location.reload();
          } catch (error) {
            setBusy(false);
            setMessage(error instanceof Error ? error.message : "Could not save bank connection.");
          }
        },
        onExit: () => {
          setBusy(false);
        },
      }).open();
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Bank connection failed.");
    }
  }

  return (
    <div>
      <button
        className={
          className ??
          "inline-flex items-center gap-2 rounded-md bg-[#13254b] px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white shadow-sm disabled:opacity-60"
        }
        disabled={busy}
        onClick={handleConnect}
        type="button"
        {...props}
      >
        {busy ? <Loader2 className="animate-spin" size={16} /> : <Landmark size={16} />}
        {children}
      </button>
      {message ? <p className="mt-2 text-sm font-bold text-[#d94736]">{message}</p> : null}
    </div>
  );
}
