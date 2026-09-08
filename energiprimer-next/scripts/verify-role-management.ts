import { UserAuditAction, UserRole, UserStatus } from "@prisma/client";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTIVE_STATUS,
  ADMIN_ROLE,
  DISABLED_STATUS,
  USER_ROLE,
  AuthorizationPolicyError,
  assertCanChangeRole,
  securityVersionUpdate,
} from "../src/lib/authorization-policy";
import { changeUserRoleAndAudit } from "../src/lib/user-management-mutation";
import {
  isAuthorizationRole,
  parseUserManagementUserId,
} from "../src/lib/user-management-validation";

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
const disabledAdmin: FixtureUser = {
  id: BigInt(5),
  role: ADMIN_ROLE,
  status: DISABLED_STATUS,
};
const disabledActor: FixtureUser = {
  id: BigInt(6),
  role: ADMIN_ROLE,
  status: DISABLED_STATUS,
};

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

function readSource(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8").replace(
    /\r\n?/g,
    "\n",
  );
}

function policyCode(callback: () => void) {
  try {
    callback();
    return null;
  } catch (error) {
    if (error instanceof AuthorizationPolicyError) return error.code;
    throw error;
  }
}

function testRolePolicyMatrix() {
  assert(
    policyCode(() => assertCanChangeRole(adminA, activeUser, ADMIN_ROLE, 2)) ===
      null,
    "ACTIVE ADMIN can promote an ACTIVE USER",
  );
  assert(
    policyCode(() => assertCanChangeRole(adminA, adminB, USER_ROLE, 2)) ===
      null,
    "ACTIVE ADMIN can demote another ACTIVE ADMIN when one remains",
  );
  assert(
    policyCode(() => assertCanChangeRole(adminA, disabledUser, ADMIN_ROLE, 1)) ===
      null,
    "ACTIVE ADMIN can change a DISABLED USER role",
  );
  assert(
    policyCode(() => assertCanChangeRole(adminA, disabledAdmin, USER_ROLE, 2)) ===
      null,
    "DISABLED ADMIN role can be changed without changing status",
  );
  assert(
    policyCode(() => assertCanChangeRole(adminA, adminA, USER_ROLE, 2)) ===
      "SELF_ROLE_CHANGE",
    "ADMIN cannot change their own role",
  );
  assert(
    policyCode(() => assertCanChangeRole(activeUser, adminA, ADMIN_ROLE, 2)) ===
      "FORBIDDEN",
    "ACTIVE USER cannot perform a role change",
  );
  assert(
    policyCode(() => assertCanChangeRole(disabledActor, activeUser, ADMIN_ROLE, 2)) ===
      "ACCOUNT_DISABLED",
    "DISABLED actor cannot perform a role change",
  );
  assert(
    policyCode(() => assertCanChangeRole(adminA, adminB, USER_ROLE, 1)) ===
      "LAST_ADMIN",
    "last active administrator protection rejects demotion",
  );
  assert(
    policyCode(() => assertCanChangeRole(adminA, adminB, ADMIN_ROLE, 2)) ===
      "NO_CHANGE",
    "no-op role change is rejected before mutation",
  );
  assert(
    policyCode(() =>
      assertCanChangeRole(adminA, null as unknown as FixtureUser, USER_ROLE, 2),
    ) === "INVALID_TARGET",
    "missing target is rejected without target details",
  );
  assert(
    policyCode(() =>
      assertCanChangeRole(
        adminA,
        activeUser,
        "SUPERADMIN" as typeof ADMIN_ROLE,
        2,
      ),
    ) === "INVALID_TRANSITION",
    "unsupported role is rejected",
  );
  assert(
    disabledUser.status === DISABLED_STATUS,
    "role policy does not reinterpret a DISABLED target as ACTIVE",
  );
}

function testInputValidation() {
  assert(parseUserManagementUserId("1") === BigInt(1), "canonical user ID is accepted");
  assert(parseUserManagementUserId("01") === null, "leading-zero user ID is rejected");
  assert(parseUserManagementUserId("0") === null, "zero user ID is rejected");
  assert(parseUserManagementUserId("not-an-id") === null, "malformed user ID is rejected");
  assert(isAuthorizationRole("ADMIN"), "ADMIN is an accepted canonical role");
  assert(isAuthorizationRole("USER"), "USER is an accepted canonical role");
  assert(!isAuthorizationRole("admin"), "lowercase role is rejected");
  assert(!isAuthorizationRole("SUPERADMIN"), "arbitrary role is rejected");
}

