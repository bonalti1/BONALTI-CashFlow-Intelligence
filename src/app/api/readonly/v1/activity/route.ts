import { NextResponse } from "next/server";

import { listAuditEntries } from "@/lib/audit/audit-log";
import { authorizeReadOnlyKey } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await authorizeReadOnlyKey(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  const { searchParams } = new URL(request.url);
  const sinceText = searchParams.get("since");
  const since = sinceText ? new Date(sinceText) : null;
  const limit = Number(searchParams.get("limit") ?? 200);

  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json({ message: "since must be a date like 2026-01-31." }, { status: 400 });
  }

  try {
    const entries = await listAuditEntries({
      houseName: searchParams.get("project"),
      since,
      limit: Number.isFinite(limit) ? limit : 200,
    });

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        count: entries.length,
        entries: entries.map((entry) => ({
          id: entry.id,
          occurredAt: entry.occurredAt,
          actorType: entry.actorType,
          actorName: entry.actorName,
          action: entry.action,
          project: entry.houseName,
          summary: entry.summary,
          changes: entry.changes.map((change) => ({
            field: change.label,
            from: change.from,
            to: change.to,
          })),
          details: entry.details,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Read-only activity feed failed", error);

    return NextResponse.json({ message: "Could not load activity right now." }, { status: 500 });
  }
}
