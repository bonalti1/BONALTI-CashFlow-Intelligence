import { hasDatabaseUrl, sql } from "@/lib/db/raw";

export type HouseDetail = {
  qboBankAccountId: string;
  houseName: string;
  displayName: string | null;
  soldPrice: number | null;
  squareFootage: number | null;
  city: string | null;
  manualRenderImageUrl: string | null;
  renderStoragePath: string | null;
  contractFileName: string | null;
  contractFileType: string | null;
  contractFileUrl: string | null;
  contractStoragePath: string | null;
  contractFileDataUrl: string | null;
  contractUploadedAt: string | null;
  contractPrice: number | null;
  contractSquareFootage: number | null;
  contractCity: string | null;
  contractSourceStatus: string | null;
  projectStatus: string;
  projectNumber: number | null;
  holdbackAmount: number | null;
  holdbackNotes: string | null;
  changeOrderTotal: number;
  currentContractPrice: number | null;
  updatedAt: string;
};

export type HouseChangeOrder = {
  id: number;
  qboBankAccountId: string;
  houseName: string;
  title: string;
  amount: number;
  notes: string | null;
  approvedAt: string | null;
  createdAt: string;
};

export type HouseProjectDocument = {
  id: number;
  qboBankAccountId: string;
  houseName: string;
  documentType: string;
  fileName: string;
  fileType: string;
  fileUrl: string | null;
  storagePath: string | null;
  uploadedAt: string;
};

let houseDetailsTableReady: Promise<void> | null = null;
let houseChangeOrdersTableReady: Promise<void> | null = null;
let houseProjectDocumentsTableReady: Promise<void> | null = null;

async function initializeHouseDetailsTable() {
  await sql()`
    create table if not exists house_details (
      qbo_bank_account_id text primary key,
      house_name text not null,
      display_name text,
      sold_price numeric,
      square_footage integer,
      city text,
      manual_render_image_url text,
      render_storage_path text,
      contract_file_name text,
      contract_file_type text,
      contract_file_url text,
      contract_storage_path text,
      contract_file_data_url text,
      contract_uploaded_at timestamptz,
      contract_price numeric,
      contract_square_footage integer,
      contract_city text,
      contract_source_status text,
      project_status text not null default 'active',
      project_number integer,
      holdback_amount numeric,
      holdback_notes text,
      updated_at timestamptz not null default now()
    )
  `;

  await sql()`alter table house_details add column if not exists manual_render_image_url text`;
  await sql()`alter table house_details add column if not exists render_storage_path text`;
  await sql()`alter table house_details add column if not exists contract_file_name text`;
  await sql()`alter table house_details add column if not exists contract_file_type text`;
  await sql()`alter table house_details add column if not exists contract_file_url text`;
  await sql()`alter table house_details add column if not exists contract_storage_path text`;
  await sql()`alter table house_details add column if not exists contract_file_data_url text`;
  await sql()`alter table house_details add column if not exists contract_uploaded_at timestamptz`;
  await sql()`alter table house_details add column if not exists contract_price numeric`;
  await sql()`alter table house_details add column if not exists contract_square_footage integer`;
  await sql()`alter table house_details add column if not exists contract_city text`;
  await sql()`alter table house_details add column if not exists contract_source_status text`;
  await sql()`alter table house_details add column if not exists project_status text not null default 'active'`;
  await sql()`alter table house_details add column if not exists project_number integer`;
  await sql()`alter table house_details add column if not exists display_name text`;
  await sql()`alter table house_details add column if not exists holdback_amount numeric`;
  await sql()`alter table house_details add column if not exists holdback_notes text`;
}

function ensureHouseDetailsTable() {
  houseDetailsTableReady ??= initializeHouseDetailsTable().catch((error) => {
    houseDetailsTableReady = null;
    throw error;
  });

  return houseDetailsTableReady;
}

async function initializeHouseChangeOrdersTable() {
  await sql()`
    create table if not exists house_change_orders (
      id bigserial primary key,
      qbo_bank_account_id text not null,
      house_name text not null,
      title text not null,
      amount numeric not null,
      notes text,
      approved_at date,
      created_at timestamptz not null default now()
    )
  `;
}

