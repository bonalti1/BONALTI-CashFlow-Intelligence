"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addHouseChangeOrder,
  saveHouseContractSource,
  saveHouseDetail,
  saveHouseManualRenderImage,
  saveHouseHoldback,
  saveHouseProjectStatus,
  saveHouseProjectNumber,
} from "@/lib/houses/house-details-store";
import { refreshHouseDashboardSummaries } from "@/lib/dashboard/house-dashboard-summary-store";
import { uploadSupabaseStorageObject } from "@/lib/storage/supabase-storage";

function optionalMoney(value: FormDataEntryValue | null) {
  const text = String(value ?? "").replace(/[$,]/g, "").trim();

  if (!text) {
    return null;
  }

  const parsed = Number(text);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Sold price must be a positive number.");
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

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  return text || null;
}

function safeReturnTo(value: FormDataEntryValue | null) {
  const text = optionalText(value);

  if (!text || !text.startsWith("/") || text.startsWith("//")) {
    return "/draws-budget";
  }

  return text;
}

function isAllowedContractFile(file: File) {
  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/octet-stream"];
  const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
  const fileName = file.name.toLowerCase();

  return allowedTypes.includes(file.type) || allowedExtensions.some((extension) => fileName.endsWith(extension));
}

export async function saveHouseDetailsAction(formData: FormData) {
  const qboBankAccountId = optionalText(formData.get("qboBankAccountId"));
  const houseName = optionalText(formData.get("houseName"));

  if (!qboBankAccountId || !houseName) {
    throw new Error("House account is missing.");
  }

  await saveHouseDetail({
    qboBankAccountId,
    houseName,
    soldPrice: optionalMoney(formData.get("soldPrice")),
    squareFootage: optionalInteger(formData.get("squareFootage")),
    city: optionalText(formData.get("city")),
  });

  revalidatePath("/");
  revalidatePath("/setup-inputs");
  revalidatePath("/house-accounts");
}

export async function saveHouseSourceFactsAction(formData: FormData) {
  const qboBankAccountId = optionalText(formData.get("qboBankAccountId"));
  const houseName = optionalText(formData.get("houseName"));

  if (!qboBankAccountId || !houseName) {
    throw new Error("House account is missing.");
  }

  await Promise.all([
    saveHouseContractSource({
      qboBankAccountId,
      houseName,
      contractFileName: null,
      contractFileType: null,
      contractFileDataUrl: null,
      contractPrice: optionalMoney(formData.get("contractPrice")),
      contractSquareFootage: optionalInteger(formData.get("contractSquareFootage")),
      contractCity: optionalText(formData.get("contractCity")),
    }),
    saveHouseHoldback({
      qboBankAccountId,
      houseName,
      holdbackAmount: optionalMoney(formData.get("holdbackAmount")),
      holdbackNotes: optionalText(formData.get("holdbackNotes")),
    }),
  ]);
  await refreshHouseDashboardSummaries();
  revalidatePath("/");
  revalidatePath("/draws-budget");
  revalidatePath("/setup-inputs");
}

export async function saveHouseProjectStatusAction(formData: FormData) {
  const qboBankAccountId = optionalText(formData.get("qboBankAccountId"));
  const houseName = optionalText(formData.get("houseName"));
  const projectStatus = optionalText(formData.get("projectStatus"));
  const returnTo = safeReturnTo(formData.get("returnTo"));
  const allowedStatuses = new Set(["active", "on_hold", "final_phase", "completed", "closed_out"]);

  if (!qboBankAccountId || !houseName || !projectStatus || !allowedStatuses.has(projectStatus)) {
    throw new Error("Choose a valid project status.");
  }

  await saveHouseProjectStatus({ qboBankAccountId, houseName, projectStatus });
  await refreshHouseDashboardSummaries();
  revalidatePath("/");
  revalidatePath("/draws-budget");
  revalidatePath("/setup-inputs");
  redirect(returnTo);
}

