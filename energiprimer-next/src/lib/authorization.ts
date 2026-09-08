import "server-only";

import { Prisma, UserRole, UserStatus } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import {
  ACTIVE_STATUS,
  ADMIN_ROLE,
  DISABLED_STATUS,
  USER_ROLE,
  assertActiveUser,
  assertAdminUser,
  assertCanChangeRole,
  assertCanChangeStatus,
  assertCanManageUser,
  assertLastAdminSafe,
  canAccessDashboard,
  canAccessUserManagement,
  AuthorizationPolicyError,
  isAuthorizationPolicyError,
  isDashboardRole,
  securityVersionUpdate,
  type AuthorizationRole,
  type AuthorizationStatus,
  type AuthorizationSubject,
  type LastAdminOperation,
  type UserManagementAction,
} from "@/lib/authorization-policy";

export {
  ACTIVE_STATUS,
  ADMIN_ROLE,
  DISABLED_STATUS,
  USER_ROLE,
  assertActiveUser,
  assertAdminUser,
  assertCanChangeRole,
  assertCanChangeStatus,
  assertCanManageUser,
  assertLastAdminSafe,
  canAccessDashboard,
  canAccessUserManagement,
  AuthorizationPolicyError,
  isAuthorizationPolicyError,
  isDashboardRole,
  securityVersionUpdate,
};

export type {
  AuthorizationRole,
  AuthorizationStatus,
  AuthorizationSubject,
  LastAdminOperation,
  UserManagementAction,
};

const sessionUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  updatedAt: true,
} as const;

type SessionUserRecord = Prisma.UserGetPayload<{
  select: typeof sessionUserSelect;
}>;

function parseSessionUserId(value: unknown) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function asPolicySubject(user: Pick<SessionUserRecord, "id" | "role" | "status">) {
  return user satisfies AuthorizationSubject;
}

/**
 * Read the current account state on the server. Auth.js session callbacks
 * already revalidate the JWT version; this second boundary keeps future
 * server actions from trusting a client-visible role alone.
 */
export async function requireActiveSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthorizationPolicyError(
      "UNAUTHENTICATED",
      "Authentication is required.",
    );
  }

  const userId = parseSessionUserId(session.user.id);
  if (userId === null || !isDashboardRole(session.user.role)) {
    throw new AuthorizationPolicyError(
      "INVALID_SESSION",
      "The authenticated session is invalid.",
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: sessionUserSelect,
  });
  if (!user) {
    throw new AuthorizationPolicyError(
      "INVALID_SESSION",
      "The authenticated session is invalid.",
    );
  }

  const subject = asPolicySubject(user);
  assertActiveUser(subject);
  if (user.role !== session.user.role) {
    throw new AuthorizationPolicyError(
      "INVALID_SESSION",
      "The authenticated session is stale.",
    );
  }

  return { session, user };
}

export async function requireAuthenticatedUser() {
  return requireActiveSession();
}

export async function requireDashboardUser() {
  const current = await requireActiveSession();
  if (!canAccessDashboard(current.user)) {
    throw new AuthorizationPolicyError(
      "FORBIDDEN",
      "Dashboard access is not permitted.",
    );
  }
  return current;
}

export async function requireAdminUser() {
  const current = await requireActiveSession();
  assertAdminUser(asPolicySubject(current.user));
  return current;
}

export type UserManagementTransaction = Prisma.TransactionClient;

function parseUserId(value: bigint | string) {
  try {
    const parsed = typeof value === "bigint" ? value : BigInt(value);
    if (parsed < BigInt(0)) throw new Error("negative id");
    return parsed;
  } catch {
    throw new AuthorizationPolicyError(
      "INVALID_POLICY_INPUT",
      "The user id is invalid.",
    );
  }
}

async function loadLockedPolicyContext(
  tx: UserManagementTransaction,
  actorId: bigint | string,
  targetId: bigint | string,
) {
  const actorUserId = parseUserId(actorId);
  const targetUserId = parseUserId(targetId);
  const ids = actorUserId === targetUserId
    ? [actorUserId]
    : [actorUserId, targetUserId];

  // Lock all active admins and both participants in a deterministic order.
  // Future role/status mutations must use this context inside the same
  // serializable transaction before changing the target row.
  await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT "id"
    FROM "users"
    WHERE "id" IN (${Prisma.join(ids)})
       OR (
         "role" = CAST(${UserRole.ADMIN} AS "UserRole")
         AND "status" = CAST(${UserStatus.ACTIVE} AS "UserStatus")
       )
    ORDER BY "id"
    FOR UPDATE
  `);

  const users = await tx.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, role: true, status: true },
  });
  const actor = users.find((user) => user.id === actorUserId);
  const target = users.find((user) => user.id === targetUserId);
  if (!actor || !target) {
    throw new AuthorizationPolicyError(
      "INVALID_TARGET",
      "The user authorization target is unavailable.",
    );
  }

  const activeAdminCount = await tx.user.count({
    where: {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  return { actor, target, activeAdminCount };
}

/**
 * All future user-management mutations should run their guard and mutation
 * through this transaction wrapper. Serializable isolation plus the active
 * administrator row lock prevents two concurrent operations from removing
 * the last active administrator.
 */
export function withUserManagementTransaction<T>(
  callback: (tx: UserManagementTransaction) => Promise<T>,
) {
  return prisma.$transaction(callback, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 5_000,
  });
}

export async function assertCanChangeRoleInTransaction(
  tx: UserManagementTransaction,
  actorId: bigint | string,
  targetId: bigint | string,
  nextRole: AuthorizationRole,
) {
  const context = await loadLockedPolicyContext(tx, actorId, targetId);
  assertCanChangeRole(
    asPolicySubject(context.actor),
    asPolicySubject(context.target),
    nextRole,
    context.activeAdminCount,
  );
  return context;
}

export async function assertCanChangeStatusInTransaction(
  tx: UserManagementTransaction,
  actorId: bigint | string,
  targetId: bigint | string,
  nextStatus: AuthorizationStatus,
) {
  const context = await loadLockedPolicyContext(tx, actorId, targetId);
  assertCanChangeStatus(
    asPolicySubject(context.actor),
    asPolicySubject(context.target),
    nextStatus,
    context.activeAdminCount,
  );
  return context;
}

export async function assertCanManageUserInTransaction(
  tx: UserManagementTransaction,
  actorId: bigint | string,
  targetId: bigint | string,
  action: UserManagementAction,
  nextRole?: AuthorizationRole,
) {
  const context = await loadLockedPolicyContext(tx, actorId, targetId);
  assertCanManageUser(
    asPolicySubject(context.actor),
    asPolicySubject(context.target),
    action,
    { activeAdminCount: context.activeAdminCount, nextRole },
  );
  return context;
}