function ensureHouseChangeOrdersTable() {
  houseChangeOrdersTableReady ??= initializeHouseChangeOrdersTable().catch((error) => {
    houseChangeOrdersTableReady = null;
    throw error;
  });

  return houseChangeOrdersTableReady;
}

async function initializeHouseProjectDocumentsTable() {
  await sql()`
    create table if not exists house_project_documents (
      id bigserial primary key,
      qbo_bank_account_id text not null,
      house_name text not null,
      document_type text not null,
      file_name text not null,
      file_type text not null,
      file_url text,
      storage_path text,
      uploaded_at timestamptz not null default now()
    )
  `;
  await sql()`
    create index if not exists house_project_documents_house_type_idx
    on house_project_documents (qbo_bank_account_id, document_type, uploaded_at desc)
  `;
}

function ensureHouseProjectDocumentsTable() {
  houseProjectDocumentsTableReady ??= initializeHouseProjectDocumentsTable().catch((error) => {
    houseProjectDocumentsTableReady = null;
    throw error;
  });

  return houseProjectDocumentsTableReady;
}

export async function getHouseProjectDocuments(qboBankAccountId: string) {
  if (!hasDatabaseUrl()) {
    return [];
  }

  await ensureHouseProjectDocumentsTable();
  const rows = await sql()<
    Array<{
      id: string;
      qbo_bank_account_id: string;
      house_name: string;
      document_type: string;
      file_name: string;
      file_type: string;
      file_url: string | null;
      storage_path: string | null;
      uploaded_at: Date;
    }>
  >`
    select
      id,
      qbo_bank_account_id,
      house_name,
      document_type,
      file_name,
      file_type,
      file_url,
      storage_path,
      uploaded_at
    from house_project_documents
    where qbo_bank_account_id = ${qboBankAccountId}
    order by uploaded_at desc
  `;

  return rows.map((row): HouseProjectDocument => ({
    id: Number(row.id),
    qboBankAccountId: row.qbo_bank_account_id,
    houseName: row.house_name,
    documentType: row.document_type,
    fileName: row.file_name,
    fileType: row.file_type,
    fileUrl: row.file_url,
    storagePath: row.storage_path,
    uploadedAt: row.uploaded_at.toISOString(),
  }));
}

export async function saveHouseProjectDocument({
  qboBankAccountId,
  houseName,
  documentType,
  fileName,
  fileType,
  fileUrl,
  storagePath,
}: {
  qboBankAccountId: string;
  houseName: string;
  documentType: string;
  fileName: string;
  fileType: string;
  fileUrl: string | null;
  storagePath: string | null;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required to save project documents.");
  }

  await ensureHouseProjectDocumentsTable();

  if (documentType !== "supporting") {
    await sql()`
      delete from house_project_documents
      where qbo_bank_account_id = ${qboBankAccountId}
        and document_type = ${documentType}
    `;
  }

  await sql()`
    insert into house_project_documents (
      qbo_bank_account_id,
      house_name,
      document_type,
      file_name,
      file_type,
      file_url,
      storage_path,
      uploaded_at
    )
    values (
      ${qboBankAccountId},
      ${houseName},
      ${documentType},
      ${fileName},
      ${fileType},
      ${fileUrl},
      ${storagePath},
      now()
    )
  `;
}

