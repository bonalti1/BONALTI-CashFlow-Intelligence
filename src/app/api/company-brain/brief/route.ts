import { NextResponse } from "next/server";

import { getCompanyExecutiveBrief } from "@/lib/company/brain-store";
import { authorizeApiRequest } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizeApiRequest(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const brief = await getCompanyExecutiveBrief();

    return NextResponse.json({
      status: "ok",
      brief,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: "Company executive brief failed.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
