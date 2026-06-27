type UploadStorageObjectInput = {
  bucket: string;
  contentType: string;
  fileName: string;
  folder: string;
  isPublic: boolean;
  bytes: Buffer;
};

type UploadedStorageObject = {
  bucket: string;
  path: string;
  url: string;
};

function storageConfig() {
  const supabaseUrl =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.STORAGE_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return {
    serviceRoleKey,
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
  };
}

export function hasSupabaseStorage() {
  return Boolean(storageConfig());
}

function safePathPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function fileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.[a-z0-9]+$/);

  return match?.[0] ?? "";
}

async function ensureBucket({
  bucket,
  isPublic,
}: {
  bucket: string;
  isPublic: boolean;
}) {
  const config = storageConfig();

  if (!config) {
    return false;
  }

  const response = await fetch(`${config.supabaseUrl}/storage/v1/bucket`, {
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: isPublic,
    }),
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return response.ok || response.status === 400 || response.status === 409;
}

export async function uploadSupabaseStorageObject({
  bucket,
  bytes,
  contentType,
  fileName,
  folder,
  isPublic,
}: UploadStorageObjectInput): Promise<UploadedStorageObject | null> {
  const config = storageConfig();

  if (!config) {
    return null;
  }

  await ensureBucket({ bucket, isPublic });

  const extension = fileExtension(fileName);
  const objectPath = `${safePathPart(folder)}/${Date.now()}-${safePathPart(fileName.replace(/\.[a-z0-9]+$/i, ""))}${extension}`;
  const response = await fetch(
    `${config.supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`,
    {
      body: new Blob([new Uint8Array(bytes)], {
        type: contentType || "application/octet-stream",
      }),
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Cache-Control": "31536000",
        "Content-Type": contentType || "application/octet-stream",
        "x-upsert": "true",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    const message = await response.text().catch(() => "Storage upload failed.");
    throw new Error(`Storage upload failed: ${message}`);
  }

  return {
    bucket,
    path: objectPath,
    url: isPublic
      ? `${config.supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`
      : `${config.supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`,
  };
}

export async function deleteSupabaseStorageObject({
  bucket,
  path,
}: {
  bucket: string;
  path: string | null;
}) {
  const config = storageConfig();

  if (!config || !path) {
    return false;
  }

  const response = await fetch(`${config.supabaseUrl}/storage/v1/object/${bucket}`, {
    body: JSON.stringify({
      prefixes: [path],
    }),
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    method: "DELETE",
  });

  return response.ok;
}

export async function createSupabaseStorageSignedUrl({
  bucket,
  path,
  expiresIn = 300,
}: {
  bucket: string;
  path: string;
  expiresIn?: number;
}) {
  const config = storageConfig();

  if (!config) {
    return null;
  }

  const response = await fetch(
    `${config.supabaseUrl}/storage/v1/object/sign/${bucket}/${path}`,
    {
      body: JSON.stringify({ expiresIn }),
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    signedURL?: string;
    signedUrl?: string;
  };
  const signedPath = payload.signedURL ?? payload.signedUrl;

  if (!signedPath) {
    return null;
  }

  return signedPath.startsWith("http")
    ? signedPath
    : `${config.supabaseUrl}/storage/v1${signedPath.startsWith("/") ? "" : "/"}${signedPath}`;
}

export async function downloadSupabaseStorageObject({
  bucket,
  path,
}: {
  bucket: string;
  path: string;
}) {
  const config = storageConfig();

  if (!config) {
    return null;
  }

  const response = await fetch(
    `${config.supabaseUrl}/storage/v1/object/${bucket}/${path}`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
  };
}
