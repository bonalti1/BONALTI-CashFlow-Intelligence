"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileCheck2, Upload } from "lucide-react";

type ProjectDocument = {
  id: number;
  documentType: string;
  fileName: string;
  uploadedAt: string;
};

type SourceTruthDocumentsProps = {
  qboBankAccountId: string;
  houseName: string;
  contractFileName: string | null;
};

const documentCards = [
  {
    type: "contract",
    label: "Contract",
    empty: "Drop or select contract",
  },
  {
    type: "bank_draw",
    label: "Bank Draw / Budget",
    empty: "Drop CFS or Rally sheet",
  },
  {
    type: "baseline",
    label: "Internal Baseline",
    empty: "Drop approved baseline",
  },
  {
    type: "supporting",
    label: "Supporting Docs",
    empty: "Add change orders or support",
  },
] as const;

export function SourceTruthDocuments({
  qboBankAccountId,
  houseName,
  contractFileName,
}: SourceTruthDocumentsProps) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/houses/document?houseId=${encodeURIComponent(qboBankAccountId)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { documents?: ProjectDocument[] } | null) => {
        setDocuments(payload?.documents ?? []);
      })
      .catch(() => null);

    return () => controller.abort();
  }, [qboBankAccountId]);

  const documentsByType = useMemo(() => {
    const grouped = new Map<string, ProjectDocument[]>();

    for (const document of documents) {
      grouped.set(document.documentType, [
        ...(grouped.get(document.documentType) ?? []),
        document,
      ]);
    }

    return grouped;
  }, [documents]);

  return (
    <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {documentCards.map((card) => (
        <DocumentUploadCard
          currentFileName={
            card.type === "contract"
              ? contractFileName
              : documentsByType.get(card.type)?.[0]?.fileName ?? null
          }
          documentCount={
            card.type === "contract"
              ? contractFileName
                ? 1
                : 0
              : documentsByType.get(card.type)?.length ?? 0
          }
          documentType={card.type}
          emptyLabel={card.empty}
          houseName={houseName}
          key={card.type}
          label={card.label}
          onUploaded={(document) => {
            if (card.type !== "contract") {
              setDocuments((current) => [
                document,
                ...current.filter(
                  (item) =>
                    card.type === "supporting" || item.documentType !== card.type,
                ),
              ]);
            }
          }}
          qboBankAccountId={qboBankAccountId}
        />
      ))}
    </div>
  );
}

function DocumentUploadCard({
  qboBankAccountId,
  houseName,
  documentType,
  label,
  emptyLabel,
  currentFileName,
  documentCount,
  onUploaded,
}: {
  qboBankAccountId: string;
  houseName: string;
  documentType: string;
  label: string;
  emptyLabel: string;
  currentFileName: string | null;
  documentCount: number;
  onUploaded: (document: ProjectDocument) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [localFileName, setLocalFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const displayFileName = localFileName ?? currentFileName;

  async function upload(file: File | undefined) {
    if (!file) {
      return;
    }

    setPendingFile(null);
    setError(null);
    setIsUploading(true);
    const formData = new FormData();
    formData.set("qboBankAccountId", qboBankAccountId);
    formData.set("houseName", houseName);

    if (documentType === "contract") {
      formData.set("contractFile", file);
    } else {
      formData.set("documentType", documentType);
      formData.set("documentFile", file);
    }

    try {
      const endpoint =
        documentType === "contract" ? "/api/houses/contract" : "/api/houses/document";
      const response = await fetch(endpoint, { body: formData, method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Document upload failed.");
      }

      setLocalFileName(file.name);
      onUploaded({
        id: Date.now(),
        documentType,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      setIsDragging(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function preventDefault(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div>
      <input
        accept="application/pdf,image/*,.xlsx,.xls,.csv"
        className="sr-only"
        onChange={(event) => setPendingFile(event.currentTarget.files?.[0] ?? null)}
        ref={inputRef}
        type="file"
      />
      <button
        className={`min-h-[128px] w-full rounded-[12px] border border-dashed p-4 text-left transition ${
          isDragging
            ? "border-[#2e9166] bg-[#eef9f3] ring-2 ring-[#2e9166]/15"
            : "border-[#d8d5ca] bg-white hover:border-[#16294d]/40"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          preventDefault(event);
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          preventDefault(event);
          setIsDragging(false);
        }}
        onDragOver={preventDefault}
        onDrop={(event) => {
          preventDefault(event);
          setIsDragging(false);
          setPendingFile(event.dataTransfer.files?.[0] ?? null);
        }}
        type="button"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#7b8298]">
            {label}
          </span>
          <span
            className={`rounded-full px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.08em] ${
              displayFileName
                ? "bg-[#eaf7f0] text-[#1f6f4b]"
                : "bg-[#fff6df] text-[#9a6500]"
            }`}
          >
            {isUploading ? "Uploading" : displayFileName ? "Added" : "Missing"}
          </span>
        </div>
        <div className="mt-4 flex items-start gap-3">
          {displayFileName ? (
            <FileCheck2 className="mt-0.5 shrink-0 text-[#2e9166]" size={20} />
          ) : (
            <Upload className="mt-0.5 shrink-0 text-[#16294d]" size={20} />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-[#16294d]">
              {isUploading ? "Saving document..." : displayFileName ?? emptyLabel}
            </p>
            <p className="mt-1 text-[10px] font-bold text-[#9aa1b2]">
              {documentCount > 1 ? `${documentCount} documents · ` : ""}
              Drop, select, or take a photo
            </p>
          </div>
        </div>
      </button>
      {error ? (
        <p className="mt-1 rounded-[7px] bg-[#fdebea] px-2 py-1 text-[10px] font-bold text-[#9d251c]">
          {error}
        </p>
      ) : null}
      {pendingFile ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-[#0e1b36]/45 p-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-[14px] border border-[#d6dceb] bg-white p-5 shadow-2xl">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#e23b2a]">
              Confirm source of truth
            </p>
            <h3 className="mt-2 text-xl font-extrabold text-[#16294d]">
              Upload {label} to {houseName}?
            </h3>
            <p className="mt-2 break-all rounded-[9px] bg-[#f5f4ef] px-3 py-2 text-sm font-bold text-[#596176]">
              {pendingFile.name}
            </p>
            <p className="mt-3 text-sm leading-5 text-[#69746f]">
              This document will become part of this project&apos;s source of truth.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="h-10 rounded-[9px] border border-[#d6dceb] bg-white text-xs font-extrabold uppercase tracking-[0.08em] text-[#16294d]"
                onClick={() => {
                  setPendingFile(null);
                  if (inputRef.current) {
                    inputRef.current.value = "";
                  }
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="h-10 rounded-[9px] bg-[#16294d] text-xs font-extrabold uppercase tracking-[0.08em] text-white"
                onClick={() => upload(pendingFile)}
                type="button"
              >
                Upload document
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