export async function saveHouseProjectNumberAction(formData: FormData) {
  const qboBankAccountId = optionalText(formData.get("qboBankAccountId"));
  const houseName = optionalText(formData.get("houseName"));
  const projectNumber = optionalInteger(formData.get("projectNumber"));
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if (!qboBankAccountId || !houseName) {
    throw new Error("House account is missing.");
  }

  if (projectNumber !== null && projectNumber < 101) {
    throw new Error("Project numbers must begin at 101.");
  }

  await saveHouseProjectNumber({ qboBankAccountId, houseName, projectNumber });
  await refreshHouseDashboardSummaries();
  revalidatePath("/");
  revalidatePath("/draws-budget");
  revalidatePath("/setup-inputs");
  redirect(returnTo);
}

export async function saveHouseRenderImageAction(formData: FormData) {
  const qboBankAccountId = optionalText(formData.get("qboBankAccountId"));
  const houseName = optionalText(formData.get("houseName"));
  const returnTo = safeReturnTo(formData.get("returnTo"));
  const renderImage = formData.get("renderImage");

  if (!qboBankAccountId || !houseName) {
    throw new Error("House account is missing.");
  }

  if (!(renderImage instanceof File) || renderImage.size === 0) {
    redirect(returnTo);
  }

  if (!renderImage.type.startsWith("image/")) {
    throw new Error("Please upload an image file.");
  }

  const maxSize = 3 * 1024 * 1024;

  if (renderImage.size > maxSize) {
    throw new Error("Render image must be smaller than 3 MB.");
  }

  const buffer = Buffer.from(await renderImage.arrayBuffer());
  const uploaded = await uploadSupabaseStorageObject({
    bucket: process.env.SUPABASE_RENDER_BUCKET ?? "house-renders",
    bytes: buffer,
    contentType: renderImage.type,
    fileName: renderImage.name,
    folder: `${qboBankAccountId}-${houseName}`,
    isPublic: true,
  });
  const dataUrl = uploaded ? null : `data:${renderImage.type};base64,${buffer.toString("base64")}`;

  await saveHouseManualRenderImage({
    qboBankAccountId,
    houseName,
    manualRenderImageUrl: uploaded?.url ?? dataUrl,
    renderStoragePath: uploaded?.path ?? null,
  });

  revalidatePath("/");
  revalidatePath("/draws-budget");
  redirect(returnTo);
}

export async function saveHouseContractSourceAction(formData: FormData) {
  const qboBankAccountId = optionalText(formData.get("qboBankAccountId"));
  const houseName = optionalText(formData.get("houseName"));
  const contractFile = formData.get("contractFile");
  let contractFileName: string | null = null;
  let contractFileType: string | null = null;
  let contractFileDataUrl: string | null = null;
  let contractFileUrl: string | null = null;
  let contractStoragePath: string | null = null;

  if (!qboBankAccountId || !houseName) {
    throw new Error("House account is missing.");
  }

  if (contractFile instanceof File && contractFile.size > 0) {
    if (!isAllowedContractFile(contractFile)) {
      throw new Error("Contract must be a PDF or image file.");
    }

    const maxSize = 25 * 1024 * 1024;

    if (contractFile.size > maxSize) {
      throw new Error("Contract file must be smaller than 25 MB.");
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
  revalidatePath("/setup-inputs");
  revalidatePath("/draws-budget");
  revalidatePath("/reports/dashboard");
}

export async function addHouseChangeOrderAction(formData: FormData) {
  const qboBankAccountId = optionalText(formData.get("qboBankAccountId"));
  const houseName = optionalText(formData.get("houseName"));
  const title = optionalText(formData.get("title"));
  const amount = optionalMoney(formData.get("amount"));

  if (!qboBankAccountId || !houseName || !title) {
    throw new Error("Change order is missing a house or title.");
  }

  if (amount === null) {
    throw new Error("Change order amount is required.");
  }

  await addHouseChangeOrder({
    qboBankAccountId,
    houseName,
    title,
    amount,
    notes: optionalText(formData.get("notes")),
    approvedAt: optionalText(formData.get("approvedAt")),
  });

  revalidatePath("/");
  revalidatePath("/setup-inputs");
  revalidatePath("/draws-budget");
  revalidatePath("/reports/dashboard");
}
