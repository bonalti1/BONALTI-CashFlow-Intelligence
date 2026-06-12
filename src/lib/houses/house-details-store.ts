import { hasDatabaseUrl, sql } from "@/lib/db/raw";

export type HouseDetail = {
  qboBankAccountId: string;
  houseName: string;
  soldPrice: number | null;
  squareFootage: number | null;
  city: string | null;
  manualRenderImageUrl: string | null;
  updatedAt: string;
};

async function ensureHouseDetailsTable() {
  await sql()`
    create table if not exists house_details (
      qbo_bank_account_id text primary key,
      house_name text not null,
      sold_price numeric,
      square_footage integer,
      city text,
      manual_render_image_url text,
      updated_at timestamptz not null default now()
    )
  `;

  await sql()`alter table house_details add column if not exists manual_render_image_url text`;
}

export async function getHouseDetailsMap() {
  const details = new Map<string, HouseDetail>();

  if (!hasDatabaseUrl()) {
    return details;
  }

  await ensureHouseDetailsTable();
  const rows = await sql()<
    Array<{
      qbo_bank_account_id: string;
      house_name: string;
      sold_price: string | null;
      square_footage: number | null;
      city: string | null;
      manual_render_image_url: string | null;
      updated_at: Date;
    }>
  >`
    select
      qbo_bank_account_id,
      house_name,
      sold_price,
      square_footage,
      city,
      manual_render_image_url,
      updated_at
    from house_details
    order by house_name
  `;

  for (const row of rows) {
    details.set(row.qbo_bank_account_id, {
      qboBankAccountId: row.qbo_bank_account_id,
      houseName: row.house_name,
      soldPrice: row.sold_price === null ? null : Number(row.sold_price),
      squareFootage: row.square_footage,
      city: row.city,
      manualRenderImageUrl: row.manual_render_image_url,
      updatedAt: row.updated_at.toISOString(),
    });
  }

  return details;
}

export async function saveHouseManualRenderImage({
  qboBankAccountId,
  houseName,
  manualRenderImageUrl,
}: {
  qboBankAccountId: string;
  houseName: string;
  manualRenderImageUrl: string | null;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required to save house render images.");
  }

  await ensureHouseDetailsTable();
  await sql()`
    insert into house_details (
      qbo_bank_account_id,
      house_name,
      manual_render_image_url,
      updated_at
    )
    values (
      ${qboBankAccountId},
      ${houseName},
      ${manualRenderImageUrl},
      now()
    )
    on conflict (qbo_bank_account_id) do update set
      house_name = excluded.house_name,
      manual_render_image_url = excluded.manual_render_image_url,
      updated_at = now()
  `;
}

export async function saveHouseDetail({
  qboBankAccountId,
  houseName,
  soldPrice,
  squareFootage,
  city,
}: {
  qboBankAccountId: string;
  houseName: string;
  soldPrice: number | null;
  squareFootage: number | null;
  city: string | null;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required to save house setup details.");
  }

  await ensureHouseDetailsTable();
  await sql()`
    insert into house_details (
      qbo_bank_account_id,
      house_name,
      sold_price,
      square_footage,
      city,
      updated_at
    )
    values (
      ${qboBankAccountId},
      ${houseName},
      ${soldPrice},
      ${squareFootage},
      ${city},
      now()
    )
    on conflict (qbo_bank_account_id) do update set
      house_name = excluded.house_name,
      sold_price = excluded.sold_price,
      square_footage = excluded.square_footage,
      city = excluded.city,
      updated_at = now()
  `;
}
