import { NextResponse } from "next/server";

import { authorizeReadOnlyKey } from "@/lib/auth/session";
import { buildProjectFeed } from "@/lib/readonly/project-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await authorizeReadOnlyKey(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const projects = await buildProjectFeed();

    return NextResponse.json(
      { generatedAt: new Date().toISOString(), count: projects.length, projects },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Read-only project feed failed", error);

    return NextResponse.json({ message: "Could not load projects right now." }, { status: 500 });
  }
}
