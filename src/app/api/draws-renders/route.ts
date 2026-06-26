import { NextResponse } from "next/server";

import { getHouseDashboardSummaries } from "@/lib/dashboard/house-dashboard-summary-store";
import { getSchedulingProjectVisualMap } from "@/lib/scheduling/status-store";

export const dynamic = "force-dynamic";

const renderCacheMs = 60_000;

type RenderPayload = {
  renders: Array<{
    houseId: string;
    house: string;
    renderImageUrl: string | null;
    source: "manual" | "scheduling" | "missing";
    updatedAt: string | null;
  }>;
  status: "ok";
};

let renderCache:
  | {
      expiresAt: number;
      payload: RenderPayload;
    }
  | null = null;

function withRenderTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 1500) {
  let timeout: NodeJS.Timeout;
  const guarded = promise.catch(() => fallback);

  return Promise.race([
    guarded,
    new Promise<T>((resolve) => {
      timeout = setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";

  if (!force && renderCache && renderCache.expiresAt > Date.now()) {
    return NextResponse.json(renderCache.payload, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=180",
        "Server-Timing": `draws-renders;dur=${Math.round(performance.now() - startedAt)};desc="hit"`,
      },
    });
  }

  const summaries = await withRenderTimeout(getHouseDashboardSummaries(), []);
  const schedulingVisuals = await withRenderTimeout(
    getSchedulingProjectVisualMap(summaries.map((summary) => ({ house: summary.house }))),
    new Map(),
  );

  const payload: RenderPayload = {
    renders: summaries.map((summary) => {
      const schedulingVisual = schedulingVisuals.get(summary.house);
      const renderImageUrl = summary.renderImageUrl ?? schedulingVisual?.renderImage ?? null;

      return {
        houseId: summary.id,
        house: summary.house,
        renderImageUrl,
        source: summary.renderImageUrl
          ? "manual"
          : schedulingVisual?.renderImage
            ? "scheduling"
            : "missing",
        updatedAt: schedulingVisual?.renderUpdatedAt ?? null,
      };
    }),
    status: "ok",
  };

  renderCache = {
    expiresAt: Date.now() + renderCacheMs,
    payload,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=180",
      "Server-Timing": `draws-renders;dur=${Math.round(performance.now() - startedAt)};desc="miss"`,
    },
  });
}
