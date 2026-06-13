import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { savePlaidPublicToken } from "@/lib/plaid/bank-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      institution?: {
        institution_id?: string;
        name?: string;
      };
      publicToken?: string;
    };
    const publicToken = typeof body.publicToken === "string" ? body.publicToken : "";

    if (!publicToken) {
      return NextResponse.json(
        { status: "error", message: "Plaid public token is missing." },
        { status: 400 },
      );
    }

    const saved = await savePlaidPublicToken({
      institutionId: body.institution?.institution_id ?? null,
      institutionName: body.institution?.name ?? null,
      publicToken,
    });

    revalidatePath("/bank-feed");
    revalidatePath("/draws-budget");

    return NextResponse.json({
      status: "ok",
      ...saved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plaid connection failed.";

    return NextResponse.json(
      {
        status: "error",
        message:
          message.includes("DATABASE_URL")
            ? "Connecting Plaid needs the database connection. Use the live Render app or add DATABASE_URL locally."
            : message,
      },
      { status: 500 },
    );
  }
}
