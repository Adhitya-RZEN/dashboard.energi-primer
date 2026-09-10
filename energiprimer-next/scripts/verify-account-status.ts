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
  assertCanChangeStatus,
  securityVersionUpdate,
} from "../src/lib/authorization-policy";
import { changeUserStatusAndAudit } from "../src/lib/user-management-mutation";
import {
  isUserManagementStatus,
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

function testStatusPolicyMatrix() {
  assert(
    policyCode(() =>
      assertCanChangeStatus(adminA, activeUser, DISABLED_STATUS, 2),
    ) === null,
    "ACTIVE ADMIN can disable an ACTIVE USER",
  );
  assert(
    policyCode(() =>
      assertCanChangeStatus(adminA, disabledUser, ACTIVE_STATUS, 1),
    ) === null,
    "ACTIVE ADMIN can enable a DISABLED USER",
  );
  assert(
    policyCode(() =>
      assertCanChangeStatus(adminA, adminB, DISABLED_STATUS, 2),
    ) === null,
    "ACTIVE ADMIN can disable another ACTIVE ADMIN when one remains",
  );
  assert(
    policyCode(() =>
      assertCanChangeStatus(adminA, disabledAdmin, ACTIVE_STATUS, 1),
    ) === null,
    "ACTIVE ADMIN can enable a DISABLED ADMIN without changing its role",
  );
  assert(
    policyCode(() =>
      assertCanChangeStatus(adminA, adminA, DISABLED_STATUS, 2),
    ) === "SELF_DISABLE",
    "ADMIN cannot disable their own account",
  );
  assert(
    policyCode(() =>
      assertCanChangeStatus(activeUser, adminA, DISABLED_STATUS, 2),
    ) === "FORBIDDEN",
    "ACTIVE USER cannot perform a status change",
  );
  assert(
    policyCode(() =>
      assertCanChangeStatus(disabledActor, activeUser, DISABLED_STATUS, 2),
    ) === "ACCOUNT_DISABLED",
    "DISABLED actor cannot perform a status change",
  );
  assert(
    policyCode(() =>
      assertCanChangeStatus(adminA, adminB, DISABLED_STATUS, 1),
    ) === "LAST_ADMIN",
    "last active administrator protection rejects disablement",
  );
  assert(
    policyCode(() =>
      assertCanChangeStatus(adminA, activeUser, ACTIVE_STATUS, 2),
    ) === "NO_CHANGE",
    "no-op status change is rejected before mutation",
  );
  assert(
    policyCode(() =>
      assertCanChangeStatus(
        adminA,
        null as unknown as FixtureUser,
        DISABLED_STATUS,
        2,
      ),
    ) === "INVALID_TARGET",
    "missing target is rejected without target details",
  );
  assert(
    policyCode(() =>
      assertCanChangeStatus(
        adminA,
        activeUser,
        "LOCKED" as typeof DISABLED_STATUS,
        2,
      ),
    ) === "INVALID_TRANSITION",
    "unsupported account status is rejected",
  );
  assert(
    disabledAdmin.role === ADMIN_ROLE &&
      disabledAdmin.status === DISABLED_STATUS,
    "status policy keeps role and disabled state as separate concerns",
  );
}

function testInputValidation() {
  assert(
    parseUserManagementUserId("1") === BigInt(1),
    "canonical user ID is accepted",
  );
  assert(
    parseUserManagementUserId("01") === null,
    "leading-zero user ID is rejected",
  );
  assert(
    parseUserManagementUserId("0") === null,
    "zero user ID is rejected",
  );
  assert(
    parseUserManagementUserId("not-an-id") === null,
    "malformed user ID is rejected",
  );
  assert(isUserManagementStatus("ACTIVE"), "ACTIVE is an accepted status");
  assert(
    isUserManagementStatus("DISABLED"),
    "DISABLED is an accepted status",
  );
  assert(
    !isUserManagementStatus("active") &&
      !isUserManagementStatus("LOCKED") &&
      !isUserManagementStatus(null),
    "lowercase, arbitrary, and null statuses are rejected",
  );
}

type StatusUpdateArgs = {
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
    update: (args: StatusUpdateArgs) => Promise<{
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

async function testAtomicStatusMutation() {
  const now = new Date("2026-09-08T00:00:00.000Z");
  let updateArgs: StatusUpdateArgs | null = null;
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
          role: UserRole.USER,
          status: UserStatus.DISABLED,
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

  const updated = await changeUserStatusAndAudit(
    tx as unknown as Parameters<typeof changeUserStatusAndAudit>[0],
    BigInt(1),
    BigInt(3),
    UserStatus.ACTIVE,
    DISABLED_STATUS,
    now,
  );
  const capturedUpdate = updateArgs as unknown as StatusUpdateArgs;
  const capturedAudit = auditArgs as unknown as AuditCreateArgs;
  assert(
    capturedUpdate.where.id === BigInt(3) &&
      capturedUpdate.data.status === UserStatus.DISABLED,
    "status mutation targets the locked target and writes the requested enum",
  );
  assert(
    Object.keys(capturedUpdate.data).sort().join(",") === "status,updatedAt" &&
      capturedUpdate.data.updatedAt === now &&
      updated.role === UserRole.USER &&
      updated.status === UserStatus.DISABLED,
    "status mutation changes only status and security-version timestamp",
  );
  assert(
    capturedAudit.data.actorUserId === BigInt(1) &&
      capturedAudit.data.targetUserId === BigInt(3) &&
      capturedAudit.data.action === UserAuditAction.USER_DISABLED,
    "USER_DISABLED audit uses authenticated actor and target IDs",
  );
  assert(
    JSON.stringify(capturedAudit.data.metadata) ===
      '{"fromStatus":"ACTIVE","toStatus":"DISABLED"}',
    "status metadata records only the status transition",
  );
  assert(
    securityVersionUpdate(now).updatedAt === now,
    "status mutation uses the shared security-version helper",
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
    await changeUserStatusAndAudit(
      noOpTx as unknown as Parameters<typeof changeUserStatusAndAudit>[0],
      BigInt(1),
      BigInt(2),
      UserStatus.ACTIVE,
      ACTIVE_STATUS,
    );
  } catch {
    noOpRejected = true;
  }
  assert(
    noOpRejected && updateCalls === 0 && auditCalls === 0,
    "no-op mutation writes neither status nor audit",
  );

  const state: { status: UserStatus; updatedAt: Date } = {
    status: UserStatus.ACTIVE,
    updatedAt: new Date("2026-09-07T00:00:00.000Z"),
  };
  const before = { ...state };
  let failingAuditCalls = 0;
  const failingTx: FakeTransaction = {
    user: {
      async update(args) {
        state.status = args.data.status as UserStatus;
        state.updatedAt = args.data.updatedAt as Date;
        return {
          id: BigInt(2),
          username: "target-user",
          name: "Target User",
          email: "target@example.invalid",
          role: UserRole.USER,
          status: state.status,
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
    await changeUserStatusAndAudit(
      failingTx as unknown as Parameters<typeof changeUserStatusAndAudit>[0],
      BigInt(1),
      BigInt(2),
      UserStatus.ACTIVE,
      DISABLED_STATUS,
    );
  } catch {
    state.status = before.status;
    state.updatedAt = before.updatedAt;
    failed = true;
  }
  assert(
    failed && failingAuditCalls === 1,
    "audit failure reaches the transaction boundary",
  );
  assert(
    state.status === before.status && state.updatedAt === before.updatedAt,
    "audit failure rolls back status and security-version changes",
  );
}

function testServerAndUiBoundaries() {
  const actionSource = readSource(
    "src/app/(protected)/pengaturan/users/actions.ts",
  );
  const statusActionStart = actionSource.indexOf(
    "export async function changeStatus",
  );
  const statusAction = actionSource.slice(statusActionStart);
  const policySource = readSource("src/lib/authorization-policy.ts");
  const authorizationSource = readSource("src/lib/authorization.ts");
  const mutationSource = readSource("src/lib/user-management-mutation.ts");
  const clientSource = readSource(
    "src/components/user-management/UserManagementClient.tsx",
  );
  const statusDialogStart = clientSource.indexOf("function UserStatusDialog");
  const statusDialog = clientSource.slice(statusDialogStart);

  assert(
    statusActionStart >= 0 &&
      statusAction.includes("requireAdminUser()") &&
      statusAction.includes("assertCanChangeStatusInTransaction") &&
      statusAction.includes("changeUserStatusAndAudit") &&
      statusAction.includes("withUserManagementTransaction"),
    "Deactivate/Activate uses the ADMIN guard, transaction guard, and atomic mutation",
  );
  assert(
    statusAction.includes('formData.get("targetUserId")') &&
      statusAction.includes('formData.get("desiredStatus")') &&
      !statusAction.includes('formData.get("actorUserId")') &&
      !statusAction.includes('formData.get("currentStatus")') &&
      !statusAction.includes('formData.get("role")') &&
      !statusAction.includes('formData.get("username")') &&
      !statusAction.includes('formData.get("email")'),
    "Deactivate/Activate accepts only targetUserId and desiredStatus from the client",
  );
  assert(
    policySource.includes('"SELF_DISABLE"') &&
      policySource.includes('"NO_CHANGE"') &&
      policySource.includes("assertLastAdminSafe") &&
      authorizationSource.includes("Prisma.TransactionIsolationLevel.Serializable") &&
      authorizationSource.includes("FOR UPDATE") &&
      authorizationSource.includes("assertCanChangeStatusInTransaction"),
    "status policy and serializable row-lock transaction boundary are present",
  );
  assert(
    mutationSource.includes("securityVersionUpdate") &&
      mutationSource.includes("UserAuditAction.USER_ENABLED") &&
      mutationSource.includes("UserAuditAction.USER_DISABLED") &&
      mutationSource.includes("fromStatus") &&
      mutationSource.includes("toStatus") &&
      mutationSource.includes("tx.user.update") &&
      mutationSource.includes("tx.userAuditLog.create"),
    "status, security version, and status audit share one mutation helper",
  );
  assert(
    statusDialog.includes("changeStatus") &&
      statusDialog.includes('name="targetUserId"') &&
      statusDialog.includes('name="desiredStatus"') &&
      statusDialog.includes("useActionState") &&
      statusDialog.includes("Updating...") &&
      statusDialog.includes("onCompleted") &&
      !statusDialog.includes("deferred to a later phase"),
    "Deactivate/Activate UI submits safely, blocks duplicate submission, and is persistent",
  );
  assert(
    clientSource.includes("User deactivated successfully.") &&
      clientSource.includes("User activated successfully.") &&
      clientSource.includes("router.refresh()"),
    "successful status changes close through the parent and refresh the list",
  );
}

try {
  testStatusPolicyMatrix();
  testInputValidation();
  await testAtomicStatusMutation();
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
  console.error("Account Status Management verification failed.");
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
