"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  assertAdminUser,
  assertCanChangeRoleInTransaction,
  assertCanResetPasswordInTransaction,
  AuthorizationPolicyError,
  isAuthorizationPolicyError,
  requireAdminUser,
  withUserManagementTransaction,
} from "@/lib/authorization";
import {
  assertUserCreationUnique,
  changeUserRoleAndAudit,
  createUserAndAudit,
  resetUserPasswordAndAudit,
} from "@/lib/user-management-mutation";
import {
  duplicateUserField,
  UserManagementDuplicateError,
} from "@/lib/user-management-errors";
import {
  isAuthorizationRole,
  parseUserManagementUserId,
  type PasswordResetFieldErrors,
  validateCreateUserInput,
  validatePasswordResetInput,
  type CreateUserFieldErrors,
} from "@/lib/user-management-validation";

const BCRYPT_ROUNDS = 12;
const SAFE_AUTHORIZATION_ERROR =
  "Your session is no longer authorized to perform this action.";
const SAFE_GENERIC_ERROR = "Unable to create user.";
const SAFE_RESET_ERROR = "Unable to reset password.";
const SAFE_ROLE_ERROR = "Unable to change user role.";
const SAFE_TARGET_NOT_FOUND = "User not found.";
const SAFE_SELF_RESET_ERROR =
  "You cannot reset your own password from User Management.";
const SAFE_SELF_ROLE_ERROR =
  "You cannot change your own role from User Management.";
const SAFE_NO_ROLE_CHANGE = "The user already has this role.";
const SAFE_LAST_ADMIN_ERROR =
  "The last active administrator cannot be removed.";

export type CreateUserState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: CreateUserFieldErrors;
};

export type ResetPasswordState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: PasswordResetFieldErrors;
};

export type ChangeRoleState = {
  status: "idle" | "error" | "success";
  message?: string;
};

async function assertAdminActorInTransaction(
  tx: Parameters<typeof createUserAndAudit>[0],
  actorUserId: bigint,
) {
  await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT "id"
    FROM "users"
    WHERE "id" = ${actorUserId}
    FOR UPDATE
  `);

  const actor = await tx.user.findUnique({
    where: { id: actorUserId },
    select: { id: true, role: true, status: true },
  });
  if (!actor) {
    throw new AuthorizationPolicyError(
      "INVALID_SESSION",
      "The authenticated actor is unavailable.",
    );
  }
  assertAdminUser(actor);
}

function safeAuthorizationError(error: unknown) {
  return isAuthorizationPolicyError(error)
    ? SAFE_AUTHORIZATION_ERROR
    : null;
}

export async function createUser(
  _previousState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  try {
    const current = await requireAdminUser();
    const validation = validateCreateUserInput({
      username: formData.get("username"),
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
      role: formData.get("role"),
    });

    if (!validation.valid) {
      return {
        status: "error",
        message: "Please correct the highlighted fields.",
        fieldErrors: validation.fieldErrors,
      };
    }

    const passwordHash = await bcrypt.hash(
      validation.input.password,
      BCRYPT_ROUNDS,
    );

    await withUserManagementTransaction(async (tx) => {
      await assertAdminActorInTransaction(tx, current.user.id);
      await assertUserCreationUnique(tx, validation.input);
      await createUserAndAudit(
        tx,
        current.user.id,
        validation.input,
        passwordHash,
        new Date(),
      );
    });

    revalidatePath("/pengaturan/users");
    return {
      status: "success",
      message: "User created successfully.",
    };
  } catch (error) {
    const authorizationMessage = safeAuthorizationError(error);
    if (authorizationMessage) {
      return { status: "error", message: authorizationMessage };
    }

    const duplicateField =
      error instanceof UserManagementDuplicateError
        ? error.field
        : duplicateUserField(error);
    if (duplicateField === "username") {
      return {
        status: "error",
        message: "Username is already in use.",
        fieldErrors: { username: "Username is already in use." },
      };
    }
    if (duplicateField === "email") {
      return {
        status: "error",
        message: "An account with this email already exists.",
        fieldErrors: { email: "An account with this email already exists." },
      };
    }

    return { status: "error", message: SAFE_GENERIC_ERROR };
  }
}

export async function resetPassword(
  _previousState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  try {
    const current = await requireAdminUser();
    const targetUserId = parseUserManagementUserId(
      formData.get("targetUserId"),
    );
    if (targetUserId === null) {
      return { status: "error", message: SAFE_TARGET_NOT_FOUND };
    }

    const validation = validatePasswordResetInput({
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });
    if (!validation.valid) {
      return {
        status: "error",
        message: "Please correct the highlighted fields.",
        fieldErrors: validation.fieldErrors,
      };
    }

    const passwordHash = await bcrypt.hash(
      validation.input.newPassword,
      BCRYPT_ROUNDS,
    );

    await withUserManagementTransaction(async (tx) => {
      const context = await assertCanResetPasswordInTransaction(
        tx,
        current.user.id,
        targetUserId,
      );
      await resetUserPasswordAndAudit(
        tx,
        current.user.id,
        context.target.id,
        passwordHash,
        new Date(),
      );
    });

    revalidatePath("/pengaturan/users");
    return {
      status: "success",
      message: "Password reset successfully.",
    };
  } catch (error) {
    if (isAuthorizationPolicyError(error)) {
      if (error.code === "SELF_PASSWORD_RESET") {
        return { status: "error", message: SAFE_SELF_RESET_ERROR };
      }
      if (error.code === "INVALID_TARGET") {
        return { status: "error", message: SAFE_TARGET_NOT_FOUND };
      }
      return { status: "error", message: SAFE_AUTHORIZATION_ERROR };
    }

    return { status: "error", message: SAFE_RESET_ERROR };
  }
}

export async function changeRole(
  _previousState: ChangeRoleState,
  formData: FormData,
): Promise<ChangeRoleState> {
  try {
    const current = await requireAdminUser();
    const targetUserId = parseUserManagementUserId(
      formData.get("targetUserId"),
    );
    if (targetUserId === null) {
      return { status: "error", message: SAFE_TARGET_NOT_FOUND };
    }

    const requestedRole = formData.get("newRole");
    if (
      typeof requestedRole !== "string" ||
      !isAuthorizationRole(requestedRole)
    ) {
      return { status: "error", message: "Invalid role." };
    }

    await withUserManagementTransaction(async (tx) => {
      const context = await assertCanChangeRoleInTransaction(
        tx,
        current.user.id,
        targetUserId,
        requestedRole,
      );
      await changeUserRoleAndAudit(
        tx,
        current.user.id,
        context.target.id,
        context.target.role,
        requestedRole,
        new Date(),
      );
    });

    revalidatePath("/pengaturan/users");
    return {
      status: "success",
      message: "Role updated successfully.",
    };
  } catch (error) {
    if (isAuthorizationPolicyError(error)) {
      if (error.code === "SELF_ROLE_CHANGE") {
        return { status: "error", message: SAFE_SELF_ROLE_ERROR };
      }
      if (error.code === "NO_CHANGE") {
        return { status: "error", message: SAFE_NO_ROLE_CHANGE };
      }
      if (error.code === "LAST_ADMIN") {
        return { status: "error", message: SAFE_LAST_ADMIN_ERROR };
      }
      if (error.code === "INVALID_TARGET") {
        return { status: "error", message: SAFE_TARGET_NOT_FOUND };
      }
      return { status: "error", message: SAFE_AUTHORIZATION_ERROR };
    }

    return { status: "error", message: SAFE_ROLE_ERROR };
  }
}