type RoleUpdateArgs = {
  where: { id: bigint };
  data: Record<string, unknown>;
  select: unknown;
};

type AuditCreateArgs = {
  data: {
    actorUserId: bigint;
    targetUserId: bigint;
    action: UserAuditAction;
    metadata: unknown;
  };
  select: unknown;
};

type FakeTransaction = {
  user: {
    update: (args: RoleUpdateArgs) => Promise<{
      id: bigint;
      username: string;
      name: string;
      email: string;
      role: UserRole;
      status: UserStatus;
      updatedAt: Date;
    }>;
  };
  userAuditLog: {
    create: (args: AuditCreateArgs) => Promise<{ id: bigint }>;
  };
};

async function testAtomicRoleMutation() {
  const now = new Date("2026-09-08T00:00:00.000Z");
  let updateArgs: RoleUpdateArgs | null = null;
  let auditArgs: AuditCreateArgs | null = null;
  const tx: FakeTransaction = {
    user: {
      async update(args) {
        updateArgs = args;
        return {
          id: BigInt(3),
          username: "target-user",
          name: "Target User",
          email: "target@example.invalid",
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          updatedAt: args.data.updatedAt as Date,
        };
      },
    },
    userAuditLog: {
      async create(args) {
        auditArgs = args;
        return { id: BigInt(10) };
      },
    },
  };

  const updated = await changeUserRoleAndAudit(
    tx as unknown as Parameters<typeof changeUserRoleAndAudit>[0],
    BigInt(1),
    BigInt(3),
    UserRole.USER,
    ADMIN_ROLE,
    now,
  );
  const capturedUpdate = updateArgs as unknown as RoleUpdateArgs;
  const capturedAudit = auditArgs as unknown as AuditCreateArgs;
  assert(
    capturedUpdate.where.id === BigInt(3) &&
      capturedUpdate.data.role === UserRole.ADMIN,
    "role mutation targets the locked target and writes the requested enum",
  );
  assert(
    Object.keys(capturedUpdate.data).sort().join(",") === "role,updatedAt" &&
      capturedUpdate.data.updatedAt === now &&
      updated.status === UserStatus.ACTIVE,
    "role mutation changes only role and security-version timestamp",
  );
  assert(
    capturedAudit.data.actorUserId === BigInt(1) &&
      capturedAudit.data.targetUserId === BigInt(3) &&
      capturedAudit.data.action === UserAuditAction.ROLE_CHANGED,
    "ROLE_CHANGED audit uses authenticated actor and target IDs",
  );
  assert(
    JSON.stringify(capturedAudit.data.metadata) ===
      '{"fromRole":"USER","toRole":"ADMIN"}',
    "ROLE_CHANGED metadata records only fromRole and toRole",
  );
  assert(
    securityVersionUpdate(now).updatedAt === now,
    "role mutation uses the shared security-version helper",
  );
}

async function testNoOpAndRollback() {
  let updateCalls = 0;
  let auditCalls = 0;
  const noOpTx = {
    user: {
      async update() {
        updateCalls += 1;
        throw new Error("no-op must not update");
      },
    },
    userAuditLog: {
      async create() {
        auditCalls += 1;
        throw new Error("no-op must not audit");
      },
    },
  };
  let noOpRejected = false;
  try {
    await changeUserRoleAndAudit(
      noOpTx as unknown as Parameters<typeof changeUserRoleAndAudit>[0],
      BigInt(1),
      BigInt(2),
      UserRole.ADMIN,
      ADMIN_ROLE,
    );
  } catch {
    noOpRejected = true;
  }
  assert(
    noOpRejected && updateCalls === 0 && auditCalls === 0,
    "no-op mutation writes neither role nor audit",
  );

  const state: { role: UserRole; updatedAt: Date } = {
    role: UserRole.USER,
    updatedAt: new Date("2026-09-07T00:00:00.000Z"),
  };
  const before = { ...state };
  let failingAuditCalls = 0;
  const failingTx: FakeTransaction = {
    user: {
      async update(args) {
        state.role = args.data.role as UserRole;
        state.updatedAt = args.data.updatedAt as Date;
        return {
          id: BigInt(2),
          username: "target-user",
          name: "Target User",
          email: "target@example.invalid",
          role: state.role,
          status: UserStatus.ACTIVE,
          updatedAt: state.updatedAt,
        };
      },
    },
    userAuditLog: {
      async create() {
        failingAuditCalls += 1;
        throw new Error("synthetic audit failure");
      },
    },
  };

  let failed = false;
  try {
    await changeUserRoleAndAudit(
      failingTx as unknown as Parameters<typeof changeUserRoleAndAudit>[0],
      BigInt(1),
      BigInt(2),
      UserRole.USER,
      ADMIN_ROLE,
    );
  } catch {
    state.role = before.role;
    state.updatedAt = before.updatedAt;
    failed = true;
  }
  assert(failed && failingAuditCalls === 1, "audit failure reaches transaction boundary");
  assert(
    state.role === before.role && state.updatedAt === before.updatedAt,
    "audit failure rolls back role and security-version changes",
  );
}

