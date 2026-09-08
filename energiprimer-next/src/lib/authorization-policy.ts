export const ADMIN_ROLE = "ADMIN" as const;
export const USER_ROLE = "USER" as const;
export const ACTIVE_STATUS = "ACTIVE" as const;
export const DISABLED_STATUS = "DISABLED" as const;

export type AuthorizationRole = typeof ADMIN_ROLE | typeof USER_ROLE;
export type AuthorizationStatus =
  | typeof ACTIVE_STATUS
  | typeof DISABLED_STATUS;

export type AuthorizationSubject = Readonly<{
  id: bigint | string;
  role: string;
  status: string;
}>;

export type AuthorizationErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_SESSION"
  | "ACCOUNT_DISABLED"
  | "FORBIDDEN"
  | "INVALID_TARGET"
  | "INVALID_TRANSITION"
  | "SELF_ROLE_CHANGE"
  | "SELF_DISABLE"
  | "LAST_ADMIN"
  | "INVALID_POLICY_INPUT";

export class AuthorizationPolicyError extends Error {
  readonly code: AuthorizationErrorCode;

  constructor(code: AuthorizationErrorCode, message: string) {
    super(message);
    this.name = "AuthorizationPolicyError";
    this.code = code;
  }
}

export function isAuthorizationPolicyError(
  error: unknown,
): error is AuthorizationPolicyError {
  return error instanceof AuthorizationPolicyError;
}

export function isDashboardRole(role: unknown): role is AuthorizationRole {
  return role === ADMIN_ROLE || role === USER_ROLE;
}

export function isAuthorizationStatus(
  status: unknown,
): status is AuthorizationStatus {
  return status === ACTIVE_STATUS || status === DISABLED_STATUS;
}

export function isActiveUser(
  user: Pick<AuthorizationSubject, "role" | "status"> | null | undefined,
) {
  return Boolean(
    user && user.status === ACTIVE_STATUS && isDashboardRole(user.role),
  );
}

export function canAccessDashboard(
  user: Pick<AuthorizationSubject, "role" | "status"> | null | undefined,
) {
  return isActiveUser(user);
}

export function canAccessUserManagement(
  user: Pick<AuthorizationSubject, "role" | "status"> | null | undefined,
) {
  return Boolean(isActiveUser(user) && user?.role === ADMIN_ROLE);
}

function sameUser(first: AuthorizationSubject, second: AuthorizationSubject) {
  return String(first.id) === String(second.id);
}

function assertValidSubject(
  user: AuthorizationSubject | null | undefined,
  code: AuthorizationErrorCode = "INVALID_TARGET",
): asserts user is AuthorizationSubject {
  if (
    !user ||
    (typeof user.id !== "bigint" && typeof user.id !== "string") ||
    String(user.id).trim() === "" ||
    !isDashboardRole(user.role) ||
    !isAuthorizationStatus(user.status)
  ) {
    throw new AuthorizationPolicyError(code, "User authorization state is invalid.");
  }
}

export function assertActiveUser(
  user: AuthorizationSubject | null | undefined,
): asserts user is AuthorizationSubject {
  if (!user) {
    throw new AuthorizationPolicyError(
      "UNAUTHENTICATED",
      "Authentication is required.",
    );
  }

  assertValidSubject(user, "INVALID_SESSION");
  if (user.status !== ACTIVE_STATUS) {
    throw new AuthorizationPolicyError(
      "ACCOUNT_DISABLED",
      "The account is not available.",
    );
  }
}

export function assertAdminUser(
  user: AuthorizationSubject | null | undefined,
): asserts user is AuthorizationSubject {
  assertActiveUser(user);
  if (user.role !== ADMIN_ROLE) {
    throw new AuthorizationPolicyError(
      "FORBIDDEN",
      "Administrator access is required.",
    );
  }
}

function assertAdminCount(activeAdminCount: number) {
  if (
    !Number.isInteger(activeAdminCount) ||
    activeAdminCount < 0
  ) {
    throw new AuthorizationPolicyError(
      "INVALID_POLICY_INPUT",
      "Authorization invariant input is invalid.",
    );
  }
}

