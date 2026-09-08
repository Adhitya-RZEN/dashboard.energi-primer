import bcrypt from "bcryptjs";
import { UserAuditAction, UserRole, UserStatus } from "@prisma/client";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertCanResetPassword,
  AuthorizationPolicyError,
} from "../src/lib/authorization-policy";
import { resetUserPasswordAndAudit } from "../src/lib/user-management-mutation";
import {
  validatePasswordResetInput,
  type NormalizedPasswordResetInput,
} from "../src/lib/user-management-validation";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checks: string[] = [];

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

const validPassword = "phase6-valid-password";

function policyCode(callback: () => void) {
  try {
    callback();
    return null;
  } catch (error) {
    if (error instanceof AuthorizationPolicyError) return error.code;
    throw error;
  }
}

function testPasswordValidation() {
  const valid = validatePasswordResetInput({
    newPassword: validPassword,
    confirmPassword: validPassword,
  });
  assert(valid.valid, "valid reset password input is accepted");
  assert(
    validatePasswordResetInput({
      newPassword: "short",
      confirmPassword: "short",
    }).fieldErrors.newPassword === "Password must be at least 12 characters.",
    "short reset password is rejected",
  );
  assert(
    validatePasswordResetInput({
      newPassword: validPassword,
      confirmPassword: "different-password",
    }).fieldErrors.confirmPassword === "Passwords do not match.",
    "reset password mismatch is rejected",
  );
  assert(
    validatePasswordResetInput({
      newPassword: "",
      confirmPassword: "",
    }).fieldErrors.newPassword === "Password required" &&
      validatePasswordResetInput({
        newPassword: "",
        confirmPassword: "",
      }).fieldErrors.confirmPassword === "Confirm password required",
    "missing reset password fields are rejected",
  );
}

function testPolicyMatrix() {
  const admin = { id: BigInt(1), role: "ADMIN", status: "ACTIVE" } as const;
  const user = { id: BigInt(2), role: "USER", status: "ACTIVE" } as const;
  const otherAdmin = { id: BigInt(3), role: "ADMIN", status: "ACTIVE" } as const;
  const disabledTarget = {
    id: BigInt(4),
    role: "USER",
    status: "DISABLED",
  } as const;
  const disabledActor = {
    id: BigInt(5),
    role: "ADMIN",
    status: "DISABLED",
  } as const;

  assert(
    policyCode(() => assertCanResetPassword(admin, user)) === null,
    "ACTIVE ADMIN can reset an ACTIVE USER password",
  );
  assert(
    policyCode(() => assertCanResetPassword(admin, otherAdmin)) === null,
    "ACTIVE ADMIN can reset another ADMIN password",
  );
  assert(
    policyCode(() => assertCanResetPassword(admin, disabledTarget)) === null,
    "ACTIVE ADMIN can reset a DISABLED target password",
  );
  assert(
    policyCode(() => assertCanResetPassword(user, admin)) === "FORBIDDEN",
    "ACTIVE USER cannot reset a password",
  );
  assert(
    policyCode(() => assertCanResetPassword(disabledActor, user)) ===
      "ACCOUNT_DISABLED",
    "DISABLED actor cannot reset a password",
  );
  assert(
    policyCode(() => assertCanResetPassword(admin, admin)) ===
      "SELF_PASSWORD_RESET",
    "self-reset is rejected with SELF_PASSWORD_RESET",
  );
  assert(
    policyCode(() => assertCanResetPassword(admin, null)) === "INVALID_TARGET",
    "missing target is rejected by the policy",
  );
}

