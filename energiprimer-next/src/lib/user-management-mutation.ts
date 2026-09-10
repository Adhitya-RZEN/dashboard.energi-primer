import {
  UserAuditAction,
  UserRole,
  UserStatus,
} from "@prisma/client";

import {
  ADMIN_ROLE,
  isAuthorizationStatus,
  isDashboardRole,
  securityVersionUpdate,
  USER_ROLE,
} from "./authorization-policy";
import type { AuthorizationRole } from "./authorization-policy";
import type { AuthorizationStatus } from "./authorization-policy";
import type { UserManagementTransaction } from "./authorization";
import { UserManagementDuplicateError } from "./user-management-errors";
import type {
  EditUserField,
  NormalizedCreateUserInput,
  NormalizedEditUserInput,
} from "./user-management-validation";

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

const roleChangeUserSelect = {
  id: true,
  username: true,
  name: true,
  email: true,
  role: true,
  status: true,
  updatedAt: true,
} as const;

export type RoleChangeUserRecord = {
  id: bigint;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  updatedAt: Date | null;
};

const statusChangeUserSelect = {
  id: true,
  username: true,
  name: true,
  email: true,
  role: true,
  status: true,
  updatedAt: true,
} as const;

const profileUserSelect = {
  id: true,
  username: true,
  name: true,
  email: true,
  role: true,
  status: true,
} as const;

export type UserProfileRecord = {
  id: bigint;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};

export type StatusChangeUserRecord = {
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
 * Check editable identity fields against every other account while the
 * caller's transaction holds the authorization locks. Database constraints
 * remain the final race-safe enforcement.
 */
export async function assertUserProfileUnique(
  tx: UserManagementTransaction,
  targetUserId: bigint,
  input: NormalizedEditUserInput,
) {
  const usernameMatch = await tx.user.findFirst({
    where: {
      username: { equals: input.username, mode: "insensitive" },
      NOT: { id: targetUserId },
    },
    select: { id: true },
  });
  if (usernameMatch) throw new UserManagementDuplicateError("username");

  const emailMatch = await tx.user.findFirst({
    where: {
      email: { equals: input.email, mode: "insensitive" },
      NOT: { id: targetUserId },
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

/**
 * Update only the locked target role/security version and write the matching
 * ROLE_CHANGED audit row in the caller's transaction.
 */
export async function changeUserRoleAndAudit(
  tx: UserManagementTransaction,
  actorUserId: bigint,
  targetUserId: bigint,
  fromRole: UserRole,
  nextRole: AuthorizationRole,
  now = new Date(),
): Promise<RoleChangeUserRecord> {
  if (!isDashboardRole(fromRole) || fromRole === nextRole) {
    throw new Error("Invalid role transition");
  }

  const role = nextRole === ADMIN_ROLE ? UserRole.ADMIN : UserRole.USER;
  const updatedUser = await tx.user.update({
    where: { id: targetUserId },
    data: {
      role,
      ...securityVersionUpdate(now),
    },
    select: roleChangeUserSelect,
  });

  await tx.userAuditLog.create({
    data: {
      actorUserId,
      targetUserId: updatedUser.id,
      action: UserAuditAction.ROLE_CHANGED,
      metadata: {
        fromRole,
        toRole: updatedUser.role,
      },
    },
    select: { id: true },
  });

  return updatedUser;
}

/**
 * Update only the locked target status/security version and write the matching
 * USER_ENABLED or USER_DISABLED audit row in the caller's transaction.
 */
export async function changeUserStatusAndAudit(
  tx: UserManagementTransaction,
  actorUserId: bigint,
  targetUserId: bigint,
  fromStatus: UserStatus,
  nextStatus: AuthorizationStatus,
  now = new Date(),
): Promise<StatusChangeUserRecord> {
  if (
    !isAuthorizationStatus(fromStatus) ||
    !isAuthorizationStatus(nextStatus) ||
    fromStatus === nextStatus
  ) {
    throw new Error("Invalid status transition");
  }

  const status =
    nextStatus === "ACTIVE" ? UserStatus.ACTIVE : UserStatus.DISABLED;
  const updatedUser = await tx.user.update({
    where: { id: targetUserId },
    data: {
      status,
      ...securityVersionUpdate(now),
    },
    select: statusChangeUserSelect,
  });

  await tx.userAuditLog.create({
    data: {
      actorUserId,
      targetUserId: updatedUser.id,
      action:
        status === UserStatus.ACTIVE
          ? UserAuditAction.USER_ENABLED
          : UserAuditAction.USER_DISABLED,
      metadata: {
        fromStatus,
        toStatus: updatedUser.status,
      },
    },
    select: { id: true },
  });

  return updatedUser;
}

/**
 * Update only editable profile fields and record USER_UPDATED atomically.
 * Role, status, password, and security-version fields are intentionally not
 * included in the update payload.
 */
export async function updateUserProfileAndAudit(
  tx: UserManagementTransaction,
  actorUserId: bigint,
  targetUserId: bigint,
  input: NormalizedEditUserInput,
  changedFields: EditUserField[],
): Promise<UserProfileRecord> {
  const updatedUser = await tx.user.update({
    where: { id: targetUserId },
    data: {
      username: input.username,
      name: input.name,
      email: input.email,
    },
    select: profileUserSelect,
  });

  await tx.userAuditLog.create({
    data: {
      actorUserId,
      targetUserId: updatedUser.id,
      action: UserAuditAction.USER_UPDATED,
      metadata: { fields: changedFields },
    },
    select: { id: true },
  });

  return updatedUser;
}
