import { NextResponse } from "next/server";

import {
  getHouseDetailsMap,
  getHouseProjectDocuments,
} from "@/lib/houses/house-details-store";
import { downloadSupabaseStorageObject } from "@/lib/storage/supabase-storage";

const projectDocumentTypes = new Set(["bank_draw", "baseline", "supporting"]);

function dataUrlResponse(dataUrl: string, fileName: string, fileType: string | null) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    return NextResponse.json({ message: "Stored document is unavailable." }, { status: 404 });
  }

  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Disposition": `inline; filename="${fileName.replaceAll('"', "")}"`,
      "Content-Type": fileType ?? match[1] ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
    },
  });
}

function documentResponse(
  bytes: ArrayBuffer,
  fileName: string,
  contentType: string,
) {
  return new Response(bytes, {
    headers: {
      "Content-Disposition": `inline; filename="${fileName.replaceAll('"', "")}"`,
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const houseId = searchParams.get("houseId")?.trim();
  const documentType = searchParams.get("type")?.trim();

  if (!houseId || !documentType) {
    return NextResponse.json({ message: "Document reference is missing." }, { status: 400 });
  }

  if (documentType === "contract") {
    const detail = (await getHouseDetailsMap()).get(houseId);

    if (!detail?.contractFileName) {
      return NextResponse.json({ message: "Contract is not available." }, { status: 404 });
    }

    if (detail.contractStoragePath) {
      const stored = await downloadSupabaseStorageObject({
        bucket: process.env.SUPABASE_CONTRACT_BUCKET ?? "house-contracts",
        path: detail.contractStoragePath,
      });

      if (stored) {
        return documentResponse(
          stored.bytes,
          detail.contractFileName,
          detail.contractFileType ?? stored.contentType,
        );
      }
    }

    if (detail.contractFileDataUrl) {
      return dataUrlResponse(
        detail.contractFileDataUrl,
        detail.contractFileName,
        detail.contractFileType,
      );
    }

    return NextResponse.json({ message: "Contract file could not be opened." }, { status: 404 });
  }

  if (!projectDocumentTypes.has(documentType)) {
    return NextResponse.json({ message: "Document type is invalid." }, { status: 400 });
  }

  const document = (await getHouseProjectDocuments(houseId)).find(
    (item) => item.documentType === documentType,
  );

  if (!document?.storagePath) {
    return NextResponse.json({ message: "Document is not available." }, { status: 404 });
  }

  const stored = await downloadSupabaseStorageObject({
    bucket: process.env.SUPABASE_PROJECT_DOCUMENT_BUCKET ?? "project-documents",
    path: document.storagePath,
  });

  return stored
    ? documentResponse(stored.bytes, document.fileName, document.fileType || stored.contentType)
    : NextResponse.json({ message: "Document file could not be opened." }, { status: 404 });
}
