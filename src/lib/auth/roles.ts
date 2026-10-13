// Shared with client components, so this file must not import anything server-only.
export const appRoles = ["admin", "editor", "viewer"] as const;

export type AppRole = (typeof appRoles)[number];

export const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const roleDescriptions: Record<AppRole, string> = {
  admin: "Edits everything, manages people and read-only keys.",
  editor: "Adds and edits project setup, draws and payments.",
  viewer: "Can look at everything but cannot change anything.",
};

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  active: boolean;
  hasPassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export type ApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  createdByName: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};
