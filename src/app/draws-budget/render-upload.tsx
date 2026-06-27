"use client";

import { useEffect, useRef, useState } from "react";

type ProjectRenderUploadProps = {
  qboBankAccountId: string;
  houseName: string;
  imageUrl: string | null;
  contractFileName: string | null;
  contractPrice: number | null;
  contractSquareFootage: number | null;
  contractCity: string | null;
  contractSourceStatus: string | null;
  returnTo: string;
};

export function ProjectRenderUpload({
  qboBankAccountId,
  houseName,
  imageUrl,
  contractFileName,
  contractPrice,
  contractSquareFootage,
  contractCity,
  contractSourceStatus,
  returnTo,
}: ProjectRenderUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const contractInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isContractDragging, setIsContractDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isContractUploading, setIsContractUploading] = useState(false);
  const [showContractFields, setShowContractFields] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedImageUrl, setFetchedImageUrl] = useState<string | null>(null);
  const resolvedImageUrl = imageUrl ?? fetchedImageUrl;
  const contractIsReading = contractSourceStatus === "reading";
  const contractNeedsReview = contractSourceStatus === "needs_review";
  const contractButtonLabel = isContractUploading
    ? "Saving"
    : isContractDragging
      ? "Drop contract"
      : contractIsReading
        ? "Reading"
        : contractNeedsReview
          ? "Review"
          : contractFileName
            ? "✓ Contract"
            : "+ Contract";

  useEffect(() => {
    if (!contractIsReading) {
      return;
    }

    const timeout = window.setTimeout(() => {
      window.location.reload();
    }, 7000);

    return () => window.clearTimeout(timeout);
  }, [contractIsReading]);

  useEffect(() => {
    if (imageUrl) {
      return;
    }

    const controller = new AbortController();

    fetch("/api/draws-renders", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { renders?: Array<{ houseId: string; renderImageUrl: string | null }> } | null) => {
        const render = payload?.renders?.find((item) => item.houseId === qboBankAccountId);

        if (render?.renderImageUrl) {
          setFetchedImageUrl(render.renderImageUrl);
        }
      })
      .catch(() => null);

    return () => controller.abort();
  }, [imageUrl, qboBankAccountId]);

  function confirmContractFile(file: File) {
    return window.confirm(
      `Are you sure "${file.name}" is the contract for ${houseName}?`,
    );
  }

  async function saveRender(formData: FormData) {
    setError(null);
    setIsUploading(true);

    try {
      const response = await fetch("/api/houses/render", {
        body: formData,
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(result?.message ?? "Render upload failed.");
      }

      window.location.href = returnTo;
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Render upload failed.");
      setIsUploading(false);
    }
  }

  async function submitWithFiles(files: FileList | null) {
    const file = files?.[0];

    if (!file || !inputRef.current) {
      return;
    }

    const formData = new FormData();
    formData.set("qboBankAccountId", qboBankAccountId);
    formData.set("houseName", houseName);
    formData.set("renderImage", file);

    await saveRender(formData);
  }

  async function submitWithUrl(renderImageUrl: string | null) {
    const url = renderImageUrl?.trim();

    if (!url) {
      setError("Drop an image file, not a web page.");
      return;
    }

    const formData = new FormData();
    formData.set("qboBankAccountId", qboBankAccountId);
    formData.set("houseName", houseName);
    formData.set("renderImageUrl", url);

    await saveRender(formData);
  }

  async function saveContract(formData: FormData) {
    setError(null);
    setIsContractUploading(true);

    try {
      const response = await fetch("/api/houses/contract", {
        body: formData,
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(result?.message ?? "Contract upload failed.");
      }

      window.location.href = returnTo;
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Contract upload failed.");
      setIsContractUploading(false);
    }
  }

  async function submitContract(files: FileList | null) {
    const file = files?.[0];

    if (!file) {
      return;
    }

    if (!confirmContractFile(file)) {
      if (contractInputRef.current) {
        contractInputRef.current.value = "";
      }
      return;
    }

    const formData = new FormData();
    formData.set("qboBankAccountId", qboBankAccountId);
    formData.set("houseName", houseName);
    formData.set("contractFile", file);

    await saveContract(formData);
  }

  async function deleteContract() {
    const confirmText = window.prompt(`Type delete to delete the contract for ${houseName}.`);

    if (confirmText !== "delete") {
      return;
    }

    setError(null);
    setIsContractUploading(true);

    try {
      const response = await fetch("/api/houses/contract", {
        body: JSON.stringify({
          confirmText,
          qboBankAccountId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "DELETE",
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(result?.message ?? "Contract delete failed.");
      }

      window.location.href = returnTo;
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Contract delete failed.");
      setIsContractUploading(false);
    }
  }

  async function saveContractValues(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    formData.set("qboBankAccountId", qboBankAccountId);
    formData.set("houseName", houseName);

    await saveContract(formData);
  }

  function stopBrowserDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function droppedUrl(event: React.DragEvent) {
    const uriList = event.dataTransfer.getData("text/uri-list");
    const plainText = event.dataTransfer.getData("text/plain");

    return uriList || plainText || null;
  }

  async function handleDrop(event: React.DragEvent) {
    stopBrowserDrop(event);
    setIsDragging(false);

    if (event.dataTransfer.files.length > 0) {
      await submitWithFiles(event.dataTransfer.files);
      return;
    }

    await submitWithUrl(droppedUrl(event));
  }

  async function handleContractDrop(event: React.DragEvent) {
    stopBrowserDrop(event);
    setIsDragging(false);
    setIsContractDragging(false);

    await submitContract(event.dataTransfer.files);
  }

  return (
    <form
      className="relative"
      onDragEnter={(event) => {
        stopBrowserDrop(event);
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        stopBrowserDrop(event);
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        stopBrowserDrop(event);
        setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      <input name="qboBankAccountId" type="hidden" value={qboBankAccountId} />
      <input name="houseName" type="hidden" value={houseName} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <input
        ref={inputRef}
        accept="image/*"
        className="sr-only"
        name="renderImage"
        onChange={(event) => submitWithFiles(event.currentTarget.files)}
        type="file"
      />
      <input
        ref={contractInputRef}
        accept="application/pdf,image/*"
        className="sr-only"
        name="contractFile"
        onChange={(event) => submitContract(event.currentTarget.files)}
        type="file"
      />
      <button
        className={`relative block h-[76px] w-full overflow-hidden rounded-[10px] border bg-white text-left shadow-[0_8px_18px_-20px_rgba(14,27,54,0.65)] transition ${
          isDragging ? "border-[#2f9b72] ring-2 ring-[#2f9b72]/25" : "border-[#d8d5ca]"
        }`}
        onClick={() => inputRef.current?.click()}
        title={`Add render for ${houseName}`}
        type="button"
      >
        {resolvedImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${houseName} render`}
            className="h-full w-full object-contain object-center p-1.5"
            src={resolvedImageUrl}
          />
        ) : (
          <span className="grid h-full place-items-center px-2 text-center text-[10px] font-extrabold uppercase leading-4 tracking-[0.08em] text-[#9aa1b2]">
            Drop render
          </span>
        )}
        <span className="absolute bottom-1 right-1 rounded-[6px] bg-white/90 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.08em] text-[#16294d] shadow-sm">
          {isUploading ? "Saving" : "Add"}
        </span>
      </button>
      <button
        className={`mt-1 flex h-6 w-full items-center justify-center rounded-[7px] border px-1 text-[8px] font-extrabold uppercase tracking-[0.08em] transition ${
          isContractDragging
            ? "border-[#1f8f5f] bg-[#f1fbf5] text-[#1f8f5f] ring-2 ring-[#2f9b72]/20"
            : contractIsReading
            ? "border-[#cbd7ee] bg-[#f4f7fc] text-[#16294d]"
            : contractNeedsReview
            ? "border-[#ffc7bf] bg-[#fdebea] text-[#9d251c]"
            : contractFileName
            ? "border-[#b7dfc8] bg-[#f1fbf5] text-[#1f8f5f]"
            : "border-[#e3e1d7] bg-white text-[#7b8298] hover:border-[#16294d]/25 hover:text-[#16294d]"
        }`}
        onDragEnter={(event) => {
          stopBrowserDrop(event);
          setIsDragging(false);
          setIsContractDragging(true);
        }}
        onDragOver={(event) => {
          stopBrowserDrop(event);
          setIsDragging(false);
          setIsContractDragging(true);
        }}
        onDragLeave={(event) => {
          stopBrowserDrop(event);
          setIsContractDragging(false);
        }}
        onDrop={handleContractDrop}
        onClick={() => {
          if (contractFileName) {
            setShowContractFields((value) => !value);
            return;
          }

          contractInputRef.current?.click();
        }}
        title={contractFileName ? `Contract uploaded: ${contractFileName}` : `Add contract for ${houseName}`}
        type="button"
      >
        {contractButtonLabel}
      </button>
      {showContractFields ? (
        <div className="mt-1 rounded-[8px] border border-[#d8d5ca] bg-white p-2 shadow-sm">
          <form className="space-y-1" onSubmit={saveContractValues}>
            <input
              className="h-7 w-full rounded-[6px] border border-[#d8d5ca] px-2 text-[10px] font-extrabold text-[#16294d] outline-none focus:border-[#16294d]"
              defaultValue={contractPrice ?? ""}
              inputMode="decimal"
              name="contractPrice"
              placeholder="Sold price"
            />
            <input
              className="h-7 w-full rounded-[6px] border border-[#d8d5ca] px-2 text-[10px] font-extrabold text-[#16294d] outline-none focus:border-[#16294d]"
              defaultValue={contractSquareFootage ?? ""}
              inputMode="numeric"
              name="contractSquareFootage"
              placeholder="Sqft"
            />
            <input
              className="h-7 w-full rounded-[6px] border border-[#d8d5ca] px-2 text-[10px] font-extrabold text-[#16294d] outline-none focus:border-[#16294d]"
              defaultValue={contractCity ?? ""}
              name="contractCity"
              placeholder="City"
            />
            <button
              className="h-7 w-full rounded-[7px] bg-[#16294d] text-[9px] font-extrabold uppercase tracking-[0.08em] text-white"
              type="submit"
            >
              {isContractUploading ? "Saving" : "Save source"}
            </button>
          </form>
          <button
            className="mt-1 h-7 w-full rounded-[7px] border border-[#ffc7bf] bg-[#fdebea] text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#9d251c]"
            onClick={deleteContract}
            type="button"
          >
            Delete Contract
          </button>
        </div>
      ) : null}
      {error ? (
        <span className="mt-1 block rounded-[6px] border border-[#ffc7bf] bg-[#fdebea] px-2 py-1 text-[9px] font-extrabold leading-3 text-[#9d251c] shadow-sm">
          {error}
        </span>
      ) : null}
    </form>
  );
}
