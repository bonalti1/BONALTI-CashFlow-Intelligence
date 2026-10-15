"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { refreshBalancesOnOpen } from "@/app/actions/plaid";

export const balanceRefreshStartEvent = "stb:balances-refresh-start";
export const balanceRefreshDoneEvent = "stb:balances-refresh-done";

// Fires after the page is on screen. The server skips Plaid when a refresh
// already succeeded in the last 5 minutes.
export function PlaidBalanceRefresh() {
  const pathname = usePathname();
  const opened = useRef(false);

  useEffect(() => {
    const dashboard = pathname === "/" || pathname.startsWith("/draws-budget");

    if (!dashboard && opened.current) {
      return;
    }

    opened.current = true;
    let cancelled = false;

    window.dispatchEvent(new Event(balanceRefreshStartEvent));
    void refreshBalancesOnOpen().then((result) => {
      if (cancelled) {
        return;
      }

      window.dispatchEvent(new CustomEvent(balanceRefreshDoneEvent, { detail: result }));
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
