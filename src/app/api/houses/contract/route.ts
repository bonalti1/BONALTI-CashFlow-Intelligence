import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { extractContractSourceFromFile } from "@/lib/contracts/contract-extraction";
import { refreshHouseDashboardSummaries } from "@/lib/dashboard/house-dashboard-summary-store";
import {
  clearHouseContractSource,
  getHouseDetailsMap,
  saveHouseContractSource,
} from "@/lib/houses/house-details-store";
import { recordAudit } from "@/lib/audit/audit-log";
import { auditProjectChange } from "@/lib/audit/project-audit";

const contractFieldSpec = {
  contractPrice: { label: "Contract price", format: "money" as const },
  contractSquareFootage: { label: "Contract square feet", format: "number" as const },
  contractCity: { label: "Contract city" },
  contractFileName: { label: "Contract file" },
};

async function houseBefore(qboBankAccountId: string) {
  return (await getHouseDetailsMap()).get(qboBankAccountId) ?? null;
}
import {
  deleteSupabaseStorageObject,
  uploadSupabaseStorageObject,
} from "@/lib/storage/supabase-storage";
import { authorizeApiRequest, adminRoles, editorRoles } from "@/lib/auth/session";

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

function revalidateHousePages() {
  revalidatePath("/");
  revalidatePath("/draws-budget");
  revalidatePath("/setup-inputs");
  revalidatePath("/reports/dashboard");
}

