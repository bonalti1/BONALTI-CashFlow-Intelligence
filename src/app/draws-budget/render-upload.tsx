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
  returnTo,
}: ProjectRenderUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedImageUrl, setFetchedImageUrl] = useState<string | null>(null);
  const resolvedImageUrl = imageUrl ?? fetchedImageUrl;

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
      {error ? (
        <span className="mt-1 block rounded-[6px] border border-[#ffc7bf] bg-[#fdebea] px-2 py-1 text-[9px] font-extrabold leading-3 text-[#9d251c] shadow-sm">
          {error}
        </span>
      ) : null}
    </form>
  );
}