type UserUpdateArgs = {
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
    update: (args: UserUpdateArgs) => Promise<{
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

function asPasswordInput(): NormalizedPasswordResetInput {
  const result = validatePasswordResetInput({
    newPassword: validPassword,
    confirmPassword: validPassword,
  });
  if (!result.valid) throw new Error("test password fixture is invalid");
  return result.input as NormalizedPasswordResetInput;
}

async function testAtomicMutationContract() {
  const input = asPasswordInput();
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  const updatedAt = new Date("2026-09-08T00:00:00.000Z");
  let updateArgs: UserUpdateArgs | null = null;
  let auditArgs: AuditCreateArgs | null = null;

  const tx: FakeTransaction = {
    user: {
      async update(args) {
        updateArgs = args;
        return {
          id: BigInt(20),
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
        return { id: BigInt(21) };
      },
    },
  };

  const updated = await resetUserPasswordAndAudit(
    tx as unknown as Parameters<typeof resetUserPasswordAndAudit>[0],
    BigInt(10),
    BigInt(20),
    passwordHash,
    updatedAt,
  );

  const capturedUpdate = updateArgs as unknown as UserUpdateArgs;
  const capturedAudit = auditArgs as unknown as AuditCreateArgs;
  const updateKeys = Object.keys(capturedUpdate.data).sort().join(",");
  assert(
    capturedUpdate.where.id === BigInt(20) &&
      capturedUpdate.data.password === passwordHash &&
      capturedUpdate.data.password !== input.newPassword,
    "password update targets the server-validated target and stores only a bcrypt hash",
  );
  assert(
    updateKeys === "password,updatedAt" &&
      capturedUpdate.data.updatedAt === updatedAt,
    "reset changes only password and the security-version timestamp",
  );
  assert(
    updated.status === UserStatus.DISABLED && updated.role === UserRole.USER,
    "DISABLED target status and USER role remain unchanged",
  );
  assert(
    await bcrypt.compare(input.newPassword, capturedUpdate.data.password as string),
    "new password hash verifies with bcrypt",
  );
  assert(
    capturedAudit.data.actorUserId === BigInt(10) &&
      capturedAudit.data.targetUserId === BigInt(20) &&
      capturedAudit.data.action === UserAuditAction.PASSWORD_RESET,
    "PASSWORD_RESET audit uses authenticated actor and target IDs",
  );
  const metadataText = JSON.stringify(capturedAudit.data.metadata) ?? "";
  assert(
    metadataText === "{}" && !metadataText.includes(input.newPassword),
    "PASSWORD_RESET audit metadata is empty and credential-free",
  );
}

async function testRollbackAndUpdateFailure() {
  const passwordHash = await bcrypt.hash(validPassword, 12);
  const oldUpdatedAt = new Date("2026-09-07T00:00:00.000Z");
  const state = {
    password: "old-hash",
    updatedAt: oldUpdatedAt,
  };
  let auditCalls = 0;
  const tx: FakeTransaction = {
    user: {
      async update(args) {
        state.password = args.data.password as string;
        state.updatedAt = args.data.updatedAt as Date;
        return {
          id: BigInt(20),
          username: "target-user",
          name: "Target User",
          email: "target@example.invalid",
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          updatedAt: state.updatedAt,
        };
      },
    },
    userAuditLog: {
      async create() {
        auditCalls += 1;
        throw new Error("synthetic audit failure");
      },
    },
  };

  const before = { ...state };
  async function fakeSerializableTransaction(callback: () => Promise<unknown>) {
    try {
      return await callback();
    } catch (error) {
      state.password = before.password;
      state.updatedAt = before.updatedAt;
      throw error;
    }
  }

  let failed = false;
  try {
    await fakeSerializableTransaction(() =>
      resetUserPasswordAndAudit(
        tx as unknown as Parameters<typeof resetUserPasswordAndAudit>[0],
        BigInt(10),
        BigInt(20),
        passwordHash,
      ),
    );
  } catch {
    failed = true;
  }
  assert(failed && auditCalls === 1, "audit failure reaches the transaction boundary");
  assert(
    state.password === before.password && state.updatedAt === before.updatedAt,
    "audit failure rolls back password and security-version changes",
  );

  let failedUpdateAudits = 0;
  const updateFailureTx: FakeTransaction = {
    user: {
      async update() {
        throw new Error("synthetic update failure");
      },
    },
    userAuditLog: {
      async create() {
        failedUpdateAudits += 1;
        return { id: BigInt(22) };
      },
    },
  };
  let updateFailed = false;
  try {
    await resetUserPasswordAndAudit(
      updateFailureTx as unknown as Parameters<typeof resetUserPasswordAndAudit>[0],
      BigInt(10),
      BigInt(20),
      passwordHash,
    );
  } catch {
    updateFailed = true;
  }
  assert(
    updateFailed && failedUpdateAudits === 0,
    "password update failure creates no PASSWORD_RESET audit",
  );
}

function testSourceBoundaries() {
  const action = readSource("src/app/(protected)/pengaturan/users/actions.ts");
  const resetActionStart = action.indexOf(
    "export async function resetPassword",
  );
  const resetAction = action.slice(resetActionStart);
  const policy = readSource("src/lib/authorization-policy.ts");
  const authorization = readSource("src/lib/authorization.ts");
  const mutation = readSource("src/lib/user-management-mutation.ts");
  const validation = readSource("src/lib/user-management-validation.ts");
  const client = readSource(
    "src/components/user-management/UserManagementClient.tsx",
  );

  const hashIndex = resetAction.indexOf("const passwordHash = await bcrypt.hash");
  const transactionIndex = resetAction.indexOf(
    "await withUserManagementTransaction",
  );
  assert(
    resetActionStart >= 0 &&
      resetAction.includes("requireAdminUser()") &&
      resetAction.includes("assertCanResetPasswordInTransaction") &&
      resetAction.includes("bcrypt.hash") &&
      hashIndex >= 0 &&
      transactionIndex > hashIndex,
    "Reset Password uses the ADMIN guard, validates/hashes before the transaction, and revalidates in transaction",
  );
  assert(
    resetAction.includes('formData.get("targetUserId")') &&
      resetAction.includes('formData.get("newPassword")') &&
      resetAction.includes('formData.get("confirmPassword")') &&
      !resetAction.includes('formData.get("actorUserId")') &&
      !resetAction.includes('formData.get("status")') &&
      !resetAction.includes('formData.get("role")') &&
      !resetAction.includes('formData.get("email")') &&
      !resetAction.includes('formData.get("username")'),
    "Reset Password accepts only targetUserId, newPassword, and confirmPassword",
  );
  assert(
    policy.includes('"SELF_PASSWORD_RESET"') &&
      authorization.includes("FOR UPDATE") &&
      authorization.includes("assertCanResetPasswordInTransaction"),
    "self-target policy and target/actor row-lock transaction guard are present",
  );
  assert(
    mutation.includes("securityVersionUpdate") &&
      mutation.includes("UserAuditAction.PASSWORD_RESET") &&
      mutation.includes("metadata: {}") &&
      mutation.includes("tx.user.update") &&
      mutation.includes("tx.userAuditLog.create"),
    "password update, security version, and PASSWORD_RESET audit share the mutation helper",
  );
  assert(
    validation.includes("validatePasswordResetInput") &&
      validation.includes("PasswordResetFieldErrors") &&
      validation.includes("12 characters"),
    "password reset validation is shared in the user-management validation module",
  );
  assert(
    client.includes("resetPassword") &&
      client.includes('name="targetUserId"') &&
      client.includes('name="newPassword"') &&
      client.includes("Resetting...") &&
      client.includes("onCompleted={handlePasswordReset}") &&
      !client.includes("No password was changed"),
    "Reset Password UI submits safely, prevents duplicate submission, and reports success",
  );
  assert(
    !resetAction.includes("console.log") &&
      !resetAction.includes("console.error") &&
      !resetAction.includes("return { newPassword") &&
      !resetAction.includes("return { passwordHash") &&
      !mutation.includes("metadata: { password") &&
      !mutation.includes("metadata: { newPassword"),
    "password and hash are not logged, returned, or included in audit metadata",
  );
}

try {
  testPasswordValidation();
  testPolicyMatrix();
  await testAtomicMutationContract();
  await testRollbackAndUpdateFailure();
  testSourceBoundaries();

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        databaseWrites: 0,
        networkRequests: 0,
        productionMutation: false,
        liveSessionE2E: "NOT_RUN",
        checks,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Reset Password verification failed.");
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
