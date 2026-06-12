import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { saveHouseContractSource } from "@/lib/houses/house-details-store";
import { uploadSupabaseStorageObject } from "@/lib/storage/supabase-storage";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  return text || null;
}

function optionalMoney(value: FormDataEntryValue | null) {
  const text = String(value ?? "").replace(/[$,]/g, "").trim();

  if (!text) {
    return null;
  }

  const parsed = Number(text);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Contract price must be a positive number.");
  }

  return parsed;
}

function optionalInteger(value: FormDataEntryValue | null) {
  const text = String(value ?? "").replace(/,/g, "").trim();

  if (!text) {
    return null;
  }

  const parsed = Number(text);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Square footage must be a whole positive number.");
  }

  return parsed;
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

    let contractFileName: string | null = null;
    let contractFileType: string | null = null;
    let contractFileUrl: string | null = null;
    let contractStoragePath: string | null = null;
    let contractFileDataUrl: string | null = null;

    if (contractFile instanceof File && contractFile.size > 0) {
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

      contractFileName = contractFile.name;
      contractFileType = contentType;
      contractFileUrl = uploaded?.url ?? null;
      contractStoragePath = uploaded?.path ?? null;
      contractFileDataUrl = uploaded ? null : `data:${contentType};base64,${buffer.toString("base64")}`;
    }

    await saveHouseContractSource({
      qboBankAccountId,
      houseName,
      contractFileName,
      contractFileType,
      contractFileUrl,
      contractStoragePath,
      contractFileDataUrl,
      contractPrice: optionalMoney(formData.get("contractPrice")),
      contractSquareFootage: optionalInteger(formData.get("contractSquareFootage")),
      contractCity: optionalText(formData.get("contractCity")),
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
