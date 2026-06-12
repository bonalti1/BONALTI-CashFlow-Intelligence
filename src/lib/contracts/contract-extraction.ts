import { createAgentClient, defaultAgentModel } from "@/lib/agent/client";

export type ContractExtractionResult = {
  contractPrice: number | null;
  contractSquareFootage: number | null;
  contractCity: string | null;
  propertyAddress: string | null;
  buyerName: string | null;
  confidence: number;
  notes: string | null;
};

const emptyExtraction: ContractExtractionResult = {
  buyerName: null,
  confidence: 0,
  contractCity: null,
  contractPrice: null,
  contractSquareFootage: null,
  notes: null,
  propertyAddress: null,
};

function inferredContentType(fileName: string, contentType: string) {
  const lower = fileName.toLowerCase();

  if (contentType && contentType !== "application/octet-stream") {
    return contentType;
  }

  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  if (lower.endsWith(".webp")) {
    return "image/webp";
  }

  return contentType || "application/octet-stream";
}

function normalizedMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  return null;
}

function normalizedInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  return null;
}

function normalizedText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function extractContractSourceFromFile({
  bytes,
  contentType,
  fileName,
  houseName,
}: {
  bytes: Buffer;
  contentType: string;
  fileName: string;
  houseName: string;
}): Promise<ContractExtractionResult | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const client = createAgentClient();
  const mimeType = inferredContentType(fileName, contentType);
  const fileData = `data:${mimeType};base64,${bytes.toString("base64")}`;

  try {
    const response = await client.responses.create({
      input: [
        {
          content: [
            {
              text: [
                "Read this South Texas Builders home construction contract.",
                `House/project name from the app: ${houseName}.`,
                "Extract only facts clearly written in the contract.",
                "Return null for any field that is missing or unclear.",
                "Use numbers only for money and square footage. Do not include dollar signs or commas.",
                "The contract price is the sale/contract/purchase price of the home, not a loan amount, earnest money, allowance, or draw amount.",
              ].join("\n"),
              type: "input_text",
            },
            {
              detail: "high",
              file_data: fileData,
              filename: fileName,
              type: "input_file",
            },
          ],
          role: "user",
        },
      ],
      model: process.env.OPENAI_CONTRACT_MODEL ?? defaultAgentModel,
      text: {
        format: {
          name: "stb_contract_source",
          schema: {
            additionalProperties: false,
            properties: {
              buyerName: { type: ["string", "null"] },
              confidence: { maximum: 1, minimum: 0, type: "number" },
              contractCity: { type: ["string", "null"] },
              contractPrice: { type: ["number", "null"] },
              contractSquareFootage: { type: ["integer", "null"] },
              notes: { type: ["string", "null"] },
              propertyAddress: { type: ["string", "null"] },
            },
            required: [
              "contractPrice",
              "contractSquareFootage",
              "contractCity",
              "propertyAddress",
              "buyerName",
              "confidence",
              "notes",
            ],
            type: "object",
          },
          strict: true,
          type: "json_schema",
        },
      },
    });
    const parsed = JSON.parse(response.output_text) as Record<string, unknown>;

    return {
      buyerName: normalizedText(parsed.buyerName),
      confidence:
        typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0,
      contractCity: normalizedText(parsed.contractCity),
      contractPrice: normalizedMoney(parsed.contractPrice),
      contractSquareFootage: normalizedInteger(parsed.contractSquareFootage),
      notes: normalizedText(parsed.notes),
      propertyAddress: normalizedText(parsed.propertyAddress),
    };
  } catch (error) {
    console.error("Contract extraction failed", error);

    return emptyExtraction;
  }
}
