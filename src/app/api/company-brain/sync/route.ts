import { NextResponse } from "next/server";

import { syncCompanyBrainFromCurrentData } from "@/lib/company/brain-store";
import { authorizeApiRequest, editorRoles } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizeApiRequest(request, { roles: editorRoles, allowCronSecret: true });

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const companyBrain = await syncCompanyBrainFromCurrentData();

    return NextResponse.json({
      status: "ok",
      message: "Company brain synced from the current company data tables.",
      companyBrain,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: "Company brain sync failed.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeApiRequest(request, { roles: editorRoles, allowCronSecret: true });

  if (!authorization.ok) {
    return authorization.response;
  }

  return GET(request);
}