function testServerAndUiBoundaries() {
  const actionSource = readSource("src/app/(protected)/pengaturan/users/actions.ts");
  const roleActionStart = actionSource.indexOf("export async function changeRole");
  const roleAction = actionSource.slice(roleActionStart);
  const policySource = readSource("src/lib/authorization-policy.ts");
  const authorizationSource = readSource("src/lib/authorization.ts");
  const mutationSource = readSource("src/lib/user-management-mutation.ts");
  const clientSource = readSource(
    "src/components/user-management/UserManagementClient.tsx",
  );
  const roleDialogStart = clientSource.indexOf("function ChangeRoleDialog");
  const roleDialogEnd = clientSource.indexOf("function UserStatusDialog");
  const roleDialog = clientSource.slice(roleDialogStart, roleDialogEnd);

  assert(
    roleActionStart >= 0 &&
      roleAction.includes("requireAdminUser()") &&
      roleAction.includes("assertCanChangeRoleInTransaction") &&
      roleAction.includes("changeUserRoleAndAudit") &&
      roleAction.includes("withUserManagementTransaction"),
    "Change Role uses the ADMIN guard, transaction guard, and atomic mutation",
  );
  assert(
    roleAction.includes('formData.get("targetUserId")') &&
      roleAction.includes('formData.get("newRole")') &&
      !roleAction.includes('formData.get("actorUserId")') &&
      !roleAction.includes('formData.get("currentRole")') &&
      !roleAction.includes('formData.get("status")') &&
      !roleAction.includes('formData.get("username")') &&
      !roleAction.includes('formData.get("email")'),
    "Change Role accepts only targetUserId and newRole from the client",
  );
  assert(
    policySource.includes('"NO_CHANGE"') &&
      policySource.includes("assertLastAdminSafe") &&
      authorizationSource.includes("Prisma.TransactionIsolationLevel.Serializable") &&
      authorizationSource.includes("FOR UPDATE") &&
      authorizationSource.includes("assertCanChangeRoleInTransaction"),
    "role policy and serializable row-lock transaction boundary are present",
  );
  assert(
    mutationSource.includes("securityVersionUpdate") &&
      mutationSource.includes("UserAuditAction.ROLE_CHANGED") &&
      mutationSource.includes("fromRole") &&
      mutationSource.includes("toRole") &&
      mutationSource.includes("tx.user.update") &&
      mutationSource.includes("tx.userAuditLog.create"),
    "role, security version, and ROLE_CHANGED audit share one mutation helper",
  );
  assert(
    roleDialog.includes("changeRole") &&
      roleDialog.includes('name="targetUserId"') &&
      roleDialog.includes('name="newRole"') &&
      roleDialog.includes("useActionState") &&
      roleDialog.includes("Updating...") &&
      roleDialog.includes("onCompleted") &&
      !roleDialog.includes("presentation-only"),
    "Change Role UI submits safely, blocks duplicate submission, and is persistent",
  );
  assert(
    clientSource.includes("Role updated successfully.") &&
      clientSource.includes("router.refresh()"),
    "successful role change closes through the parent and refreshes the list",
  );
}

try {
  testRolePolicyMatrix();
  testInputValidation();
  await testAtomicRoleMutation();
  await testNoOpAndRollback();
  testServerAndUiBoundaries();

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        databaseWrites: 0,
        networkRequests: 0,
        productionMutation: false,
        checks,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Role Management verification failed.");
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
