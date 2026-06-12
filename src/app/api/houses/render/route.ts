import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { saveHouseManualRenderImage } from "@/lib/houses/house-details-store";
import { uploadSupabaseStorageObject } from "@/lib/storage/supabase-storage";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  return text || null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const qboBankAccountId = optionalText(formData.get("qboBankAccountId"));
    const houseName = optionalText(formData.get("houseName"));
    const renderImage = formData.get("renderImage");
    const renderImageUrl = optionalText(formData.get("renderImageUrl"));

    if (!qboBankAccountId || !houseName) {
      return NextResponse.json(
        { status: "error", message: "House account is missing." },
        { status: 400 },
      );
    }

    if (renderImageUrl) {
      if (!renderImageUrl.startsWith("http://") && !renderImageUrl.startsWith("https://")) {
        return NextResponse.json(
          { status: "error", message: "Render image URL must start with http or https." },
          { status: 400 },
        );
      }

      await saveHouseManualRenderImage({
        qboBankAccountId,
        houseName,
        manualRenderImageUrl: renderImageUrl,
      });

      revalidatePath("/");
      revalidatePath("/draws-budget");

      return NextResponse.json({ status: "ok" });
    }

    if (!(renderImage instanceof File) || renderImage.size === 0) {
      return NextResponse.json(
        { status: "error", message: "Please choose or drop an image file." },
        { status: 400 },
      );
    }

    if (!renderImage.type.startsWith("image/")) {
      return NextResponse.json(
        { status: "error", message: "Please upload an image file." },
        { status: 400 },
      );
    }

    const maxSize = 3 * 1024 * 1024;

    if (renderImage.size > maxSize) {
      return NextResponse.json(
        { status: "error", message: "Render image must be smaller than 3 MB." },
        { status: 400 },
      );
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

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Render upload failed.";

    return NextResponse.json(
      {
        status: "error",
        message:
          message.includes("DATABASE_URL")
            ? "Saving renders needs the database connection. Use the live Render app or add DATABASE_URL locally."
            : message,
      },
      { status: 500 },
    );
  }
}
