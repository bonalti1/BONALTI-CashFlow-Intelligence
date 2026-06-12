import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { saveHouseContractSource } from "@/lib/houses/house-details-store";
import { uploadSupabaseStorageObject } from "@/lib/storage/supabase-storage";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  return text || null;
}

function isAllowedContractFile(file: File) {
  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/octet-stream"];
  const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
  const fileName = file.name.toLowerCase();

  return allowedTypes.includes(file.type) || allowedExtensions.some((extension) => fileName.endsWith(extension));
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

    if (!isAllowedContractFile(contractFile)) {
      return NextResponse.json(
        { status: "error", message: "Contract must be a PDF or image file." },
        { status: 400 },
      );
    }

    const maxSize = 25 * 1024 * 1024;

    if (contractFile.size > maxSize) {
      return NextResponse.json(
        { status: "error", message: "Contract file must be smaller than 25 MB." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await contractFile.arrayBuffer());
    const contentType = contractFile.type || "application/octet-stream";
    const uploaded = await uploadSupabaseStorageObject({
      bucket: process.env.SUPABASE_CONTRACT_BUCKET ?? "house-contracts",
      bytes: buffer,
      contentType,
      fileName: contractFile.name,
      folder: `${qboBankAccountId}-${houseName}`,
      isPublic: false,
    });

    await saveHouseContractSource({
      qboBankAccountId,
      houseName,
      contractFileName: contractFile.name,
      contractFileType: contentType,
      contractFileUrl: uploaded?.url ?? null,
      contractStoragePath: uploaded?.path ?? null,
      contractFileDataUrl: uploaded ? null : `data:${contentType};base64,${buffer.toString("base64")}`,
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
