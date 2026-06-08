"use server";

import { revalidatePath } from "next/cache";

import {
  drawPhaseKeys,
  saveDrawPhaseStatus,
  type DrawPhaseKey,
  type DrawStatus,
} from "@/lib/draws/draws-store";

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
    throw new Error("Amount must be a positive number.");
  }

  return parsed;
}

function optionalDate(value: FormDataEntryValue | null) {
  const text = optionalText(value);

  return text;
}

function phaseKey(value: FormDataEntryValue | null): DrawPhaseKey {
  const text = String(value ?? "");

  if (drawPhaseKeys.includes(text as DrawPhaseKey)) {
    return text as DrawPhaseKey;
  }

  throw new Error("Phase is missing.");
}

function drawStatus(value: FormDataEntryValue | null): DrawStatus {
  const text = String(value ?? "");

  if (
    text === "not_started" ||
    text === "reviewing" ||
    text === "ready" ||
    text === "submitted" ||
    text === "received" ||
    text === "blocked"
  ) {
    return text;
  }

  return "not_started";
}

export async function saveDrawStatusAction(formData: FormData) {
  const qboBankAccountId = optionalText(formData.get("qboBankAccountId"));
  const houseName = optionalText(formData.get("houseName"));

  if (!qboBankAccountId || !houseName) {
    throw new Error("House account is missing.");
  }

  await saveDrawPhaseStatus({
    qboBankAccountId,
    houseName,
    phaseKey: phaseKey(formData.get("phaseKey")),
    drawStatus: drawStatus(formData.get("drawStatus")),
    submittedDate: optionalDate(formData.get("submittedDate")),
    requestedAmount: optionalMoney(formData.get("requestedAmount")),
    receivedAmount: optionalMoney(formData.get("receivedAmount")),
    receivedDate: optionalDate(formData.get("receivedDate")),
    accountantStatus: optionalText(formData.get("accountantStatus")),
    notes: optionalText(formData.get("notes")),
  });

  revalidatePath("/");
  revalidatePath("/draws-budget");
}
