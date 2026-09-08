import {
  UserAuditAction,
  UserRole,
  UserStatus,
} from "@prisma/client";

import {
  ADMIN_ROLE,
  securityVersionUpdate,
  USER_ROLE,
} from "./authorization-policy";
import type { UserManagementTransaction } from "./authorization";
import { UserManagementDuplicateError } from "./user-management-errors";
import type { NormalizedCreateUserInput } from "./user-management-validation";

const createdUserSelect = {
  id: true,
  username: true,
  name: true,
  email: true,
  role: true,
  status: true,
} as const;

const resetUserSelect = {
  id: true,
  username: true,
  name: true,
  email: true,
  role: true,
  status: true,
  updatedAt: true,
} as const;

export type CreatedUserRecord = {
  id: bigint;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};

export type ResetUserRecord = {
  id: bigint;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  updatedAt: Date | null;
};

/**
 * Optional in-transaction preflight for a user-friendly duplicate message.
 * Database unique constraints remain the final race-safe enforcement.
 */
export async function assertUserCreationUnique(
  tx: UserManagementTransaction,
  input: NormalizedCreateUserInput,
) {
  const usernameMatch = await tx.user.findUnique({
    where: { username: input.username },
    select: { id: true },
  });
  if (usernameMatch) throw new UserManagementDuplicateError("username");

  const emailMatch = await tx.user.findFirst({
    where: {
      email: { equals: input.email, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (emailMatch) throw new UserManagementDuplicateError("email");
}

/**
 * Create the user and its USER_CREATED audit record in the same transaction.
 * The caller owns authorization, transaction isolation, and error mapping.
 */
export async function createUserAndAudit(
  tx: UserManagementTransaction,
  actorUserId: bigint,
  input: NormalizedCreateUserInput,
  passwordHash: string,
  now = new Date(),
): Promise<CreatedUserRecord> {
  const role =
    input.role === ADMIN_ROLE ? UserRole.ADMIN :
    input.role === USER_ROLE ? UserRole.USER : null;
  if (!role) throw new Error("Invalid role");

  const createdUser = await tx.user.create({
    data: {
      username: input.username,
      name: input.name,
      email: input.email,
      password: passwordHash,
      role,
      status: UserStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
    },
    select: createdUserSelect,
  });

  await tx.userAuditLog.create({
    data: {
      actorUserId,
      targetUserId: createdUser.id,
      action: UserAuditAction.USER_CREATED,
      metadata: {
        username: createdUser.username,
        role: createdUser.role,
      },
    },
    select: { id: true },
  });

  return createdUser;
}

/**
 * Update only the target password/security version and write the corresponding
 * PASSWORD_RESET audit row in the caller's transaction.
 */
export async function resetUserPasswordAndAudit(
  tx: UserManagementTransaction,
  actorUserId: bigint,
  targetUserId: bigint,
  passwordHash: string,
  now = new Date(),
): Promise<ResetUserRecord> {
  const updatedUser = await tx.user.update({
    where: { id: targetUserId },
    data: {
      password: passwordHash,
      ...securityVersionUpdate(now),
    },
    select: resetUserSelect,
  });

  await tx.userAuditLog.create({
    data: {
      actorUserId,
      targetUserId: updatedUser.id,
      action: UserAuditAction.PASSWORD_RESET,
      metadata: {},
    },
    select: { id: true },
  });

  return updatedUser;
}
