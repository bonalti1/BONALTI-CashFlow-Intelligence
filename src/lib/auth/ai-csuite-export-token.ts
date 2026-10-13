import { NextResponse } from "next/server";

export type AiCsuiteExportAuth =
  | { ok: true }
  | { ok: false; status: 401 | 500; message: string };

export function authorizeAiCsuiteExportToken(request: Request): AiCsuiteExportAuth {
  const expectedToken = process.env.AI_CSUITE_EXPORT_TOKEN;

  if (!expectedToken) {
    return {
      ok: false,
      status: 500,
      message: "AI_CSUITE_EXPORT_TOKEN is not configured.",
    };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || token !== expectedToken) {
    return {
      ok: false,
      status: 401,
      message: "Missing or invalid bearer token.",
    };
  }

  return { ok: true };
}

export function aiCsuiteExportDenied(auth: Exclude<AiCsuiteExportAuth, { ok: true }>) {
  return NextResponse.json(
    {
      status: "error",
      message: auth.message,
    },
    { status: auth.status },
  );
}
