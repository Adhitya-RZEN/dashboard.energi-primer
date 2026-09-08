"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  assertAdminUser,
  AuthorizationPolicyError,
  isAuthorizationPolicyError,
  requireAdminUser,
  withUserManagementTransaction,
} from "@/lib/authorization";
import {
  assertUserCreationUnique,
  createUserAndAudit,
} from "@/lib/user-management-mutation";
import {
  duplicateUserField,
  UserManagementDuplicateError,
} from "@/lib/user-management-errors";
import {
  validateCreateUserInput,
  type CreateUserFieldErrors,
} from "@/lib/user-management-validation";

const BCRYPT_ROUNDS = 12;
const SAFE_AUTHORIZATION_ERROR =
  "Your session is no longer authorized to perform this action.";
const SAFE_GENERIC_ERROR = "Unable to create user.";

export type CreateUserState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: CreateUserFieldErrors;
};

export const initialCreateUserState: CreateUserState = {
  status: "idle",
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
