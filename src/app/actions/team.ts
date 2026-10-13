"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit/audit-log";
import {
  appRoles,
  createApiKey,
  createInviteLink,
  createUser,
  getUserById,
  revokeApiKey,
  roleLabels,
  setUserActive,
  updateUserRole,
  type AppRole,
} from "@/lib/auth/auth-store";
import { actorForUser, requireAdmin } from "@/lib/auth/session";
import { getPublicAppUrl } from "@/lib/app-url";

export type TeamFormState = {
  error: string | null;
  notice: string | null;
  secret?: string;
  fields?: Record<string, string>;
};

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function role(value: FormDataEntryValue | null): AppRole | null {
  const candidate = text(value);

  return appRoles.includes(candidate as AppRole) ? (candidate as AppRole) : null;
}

async function appOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";

  return host ? `${protocol}://${host}` : getPublicAppUrl();
}

function failure(error: unknown, fallback: string): TeamFormState {
  return { error: error instanceof Error ? error.message : fallback, notice: null };
}

export async function inviteUserAction(
  _previous: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const admin = await requireAdmin();
  const name = text(formData.get("name"));
  const email = text(formData.get("email")).toLowerCase();
  const selectedRole = role(formData.get("role"));
  const fields = { name, email, role: selectedRole ?? "editor" };

  if (!name || name.length > 80) {
    return { error: "Enter the person's name.", notice: null, fields };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address.", notice: null, fields };
  }

  if (!selectedRole) {
    return { error: "Choose what this person can do.", notice: null, fields };
  }

  try {
    const user = await createUser({ email, name, role: selectedRole, createdBy: admin.id });
    const { token } = await createInviteLink(user.id, admin.id, "invite");

    await recordAudit({
      actor: actorForUser(admin),
      action: "team.invited",
      entityType: "user",
      entityId: user.id,
      summary: `Invited ${user.name} (${user.email}) as ${roleLabels[user.role]}.`,
    });
    revalidatePath("/team");

    return {
      error: null,
      notice: `Send this link to ${user.name}. It works once and expires in 7 days.`,
      secret: `${await appOrigin()}/invite/${token}`,
    };
  } catch (error) {
    return { ...failure(error, "Could not invite this person."), fields };
  }
}

export async function newSignInLinkAction(
  _previous: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const admin = await requireAdmin();
  const user = await getUserById(text(formData.get("userId")));

  if (!user || !user.active) {
    return { error: "That person is not active.", notice: null };
  }

  const { token } = await createInviteLink(user.id, admin.id, user.hasPassword ? "reset" : "invite");

  await recordAudit({
    actor: actorForUser(admin),
    action: "team.sign_in_link_created",
    entityType: "user",
    entityId: user.id,
    summary: `Created a new sign-in link for ${user.name}.`,
  });

  return {
    error: null,
    notice: `New link for ${user.name}. Any older link stops working. It expires in 7 days.`,
    secret: `${await appOrigin()}/invite/${token}`,
  };
}

export async function changeRoleAction(
  _previous: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const admin = await requireAdmin();
  const userId = text(formData.get("userId"));
  const selectedRole = role(formData.get("role"));

  if (!selectedRole) {
    return { error: "Choose a role.", notice: null };
  }

  try {
    const { before } = await updateUserRole(userId, selectedRole);

    if (before.role !== selectedRole) {
      await recordAudit({
        actor: actorForUser(admin),
        action: "team.role_changed",
        entityType: "user",
        entityId: userId,
        summary: `Changed ${before.name} from ${roleLabels[before.role]} to ${roleLabels[selectedRole]}.`,
      });
    }

    revalidatePath("/team");

    return { error: null, notice: `${before.name} is now ${roleLabels[selectedRole]}.` };
  } catch (error) {
    return failure(error, "Could not change the role.");
  }
}

export async function setActiveAction(
  _previous: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const admin = await requireAdmin();
  const userId = text(formData.get("userId"));
  const active = text(formData.get("active")) === "true";

  if (userId === admin.id && !active) {
    return { error: "You cannot deactivate your own account.", notice: null };
  }

  try {
    const before = await setUserActive(userId, active);

    await recordAudit({
      actor: actorForUser(admin),
      action: active ? "team.reactivated" : "team.deactivated",
      entityType: "user",
      entityId: userId,
      summary: `${active ? "Reactivated" : "Deactivated"} ${before.name}.`,
    });
    revalidatePath("/team");

    return {
      error: null,
      notice: active
        ? `${before.name} can sign in again.`
        : `${before.name} was signed out and can no longer sign in.`,
    };
  } catch (error) {
    return failure(error, "Could not update this person.");
  }
}

export async function createApiKeyAction(
  _previous: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const admin = await requireAdmin();
  const name = text(formData.get("name")) || "Grokbot";

  if (name.length > 60) {
    return { error: "Keep the key name under 60 characters.", notice: null };
  }

  const { id, key } = await createApiKey(name, admin.id);

  await recordAudit({
    actor: actorForUser(admin),
    action: "api_key.created",
    entityType: "api_key",
    entityId: id,
    summary: `Created read-only key "${name}".`,
  });
  revalidatePath("/team");

  return {
    error: null,
    notice: "Copy this key now. It will not be shown again. It can only read data.",
    secret: key,
  };
}

export async function revokeApiKeyAction(
  _previous: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const admin = await requireAdmin();
  const id = text(formData.get("keyId"));
  const name = await revokeApiKey(id);

  if (!name) {
    return { error: "That key was already turned off.", notice: null };
  }

  await recordAudit({
    actor: actorForUser(admin),
    action: "api_key.revoked",
    entityType: "api_key",
    entityId: id,
    summary: `Turned off read-only key "${name}".`,
  });
  revalidatePath("/team");

  return { error: null, notice: `"${name}" can no longer read data.` };
}
