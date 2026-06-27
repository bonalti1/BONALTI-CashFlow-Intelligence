import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  getHouseProjectDocuments,
  saveHouseProjectDocument,
} from "@/lib/houses/house-details-store";
import { uploadSupabaseStorageObject } from "@/lib/storage/supabase-storage";

const allowedDocumentTypes = new Set(["bank_draw", "baseline", "supporting"]);
const maxFileSize = 25 * 1024 * 1024;

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  return text || null;
}

function allowedFile(file: File) {
  const extension = file.name.toLowerCase().split(".").pop();

  return (
    file.type === "application/pdf" ||
    file.type.startsWith("image/") ||
    file.type.includes("spreadsheet") ||
    file.type.includes("excel") ||
    file.type === "text/csv" ||
    ["pdf", "jpg", "jpeg", "png", "webp", "xlsx", "xls", "csv"].includes(extension ?? "")
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const qboBankAccountId = searchParams.get("houseId")?.trim();

  if (!qboBankAccountId) {
    return NextResponse.json({ message: "House account is missing." }, { status: 400 });
  }

  const documents = await getHouseProjectDocuments(qboBankAccountId);

  return NextResponse.json({ documents, status: "ok" });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const qboBankAccountId = optionalText(formData.get("qboBankAccountId"));
    const houseName = optionalText(formData.get("houseName"));
    const documentType = optionalText(formData.get("documentType"));
    const documentFile = formData.get("documentFile");

    if (
      !qboBankAccountId ||
      !houseName ||
      !documentType ||
      !allowedDocumentTypes.has(documentType)
    ) {
      return NextResponse.json({ message: "Project document details are invalid." }, { status: 400 });
    }

    if (!(documentFile instanceof File) || documentFile.size === 0) {
      return NextResponse.json({ message: "Choose a document to upload." }, { status: 400 });
    }

    if (!allowedFile(documentFile)) {
      return NextResponse.json(
        { message: "Upload a PDF, image, spreadsheet, or CSV file." },
        { status: 400 },
      );
    }

    if (documentFile.size > maxFileSize) {
      return NextResponse.json({ message: "Document must be smaller than 25 MB." }, { status: 400 });
    }

    const bytes = Buffer.from(await documentFile.arrayBuffer());
    const contentType = documentFile.type || "application/octet-stream";
    const uploaded = await uploadSupabaseStorageObject({
      bucket: process.env.SUPABASE_PROJECT_DOCUMENT_BUCKET ?? "project-documents",
      bytes,
      contentType,
      fileName: documentFile.name,
      folder: `${qboBankAccountId}-${houseName}/${documentType}`,
      isPublic: false,
    });

    await saveHouseProjectDocument({
      qboBankAccountId,
      houseName,
      documentType,
      fileName: documentFile.name,
      fileType: contentType,
      fileUrl: uploaded?.url ?? null,
      storagePath: uploaded?.path ?? null,
    });

    revalidatePath("/draws-budget");

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Document upload failed.",
        status: "error",
      },
      { status: 500 },
    );
  }
}
