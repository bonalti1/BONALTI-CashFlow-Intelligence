"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auditProjectChange, drawStatusLabels, labelFor } from "@/lib/audit/project-audit";
import { actorForUser, requireEditor } from "@/lib/auth/session";
import {
  phaseLabels,
  refreshHouseDashboardSummaries,
} from "@/lib/dashboard/house-dashboard-summary-store";
import {
  drawPhaseKeys,
  getDrawLineItemStatusesForHouse,
  getDrawPhaseStatuses,
  saveDrawLineItemStatus,
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

function safeReturnTo(value: FormDataEntryValue | null) {
  const text = optionalText(value);

  if (!text || !text.startsWith("/draws-budget")) {
    return "/draws-budget";
  }

  return text;
}

function refreshDashboardSummaryInBackground() {
  void refreshHouseDashboardSummaries().catch((error) => {
    console.error("House dashboard summary refresh failed", error);
  });
}

function phaseTitle(key: DrawPhaseKey) {
  const phase = phaseLabels[key];

  return key === "pre" ? phase.name : `Phase ${phase.label} (${phase.name})`;
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
  const editor = await requireEditor();
  const qboBankAccountId = optionalText(formData.get("qboBankAccountId"));
  const houseName = optionalText(formData.get("houseName"));
  const intent = optionalText(formData.get("intent"));
  const today = new Date().toISOString().slice(0, 10);

  if (!qboBankAccountId || !houseName) {
    throw new Error("House account is missing.");
  }

  const selectedDrawStatus = drawStatus(formData.get("drawStatus"));
  let submittedDate = optionalDate(formData.get("submittedDate"));
  let receivedDate = optionalDate(formData.get("receivedDate"));
  const receivedAmount = optionalMoney(formData.get("receivedAmount"));
  const drawAsked = formData.get("drawAsked") === "on";
  const checklistSave = intent === "save_draw_checklist";
  const hasReceivedMoney = receivedAmount !== null || Boolean(receivedDate);
  const checklistDrawStatus: DrawStatus = hasReceivedMoney
    ? "received"
    : drawAsked
      ? "submitted"
      : "not_started";

  if (checklistSave && drawAsked && !submittedDate) {
    submittedDate = today;
  }

  if (checklistSave && hasReceivedMoney && !receivedDate) {
    receivedDate = today;
  }

  const selectedPhaseKey = phaseKey(formData.get("phaseKey"));
  const values = {
    drawStatus:
      intent === "mark_draw_requested"
        ? "submitted"
        : intent === "mark_money_received"
          ? "received"
          : checklistSave
            ? checklistDrawStatus
          : selectedDrawStatus,
    submittedDate: intent === "mark_draw_requested" ? (submittedDate ?? today) : submittedDate,
    requestedAmount: optionalMoney(formData.get("requestedAmount")),
    receivedAmount,
    receivedDate: intent === "mark_money_received" ? (receivedDate ?? today) : receivedDate,
    accountantStatus: optionalText(formData.get("accountantStatus")),
    notes: optionalText(formData.get("notes")),
  } satisfies Record<string, unknown> & { drawStatus: DrawStatus };
  const before = (await getDrawPhaseStatuses()).get(`${qboBankAccountId}:${selectedPhaseKey}`);

  await saveDrawPhaseStatus({
    qboBankAccountId,
    houseName,
    phaseKey: selectedPhaseKey,
    ...values,
  });
  await auditProjectChange({
    actor: actorForUser(editor),
    action: "draw.phase_saved",
    qboBankAccountId,
    houseName,
    title: `${phaseTitle(selectedPhaseKey)} draw`,
    before: before
      ? { ...before, drawStatus: labelFor(drawStatusLabels, before.drawStatus) }
      : { drawStatus: labelFor(drawStatusLabels, "not_started") },
    after: { ...values, drawStatus: labelFor(drawStatusLabels, values.drawStatus) },
    spec: {
      drawStatus: { label: "Draw status" },
      requestedAmount: { label: "Requested", format: "money" },
      submittedDate: { label: "Requested on", format: "date" },
      receivedAmount: { label: "Received", format: "money" },
      receivedDate: { label: "Received on", format: "date" },
      accountantStatus: { label: "Accountant review" },
      notes: { label: "Notes" },
    },
  });

  refreshDashboardSummaryInBackground();
  revalidatePath("/");
  revalidatePath("/draws-budget");
}

export async function saveDrawLineItemStatusAction(formData: FormData) {
  const editor = await requireEditor();
  const qboBankAccountId = optionalText(formData.get("qboBankAccountId"));
  const houseName = optionalText(formData.get("houseName"));
  const lineItemKey = optionalText(formData.get("lineItemKey"));
  const lineItemName = optionalText(formData.get("lineItemName"));
  const requestedAmount = optionalMoney(formData.get("requestedAmount"));
  const receivedAmount = optionalMoney(formData.get("receivedAmount"));
  const drawSubmitted = formData.get("drawSubmitted") === "on";
  const drawReceived = formData.get("drawReceived") === "on";
  const returnTo = safeReturnTo(formData.get("returnTo"));
  const now = new Date().toISOString();

  if (!qboBankAccountId || !houseName || !lineItemKey || !lineItemName) {
    throw new Error("Line item is missing.");
  }

  const existingSubmittedAt = optionalDate(formData.get("existingSubmittedAt"));
  const existingReceivedAt = optionalDate(formData.get("existingReceivedAt"));

  const selectedPhaseKey = phaseKey(formData.get("phaseKey"));
  const notes = optionalText(formData.get("notes"));
  const before = (await getDrawLineItemStatusesForHouse(qboBankAccountId)).get(
    `${qboBankAccountId}:${selectedPhaseKey}:${lineItemKey}`,
  );

  await saveDrawLineItemStatus({
    qboBankAccountId,
    houseName,
    phaseKey: selectedPhaseKey,
    lineItemKey,
    lineItemName,
    drawSubmitted,
    submittedAt: drawSubmitted ? (existingSubmittedAt ?? now) : null,
    requestedAmount,
    drawReceived,
    receivedAmount,
    receivedAt: drawReceived ? (existingReceivedAt ?? now) : null,
    notes,
  });
  await auditProjectChange({
    actor: actorForUser(editor),
    action: "draw.line_item_saved",
    qboBankAccountId,
    houseName,
    title: `${phaseTitle(selectedPhaseKey)} · ${lineItemName}`,
    before: before ?? { drawSubmitted: false, drawReceived: false },
    after: { drawSubmitted, requestedAmount, drawReceived, receivedAmount, notes },
    spec: {
      drawSubmitted: { label: `${lineItemName} requested`, format: "boolean" },
      requestedAmount: { label: `${lineItemName} requested amount`, format: "money" },
      drawReceived: { label: `${lineItemName} received`, format: "boolean" },
      receivedAmount: { label: `${lineItemName} received amount`, format: "money" },
      notes: { label: `${lineItemName} notes` },
    },
  });

  revalidatePath("/");
  revalidatePath("/draws-budget");
  redirect(returnTo);
}
