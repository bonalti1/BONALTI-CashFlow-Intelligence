import { getHouseDashboardSummaries } from "@/lib/dashboard/house-dashboard-summary-store";
import {
  getHouseChangeOrdersMap,
  getHouseDetailsMap,
  getHouseProjectDocuments,
} from "@/lib/houses/house-details-store";
import { projectStatusLabels, drawStatusLabels, labelFor } from "@/lib/audit/project-audit";

// A stable, documented shape for outside readers such as Grokbot. Keep field names
// backwards compatible: add fields instead of renaming them.
export async function buildProjectFeed() {
  const [summaries, details, changeOrders] = await Promise.all([
    getHouseDashboardSummaries(),
    getHouseDetailsMap(),
    getHouseChangeOrdersMap(),
  ]);
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
  const ids = [...new Set([...summaryById.keys(), ...details.keys()])];

  const projects = await Promise.all(
    ids.map(async (id) => {
      const summary = summaryById.get(id);
      const detail = details.get(id);
      const documents = await getHouseProjectDocuments(id).catch(() => []);
      const projectChangeOrders = changeOrders.get(id) ?? [];
      const projectStatus = detail?.projectStatus ?? summary?.projectStatus ?? "active";

      return {
        id,
        projectNumber: detail?.projectNumber ?? summary?.projectNumber ?? null,
        name: detail?.displayName ?? summary?.displayName ?? detail?.houseName ?? summary?.house ?? null,
        houseName: detail?.houseName ?? summary?.house ?? null,
        status: projectStatus,
        statusLabel: labelFor(projectStatusLabels, projectStatus),
        contract: {
          originalPrice: detail?.contractPrice ?? null,
          changeOrderTotal:
            detail?.changeOrderTotal ??
            projectChangeOrders.reduce((total, order) => total + order.amount, 0),
          currentPrice: detail?.currentContractPrice ?? null,
          squareFeet: detail?.contractSquareFootage ?? null,
          city: detail?.contractCity ?? null,
          fileName: detail?.contractFileName ?? null,
          uploadedAt: detail?.contractUploadedAt ?? null,
          sourceStatus: detail?.contractSourceStatus ?? null,
        },
        manualFacts: {
          soldPrice: detail?.soldPrice ?? null,
          squareFeet: detail?.squareFootage ?? null,
          city: detail?.city ?? null,
        },
        holdback: {
          amount: detail?.holdbackAmount ?? null,
          notes: detail?.holdbackNotes ?? null,
        },
        changeOrders: projectChangeOrders.map((order) => ({
          id: order.id,
          title: order.title,
          amount: order.amount,
          approvedAt: order.approvedAt,
          notes: order.notes,
          createdAt: order.createdAt,
        })),
        bank: {
          quickbooksAccountName: summary?.bank ?? null,
          plaidAccountName: summary?.actualBankAccountName ?? null,
          plaidCurrentBalance: summary?.actualBankBalance ?? null,
          plaidAvailableBalance: summary?.actualBankAvailableBalance ?? null,
        },
        spending: {
          totalSpent: summary?.totalSpent ?? null,
          progressPercent: summary?.progress ?? null,
          currentPhase: summary?.currentPhaseKey ?? null,
        },
        phases: (summary?.phases ?? []).map((phase) => ({
          key: phase.key,
          name: phase.name,
          budget: phase.actual?.budgetAmount ?? null,
          spent: phase.actual?.spentAmount ?? 0,
          overBudget: phase.actual?.overBudgetAmount ?? 0,
          transactionCount: phase.actual?.transactionCount ?? 0,
          draw: phase.draw
            ? {
                status: phase.draw.drawStatus,
                statusLabel: labelFor(drawStatusLabels, phase.draw.drawStatus),
                requestedAmount: phase.draw.requestedAmount,
                requestedOn: phase.draw.submittedDate,
                receivedAmount: phase.draw.receivedAmount,
                receivedOn: phase.draw.receivedDate,
                accountantReview: phase.draw.accountantStatus,
                notes: phase.draw.notes,
                updatedAt: phase.draw.updatedAt,
              }
            : null,
        })),
        documents: documents.map((document) => ({
          type: document.documentType,
          fileName: document.fileName,
          uploadedAt: document.uploadedAt,
        })),
        lastUpdatedAt: detail?.updatedAt ?? summary?.refreshedAt ?? null,
      };
    }),
  );

  return projects.sort(
    (a, b) => (a.projectNumber ?? 9999) - (b.projectNumber ?? 9999) || String(a.name).localeCompare(String(b.name)),
  );
}
