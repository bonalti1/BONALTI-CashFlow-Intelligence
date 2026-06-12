import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { saveHouseContractSource } from "@/lib/houses/house-details-store";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  return text || null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const qboBankAccountId = optionalText(formData.get("qboBankAccountId"));
    const houseName = optionalText(formData.get("houseName"));
    const contractFile = formData.get("contractFile");

    if (!qboBankAccountId || !houseName) {
      return NextResponse.json(
        { status: "error", message: "House account is missing." },
        { status: 400 },
      );
    }

    if (!(contractFile instanceof File) || contractFile.size === 0) {
      return NextResponse.json(
        { status: "error", message: "Please choose a contract PDF or image." },
        { status: 400 },
      );
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(contractFile.type)) {
      return NextResponse.json(
        { status: "error", message: "Contract must be a PDF or image file." },
        { status: 400 },
      );
    }

    const maxSize = 6 * 1024 * 1024;

    if (contractFile.size > maxSize) {
      return NextResponse.json(
        { status: "error", message: "Contract file must be smaller than 6 MB." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await contractFile.arrayBuffer());

    await saveHouseContractSource({
      qboBankAccountId,
      houseName,
      contractFileName: contractFile.name,
      contractFileType: contractFile.type,
      contractFileDataUrl: `data:${contractFile.type};base64,${buffer.toString("base64")}`,
      contractPrice: null,
      contractSquareFootage: null,
      contractCity: null,
    });

    revalidatePath("/");
    revalidatePath("/draws-budget");
    revalidatePath("/setup-inputs");
    revalidatePath("/reports/dashboard");

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contract upload failed.";

    return NextResponse.json(
      {
        status: "error",
        message:
          message.includes("DATABASE_URL")
            ? "Saving contracts needs the database connection. Use the live Render app or add DATABASE_URL locally."
            : message,
      },
      { status: 500 },
    );
  }
}
