import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTIVE_STATUS,
  ADMIN_ROLE,
  DISABLED_STATUS,
  USER_ROLE,
  AuthorizationPolicyError,
  assertActiveUser,
  assertCanChangeRole,
  assertCanChangeStatus,
  canAccessDashboard,
  canAccessUserManagement,
  securityVersionUpdate,
} from "../src/lib/authorization-policy";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checks: string[] = [];

type FixtureUser = {
  id: bigint;
  role: typeof ADMIN_ROLE | typeof USER_ROLE;
  status: typeof ACTIVE_STATUS | typeof DISABLED_STATUS;
};

const adminA: FixtureUser = {
  id: BigInt(1),
  role: ADMIN_ROLE,
  status: ACTIVE_STATUS,
};
const adminB: FixtureUser = {
  id: BigInt(2),
  role: ADMIN_ROLE,
  status: ACTIVE_STATUS,
};
const activeUser: FixtureUser = {
  id: BigInt(3),
  role: USER_ROLE,
  status: ACTIVE_STATUS,
};
const disabledUser: FixtureUser = {
  id: BigInt(4),
  role: USER_ROLE,
  status: DISABLED_STATUS,
};

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

function expectPolicyError(
  callback: () => void,
  code: AuthorizationPolicyError["code"],
  message: string,
) {
  try {
    callback();
  } catch (error) {
    assert(
      error instanceof AuthorizationPolicyError && error.code === code,
      message,
    );
    return;
  }
  throw new Error(message);
}

function readSource(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8").replace(
    /\r\n?/g,
    "\n",
  );
}

function testAccessModel() {
  assert(!canAccessDashboard(null), "guest cannot access dashboard");
  assert(canAccessDashboard(activeUser), "active USER can access dashboard");
  assert(canAccessDashboard(adminA), "active ADMIN can access dashboard");
  assert(!canAccessDashboard(disabledUser), "DISABLED user cannot access dashboard");
  assert(canAccessUserManagement(adminA), "active ADMIN can access user management policy");
  assert(!canAccessUserManagement(activeUser), "active USER cannot access user management policy");
  assert(!canAccessUserManagement(disabledUser), "DISABLED user cannot access user management policy");
}

function testActiveBoundary() {
  expectPolicyError(
    () => assertActiveUser(disabledUser),
    "ACCOUNT_DISABLED",
    "DISABLED account fails active-session policy",
  );
}

function testTransitionGuards() {
  assertCanChangeRole(adminA, activeUser, ADMIN_ROLE, 1);
  assertCanChangeRole(adminA, adminB, USER_ROLE, 2);
  assertCanChangeStatus(adminA, activeUser, DISABLED_STATUS, 2);
  assertCanChangeStatus(adminA, disabledUser, ACTIVE_STATUS, 1);
  checks.push("valid ADMIN transitions are allowed");

  expectPolicyError(
    () => assertCanChangeRole(adminA, adminA, USER_ROLE, 2),
    "SELF_ROLE_CHANGE",
    "ADMIN cannot change own role",
  );
  expectPolicyError(
    () => assertCanChangeStatus(adminA, adminA, DISABLED_STATUS, 2),
    "SELF_DISABLE",
    "ADMIN cannot disable self",
  );
  expectPolicyError(
    () => assertCanChangeRole(adminA, adminA, USER_ROLE, 1),
    "SELF_ROLE_CHANGE",
    "self role change remains denied for the last ADMIN",
  );
  expectPolicyError(
    () => assertCanChangeRole(adminA, adminB, USER_ROLE, 1),
    "LAST_ADMIN",
    "last ADMIN cannot transition to USER",
  );
  expectPolicyError(
    () => assertCanChangeStatus(adminA, adminA, DISABLED_STATUS, 1),
    "SELF_DISABLE",
    "last ADMIN cannot disable self",
  );
  expectPolicyError(
    () => assertCanChangeStatus(adminA, adminB, DISABLED_STATUS, 1),
    "LAST_ADMIN",
    "last ADMIN cannot be disabled by another actor",
  );
  expectPolicyError(
    () => assertCanChangeRole(activeUser, adminA, USER_ROLE, 2),
    "FORBIDDEN",
    "USER cannot invoke administrator transition policy",
  );
}

function testSessionVersionPrimitive() {
  const now = new Date("2026-09-08T00:00:00.000Z");
  assert(
    securityVersionUpdate(now).updatedAt === now,
    "security-sensitive updates return the updatedAt session-version field",
  );
}

function testServerIntegration() {
  const authSource = readSource("src/auth.ts");
  const proxySource = readSource("src/proxy.ts");
  const layoutSource = readSource("src/app/(protected)/layout.tsx");
  const authorizationSource = readSource("src/lib/authorization.ts");

  assert(
    authSource.includes("role: { in: [UserRole.ADMIN, UserRole.USER] }") &&
      authSource.includes("status: UserStatus.ACTIVE"),
    "Credentials login accepts only ACTIVE ADMIN or USER accounts",
  );
  assert(
    authSource.includes("currentUser.status !== UserStatus.ACTIVE") &&
      authSource.includes("currentUser.role !== tokenRole") &&
      authSource.includes("currentVersion !== tokenVersion"),
    "JWT session revalidation rejects disabled, role-mismatched, and stale sessions",
  );
  assert(
    proxySource.includes("isDashboardRole(request.auth?.user?.role)"),
    "proxy allows both supported active dashboard roles and rejects other sessions",
  );
  assert(
    layoutSource.includes("requireDashboardUser") &&
      layoutSource.includes("isAuthorizationPolicyError"),
    "protected layout uses the reusable active dashboard policy",
  );
  assert(
    authorizationSource.includes("Prisma.TransactionIsolationLevel.Serializable") &&
      authorizationSource.includes("FOR UPDATE") &&
      authorizationSource.includes("assertCanChangeRoleInTransaction") &&
      authorizationSource.includes("assertCanChangeStatusInTransaction"),
    "future user mutations have a serializable row-locking authorization path",
  );
}

try {
  testAccessModel();
  testActiveBoundary();
  testTransitionGuards();
  testSessionVersionPrimitive();
  testServerIntegration();

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        databaseWrites: 0,
        networkRequests: 0,
        checks,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Authorization security verification failed.");
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