export type LastAdminOperation = "CHANGE_ROLE_TO_USER" | "DISABLE_USER";

export function assertLastAdminSafe(
  target: AuthorizationSubject,
  operation: LastAdminOperation,
  activeAdminCount: number,
) {
  assertValidSubject(target);
  assertAdminCount(activeAdminCount);
  if (operation !== "CHANGE_ROLE_TO_USER" && operation !== "DISABLE_USER") {
    throw new AuthorizationPolicyError(
      "INVALID_TRANSITION",
      "The requested administrator transition is invalid.",
    );
  }

  const removesActiveAdmin =
    target.status === ACTIVE_STATUS &&
    target.role === ADMIN_ROLE &&
    (operation === "CHANGE_ROLE_TO_USER" || operation === "DISABLE_USER");

  if (removesActiveAdmin && activeAdminCount <= 1) {
    throw new AuthorizationPolicyError(
      "LAST_ADMIN",
      "The last active administrator cannot be removed.",
    );
  }
}

export function assertCanChangeRole(
  actor: AuthorizationSubject,
  target: AuthorizationSubject,
  nextRole: AuthorizationRole,
  activeAdminCount: number,
) {
  assertAdminUser(actor);
  assertValidSubject(target);
  if (!isDashboardRole(nextRole)) {
    throw new AuthorizationPolicyError(
      "INVALID_TRANSITION",
      "The requested role transition is invalid.",
    );
  }
  if (sameUser(actor, target)) {
    throw new AuthorizationPolicyError(
      "SELF_ROLE_CHANGE",
      "Changing your own role is not permitted.",
    );
  }
  if (nextRole === USER_ROLE) {
    assertLastAdminSafe(target, "CHANGE_ROLE_TO_USER", activeAdminCount);
  }
}

export function assertCanChangeStatus(
  actor: AuthorizationSubject,
  target: AuthorizationSubject,
  nextStatus: AuthorizationStatus,
  activeAdminCount: number,
) {
  assertAdminUser(actor);
  assertValidSubject(target);
  if (!isAuthorizationStatus(nextStatus)) {
    throw new AuthorizationPolicyError(
      "INVALID_TRANSITION",
      "The requested status transition is invalid.",
    );
  }
  if (nextStatus === DISABLED_STATUS && sameUser(actor, target)) {
    throw new AuthorizationPolicyError(
      "SELF_DISABLE",
      "Disabling your own account is not permitted.",
    );
  }
  if (nextStatus === DISABLED_STATUS) {
    assertLastAdminSafe(target, "DISABLE_USER", activeAdminCount);
  }
}

export type UserManagementAction =
  | "CHANGE_ROLE"
  | "DISABLE_USER"
  | "ENABLE_USER";

export function assertCanManageUser(
  actor: AuthorizationSubject,
  target: AuthorizationSubject,
  action: UserManagementAction,
  options: {
    activeAdminCount: number;
    nextRole?: AuthorizationRole;
  },
) {
  if (
    action !== "CHANGE_ROLE" &&
    action !== "DISABLE_USER" &&
    action !== "ENABLE_USER"
  ) {
    throw new AuthorizationPolicyError(
      "INVALID_TRANSITION",
      "The requested user-management action is invalid.",
    );
  }
  if (action === "CHANGE_ROLE") {
    if (!options.nextRole) {
      throw new AuthorizationPolicyError(
        "INVALID_POLICY_INPUT",
        "A target role is required.",
      );
    }
    assertCanChangeRole(
      actor,
      target,
      options.nextRole,
      options.activeAdminCount,
    );
    return;
  }

  assertCanChangeStatus(
    actor,
    target,
    action === "DISABLE_USER" ? DISABLED_STATUS : ACTIVE_STATUS,
    options.activeAdminCount,
  );
}

export function securityVersionUpdate(now = new Date()) {
  if (Number.isNaN(now.getTime())) {
    throw new AuthorizationPolicyError(
      "INVALID_POLICY_INPUT",
      "Security version timestamp is invalid.",
    );
  }
  return { updatedAt: now };
}
