"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { saveHouseDetail, saveHouseManualRenderImage } from "@/lib/houses/house-details-store";

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
  const dataUrl = `data:${renderImage.type};base64,${buffer.toString("base64")}`;

  await saveHouseManualRenderImage({
    qboBankAccountId,
    houseName,
    manualRenderImageUrl: dataUrl,
  });

  revalidatePath("/");
  revalidatePath("/draws-budget");
  redirect(returnTo);
}
