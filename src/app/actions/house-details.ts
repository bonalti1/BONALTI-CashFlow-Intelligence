"use server";

import { revalidatePath } from "next/cache";

import { saveHouseDetail } from "@/lib/houses/house-details-store";

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