export async function getHouseDetailsMap() {
  const details = new Map<string, HouseDetail>();

  if (!hasDatabaseUrl()) {
    return details;
  }

  await ensureHouseDetailsTable();
  await ensureHouseChangeOrdersTable();
  const rows = await sql()<
    Array<{
      qbo_bank_account_id: string;
      house_name: string;
      sold_price: string | null;
      square_footage: number | null;
      city: string | null;
      manual_render_image_url: string | null;
      render_storage_path: string | null;
      contract_file_name: string | null;
      contract_file_type: string | null;
      contract_file_url: string | null;
      contract_storage_path: string | null;
      contract_file_data_url: string | null;
      contract_uploaded_at: Date | null;
      contract_price: string | null;
      contract_square_footage: number | null;
      contract_city: string | null;
      contract_source_status: string | null;
      project_status: string;
      project_number: number | null;
      display_name: string | null;
      holdback_amount: string | null;
      holdback_notes: string | null;
      change_order_total: string | null;
      updated_at: Date;
    }>
  >`
    select
      h.qbo_bank_account_id,
      h.house_name,
      h.sold_price,
      h.square_footage,
      h.city,
      h.manual_render_image_url,
      h.render_storage_path,
      h.contract_file_name,
      h.contract_file_type,
      h.contract_file_url,
      h.contract_storage_path,
      h.contract_file_data_url,
      h.contract_uploaded_at,
      h.contract_price,
      h.contract_square_footage,
      h.contract_city,
      h.contract_source_status,
      h.project_status,
      h.project_number,
      h.display_name,
      h.holdback_amount,
      h.holdback_notes,
      coalesce(sum(c.amount), 0) as change_order_total,
      h.updated_at
    from house_details h
    left join house_change_orders c
      on c.qbo_bank_account_id = h.qbo_bank_account_id
    group by
      h.qbo_bank_account_id,
      h.house_name,
      h.sold_price,
      h.square_footage,
      h.city,
      h.manual_render_image_url,
      h.render_storage_path,
      h.contract_file_name,
      h.contract_file_type,
      h.contract_file_url,
      h.contract_storage_path,
      h.contract_file_data_url,
      h.contract_uploaded_at,
      h.contract_price,
      h.contract_square_footage,
      h.contract_city,
      h.contract_source_status,
      h.project_status,
      h.project_number,
      h.display_name,
      h.holdback_amount,
      h.holdback_notes,
      h.updated_at
    order by h.house_name
  `;

  for (const row of rows) {
    const contractPrice = row.contract_price === null ? null : Number(row.contract_price);
    const changeOrderTotal = Number(row.change_order_total ?? 0);

    details.set(row.qbo_bank_account_id, {
      qboBankAccountId: row.qbo_bank_account_id,
      houseName: row.house_name,
      soldPrice: row.sold_price === null ? null : Number(row.sold_price),
      squareFootage: row.square_footage,
      city: row.city,
      manualRenderImageUrl: row.manual_render_image_url,
      renderStoragePath: row.render_storage_path,
      contractFileName: row.contract_file_name,
      contractFileType: row.contract_file_type,
      contractFileUrl: row.contract_file_url,
      contractStoragePath: row.contract_storage_path,
      contractFileDataUrl: row.contract_file_data_url,
      contractUploadedAt: row.contract_uploaded_at?.toISOString() ?? null,
      contractPrice,
      contractSquareFootage: row.contract_square_footage,
      contractCity: row.contract_city,
      contractSourceStatus: row.contract_source_status,
      projectStatus: row.project_status,
      projectNumber: row.project_number,
      displayName: row.display_name,
      holdbackAmount: row.holdback_amount === null ? null : Number(row.holdback_amount),
      holdbackNotes: row.holdback_notes,
      changeOrderTotal,
      currentContractPrice: contractPrice === null ? null : contractPrice + changeOrderTotal,
      updatedAt: row.updated_at.toISOString(),
    });
  }

  return details;
}

export async function getHouseChangeOrdersMap() {
  const changeOrders = new Map<string, HouseChangeOrder[]>();

  if (!hasDatabaseUrl()) {
    return changeOrders;
  }

  await ensureHouseChangeOrdersTable();
  const rows = await sql()<
    Array<{
      id: string;
      qbo_bank_account_id: string;
      house_name: string;
      title: string;
      amount: string;
      notes: string | null;
      approved_at: Date | null;
      created_at: Date;
    }>
  >`
    select
      id,
      qbo_bank_account_id,
      house_name,
      title,
      amount,
      notes,
      approved_at,
      created_at
    from house_change_orders
    order by house_name, created_at desc
  `;

  for (const row of rows) {
    const existing = changeOrders.get(row.qbo_bank_account_id) ?? [];

    existing.push({
      id: Number(row.id),
      qboBankAccountId: row.qbo_bank_account_id,
      houseName: row.house_name,
      title: row.title,
      amount: Number(row.amount),
      notes: row.notes,
      approvedAt: row.approved_at?.toISOString().slice(0, 10) ?? null,
      createdAt: row.created_at.toISOString(),
    });
    changeOrders.set(row.qbo_bank_account_id, existing);
  }

  return changeOrders;
}