function refreshDashboardSummaryInBackground() {
  void refreshHouseDashboardSummaries().catch((error) => {
    console.error("House dashboard summary refresh failed", error);
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function markContractNeedsReview({
  qboBankAccountId,
  houseName,
}: {
  qboBankAccountId: string;
  houseName: string;
}) {
  await saveHouseContractSource({
    qboBankAccountId,
    houseName,
    contractFileName: null,
    contractFileType: null,
    contractFileUrl: null,
    contractStoragePath: null,
    contractFileDataUrl: null,
    contractPrice: null,
    contractSquareFootage: null,
    contractCity: null,
    contractSourceStatus: "needs_review",
  });
  refreshDashboardSummaryInBackground();
  revalidateHousePages();
}

async function extractAndSaveContractSource({
  qboBankAccountId,
  houseName,
  bytes,
  contentType,
  fileName,
}: {
  qboBankAccountId: string;
  houseName: string;
  bytes: Buffer;
  contentType: string;
  fileName: string;
}) {
  try {
    const extracted = await withTimeout(
      extractContractSourceFromFile({
        bytes,
        contentType,
        fileName,
        houseName,
      }),
      90_000,
    );

    const contractPrice = extracted?.contractPrice ?? null;
    const contractSquareFootage = extracted?.contractSquareFootage ?? null;
    const contractCity = extracted?.contractCity ?? null;

    if (!contractPrice && !contractSquareFootage && !contractCity) {
      await markContractNeedsReview({ qboBankAccountId, houseName });
      return;
    }

    const before = await houseBefore(qboBankAccountId);

    await saveHouseContractSource({
      qboBankAccountId,
      houseName,
      contractFileName: null,
      contractFileType: null,
      contractFileUrl: null,
      contractStoragePath: null,
      contractFileDataUrl: null,
      contractPrice,
      contractSquareFootage,
      contractCity,
      contractSourceStatus: "reviewed",
    });
    await auditProjectChange({
      actor: { type: "system", id: null, name: "Contract reader (AI)" },
      action: "project.contract_extracted",
      qboBankAccountId,
      houseName,
      title: `Read contract ${fileName}`,
      before,
      after: { contractPrice, contractSquareFootage, contractCity },
      spec: contractFieldSpec,
      details: { fileName },
    });
    refreshDashboardSummaryInBackground();
    revalidateHousePages();
  } catch (error) {
    console.error("Contract extraction failed", {
      error,
      fileName,
      houseName,
      qboBankAccountId,
    });
    await markContractNeedsReview({ qboBankAccountId, houseName });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeApiRequest(request, { roles: editorRoles });

  if (!authorization.ok) {
    return authorization.response;
  }

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
    let uploadedFileBuffer: Buffer | null = null;
    let uploadedFileContentType: string | null = null;
    let uploadedFileName: string | null = null;

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
      uploadedFileBuffer = buffer;
      uploadedFileContentType = contentType;
      uploadedFileName = contractFile.name;
    }

    const manualContractPrice = optionalMoney(formData.get("contractPrice"));
    const manualContractSquareFootage = optionalInteger(formData.get("contractSquareFootage"));
    const manualContractCity = optionalText(formData.get("contractCity"));
    const shouldExtractContract =
      Boolean(uploadedFileBuffer && uploadedFileContentType && uploadedFileName) &&
      (!manualContractPrice || !manualContractSquareFootage || !manualContractCity);
    const before = await houseBefore(qboBankAccountId);

    await saveHouseContractSource({
      qboBankAccountId,
      houseName,
      contractFileName,
      contractFileType,
      contractFileUrl,
      contractStoragePath,
      contractFileDataUrl,
      contractPrice: manualContractPrice,
      contractSquareFootage: manualContractSquareFootage,
      contractCity: manualContractCity,
      contractSourceStatus: shouldExtractContract ? "reading" : "reviewed",
    });
    await auditProjectChange({
      actor: authorization.actor,
      action: "project.contract_source_saved",
      qboBankAccountId,
      houseName,
      title: contractFileName ? `Uploaded contract ${contractFileName}` : "Contract facts",
      before,
      after: {
        contractPrice: manualContractPrice,
        contractSquareFootage: manualContractSquareFootage,
        contractCity: manualContractCity,
        ...(contractFileName ? { contractFileName } : {}),
      },
      spec: contractFieldSpec,
      ...(contractFileName ? { details: { fileName: contractFileName } } : {}),
    });
    refreshDashboardSummaryInBackground();
    revalidateHousePages();

    if (shouldExtractContract && uploadedFileBuffer && uploadedFileContentType && uploadedFileName) {
      void extractAndSaveContractSource({
        qboBankAccountId,
        houseName,
        bytes: uploadedFileBuffer,
        contentType: uploadedFileContentType,
        fileName: uploadedFileName,
      });
    }

    return NextResponse.json({
      extraction: shouldExtractContract ? "queued" : "not_needed",
      status: "ok",
    });
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

export async function DELETE(request: Request) {
  const authorization = await authorizeApiRequest(request, { roles: adminRoles });

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      confirmText?: unknown;
      qboBankAccountId?: unknown;
    } | null;
    const qboBankAccountId =
      typeof body?.qboBankAccountId === "string" ? body.qboBankAccountId.trim() : "";
    const confirmText = typeof body?.confirmText === "string" ? body.confirmText.trim() : "";

    if (!qboBankAccountId) {
      return NextResponse.json(
        { status: "error", message: "House account is missing." },
        { status: 400 },
      );
    }

    if (confirmText !== "delete") {
      return NextResponse.json(
        { status: "error", message: "Type delete to delete this contract." },
        { status: 400 },
      );
    }

    const before = await houseBefore(qboBankAccountId);
    const storagePath = await clearHouseContractSource({ qboBankAccountId });

    await recordAudit({
      actor: authorization.actor,
      action: "project.contract_deleted",
      entityType: "project",
      entityId: qboBankAccountId,
      houseName: before?.houseName ?? null,
      summary: `Deleted contract ${before?.contractFileName ?? "file"} and its contract facts.`,
      details: {
        contractFileName: before?.contractFileName ?? null,
        contractPrice: before?.contractPrice ?? null,
        contractSquareFootage: before?.contractSquareFootage ?? null,
        contractCity: before?.contractCity ?? null,
      },
    });

    if (storagePath) {
      await deleteSupabaseStorageObject({
        bucket: process.env.SUPABASE_CONTRACT_BUCKET ?? "house-contracts",
        path: storagePath,
      });
    }
    refreshDashboardSummaryInBackground();
    revalidateHousePages();

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contract delete failed.";

    return NextResponse.json(
      {
        status: "error",
        message:
          message.includes("DATABASE_URL")
            ? "Deleting contracts needs the database connection. Use the live Render app or add DATABASE_URL locally."
            : message,
      },
      { status: 500 },
    );
  }
}