export async function saveHouseManualRenderImage({
  qboBankAccountId,
  houseName,
  manualRenderImageUrl,
  renderStoragePath = null,
}: {
  qboBankAccountId: string;
  houseName: string;
  manualRenderImageUrl: string | null;
  renderStoragePath?: string | null;
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
      render_storage_path,
      updated_at
    )
    values (
      ${qboBankAccountId},
      ${houseName},
      ${manualRenderImageUrl},
      ${renderStoragePath},
      now()
    )
    on conflict (qbo_bank_account_id) do update set
      house_name = excluded.house_name,
      manual_render_image_url = excluded.manual_render_image_url,
      render_storage_path = coalesce(excluded.render_storage_path, house_details.render_storage_path),
      updated_at = now()
  `;
}

export async function saveHouseContractSource({
  qboBankAccountId,
  houseName,
  contractFileName,
  contractFileType,
  contractFileUrl,
  contractStoragePath,
  contractFileDataUrl,
  contractPrice,
  contractSquareFootage,
  contractCity,
  contractSourceStatus = "reviewed",
}: {
  qboBankAccountId: string;
  houseName: string;
  contractFileName: string | null;
  contractFileType: string | null;
  contractFileUrl?: string | null;
  contractStoragePath?: string | null;
  contractFileDataUrl: string | null;
  contractPrice: number | null;
  contractSquareFootage: number | null;
  contractCity: string | null;
  contractSourceStatus?: string | null;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required to save contract source data.");
  }

  await ensureHouseDetailsTable();
  await sql()`
    insert into house_details (
      qbo_bank_account_id,
      house_name,
      sold_price,
      square_footage,
      city,
      contract_file_name,
      contract_file_type,
      contract_file_url,
      contract_storage_path,
      contract_file_data_url,
      contract_uploaded_at,
      contract_price,
      contract_square_footage,
      contract_city,
      contract_source_status,
      updated_at
    )
    values (
      ${qboBankAccountId},
      ${houseName},
      null,
      null,
      null,
      ${contractFileName},
      ${contractFileType},
      ${contractFileUrl ?? null},
      ${contractStoragePath ?? null},
      ${contractFileDataUrl},
      now(),
      ${contractPrice},
      ${contractSquareFootage},
      ${contractCity},
      ${contractSourceStatus ?? "reviewed"},
      now()
    )
    on conflict (qbo_bank_account_id) do update set
      house_name = excluded.house_name,
      contract_file_name = coalesce(excluded.contract_file_name, house_details.contract_file_name),
      contract_file_type = coalesce(excluded.contract_file_type, house_details.contract_file_type),
      contract_file_url = coalesce(excluded.contract_file_url, house_details.contract_file_url),
      contract_storage_path = coalesce(excluded.contract_storage_path, house_details.contract_storage_path),
      contract_file_data_url = coalesce(excluded.contract_file_data_url, house_details.contract_file_data_url),
      contract_uploaded_at = coalesce(excluded.contract_uploaded_at, house_details.contract_uploaded_at),
      contract_price = coalesce(excluded.contract_price, house_details.contract_price),
      contract_square_footage = coalesce(excluded.contract_square_footage, house_details.contract_square_footage),
      contract_city = coalesce(excluded.contract_city, house_details.contract_city),
      contract_source_status = excluded.contract_source_status,
      updated_at = now()
  `;
}

export async function clearHouseContractSource({
  qboBankAccountId,
}: {
  qboBankAccountId: string;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required to delete contract source data.");
  }

  await ensureHouseDetailsTable();
  const rows = await sql()<
    Array<{
      contract_storage_path: string | null;
    }>
  >`
    select contract_storage_path
    from house_details
    where qbo_bank_account_id = ${qboBankAccountId}
    limit 1
  `;

  await sql()`
    update house_details
    set
      sold_price = case
        when contract_price is not null and sold_price = contract_price then null
        else sold_price
      end,
      square_footage = case
        when contract_square_footage is not null and square_footage = contract_square_footage then null
        else square_footage
      end,
      city = case
        when contract_city is not null and city = contract_city then null
        else city
      end,
      contract_file_name = null,
      contract_file_type = null,
      contract_file_url = null,
      contract_storage_path = null,
      contract_file_data_url = null,
      contract_uploaded_at = null,
      contract_price = null,
      contract_square_footage = null,
      contract_city = null,
      contract_source_status = null,
      updated_at = now()
    where qbo_bank_account_id = ${qboBankAccountId}
  `;

  return rows[0]?.contract_storage_path ?? null;
}

export async function addHouseChangeOrder({
  qboBankAccountId,
  houseName,
  title,
  amount,
  notes,
  approvedAt,
}: {
  qboBankAccountId: string;
  houseName: string;
  title: string;
  amount: number;
  notes: string | null;
  approvedAt: string | null;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required to save change orders.");
  }

  await ensureHouseChangeOrdersTable();
  await sql()`
    insert into house_change_orders (
      qbo_bank_account_id,
      house_name,
      title,
      amount,
      notes,
      approved_at
    )
    values (
      ${qboBankAccountId},
      ${houseName},
      ${title},
      ${amount},
      ${notes},
      ${approvedAt}
    )
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

export async function saveHouseProjectStatus({
  qboBankAccountId,
  houseName,
  projectStatus,
}: {
  qboBankAccountId: string;
  houseName: string;
  projectStatus: string;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required to save project status.");
  }

  await ensureHouseDetailsTable();
  await sql()`
    insert into house_details (
      qbo_bank_account_id,
      house_name,
      project_status,
      updated_at
    )
    values (
      ${qboBankAccountId},
      ${houseName},
      ${projectStatus},
      now()
    )
    on conflict (qbo_bank_account_id) do update set
      house_name = excluded.house_name,
      project_status = excluded.project_status,
      updated_at = now()
  `;
}

export async function saveHouseProjectNumber({
  qboBankAccountId,
  houseName,
  projectNumber,
}: {
  qboBankAccountId: string;
  houseName: string;
  projectNumber: number | null;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required to save project numbers.");
  }

  await ensureHouseDetailsTable();

  if (projectNumber !== null) {
    const duplicate = await sql()<Array<{ house_name: string }>>`
      select house_name
      from house_details
      where project_number = ${projectNumber}
        and qbo_bank_account_id <> ${qboBankAccountId}
      limit 1
    `;

    if (duplicate[0]) {
      throw new Error(`Project ${projectNumber} is already assigned to ${duplicate[0].house_name}.`);
    }
  }

  await sql()`
    insert into house_details (
      qbo_bank_account_id,
      house_name,
      project_number,
      updated_at
    )
    values (
      ${qboBankAccountId},
      ${houseName},
      ${projectNumber},
      now()
    )
    on conflict (qbo_bank_account_id) do update set
      house_name = excluded.house_name,
      project_number = excluded.project_number,
      updated_at = now()
  `;
}

export async function saveHouseDisplayName({
  qboBankAccountId,
  houseName,
  displayName,
}: {
  qboBankAccountId: string;
  houseName: string;
  displayName: string | null;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required to save project names.");
  }

  await ensureHouseDetailsTable();
  await sql()`
    insert into house_details (
      qbo_bank_account_id,
      house_name,
      display_name,
      updated_at
    )
    values (
      ${qboBankAccountId},
      ${houseName},
      ${displayName},
      now()
    )
    on conflict (qbo_bank_account_id) do update set
      house_name = excluded.house_name,
      display_name = excluded.display_name,
      updated_at = now()
  `;
}

export async function saveHouseHoldback({
  qboBankAccountId,
  houseName,
  holdbackAmount,
  holdbackNotes,
}: {
  qboBankAccountId: string;
  houseName: string;
  holdbackAmount: number | null;
  holdbackNotes: string | null;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required to save holdback details.");
  }

  await ensureHouseDetailsTable();
  await sql()`
    insert into house_details (
      qbo_bank_account_id,
      house_name,
      holdback_amount,
      holdback_notes,
      updated_at
    )
    values (
      ${qboBankAccountId},
      ${houseName},
      ${holdbackAmount},
      ${holdbackNotes},
      now()
    )
    on conflict (qbo_bank_account_id) do update set
      house_name = excluded.house_name,
      holdback_amount = excluded.holdback_amount,
      holdback_notes = excluded.holdback_notes,
      updated_at = now()
  `;
}
