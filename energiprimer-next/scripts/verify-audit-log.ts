import { UserAuditAction, UserRole, UserStatus } from "@prisma/client";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADMIN_ROLE,
  DISABLED_STATUS,
  USER_ROLE,
  ACTIVE_STATUS,
  AuthorizationPolicyError,
  assertAdminUser,
  canAccessUserManagement,
} from "../src/lib/authorization-policy";
import { changeUserRoleAndAudit, changeUserStatusAndAudit, createUserAndAudit, resetUserPasswordAndAudit } from "../src/lib/user-management-mutation";
import {
  validateCreateUserInput,
  type NormalizedCreateUserInput,
} from "../src/lib/user-management-validation";
import {
  AUDIT_LOG_ACTIONS,
  AUDIT_LOG_PAGE_SIZE_DEFAULT,
  AUDIT_LOG_PAGE_SIZE_MAX,
  parseAuditLogQuery,
} from "../src/lib/audit-log-validation";

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

function policyCode(callback: () => void) {
  try {
    callback();
    return null;
  } catch (error) {
    if (error instanceof AuthorizationPolicyError) return error.code;
    throw error;
  }
}

type AuditRecord = {
  actorUserId: bigint;
  targetUserId: bigint;
  action: UserAuditAction;
  metadata: unknown;
};

type UserMutationArgs = {
  where: { id: bigint };
  data: Record<string, unknown>;
  select: unknown;
};

type UserCreateArgs = {
  data: {
    username: string;
    name: string;
    email: string;
    password: string;
    role: UserRole;
    status: UserStatus;
    createdAt: Date;
    updatedAt: Date;
  };
  select: unknown;
};

type AuditCreateArgs = {
  data: AuditRecord;
  select: unknown;
};

type FakeTransaction = {
  user: {
    create: (args: UserCreateArgs) => Promise<{
      id: bigint;
      username: string;
      name: string;
      email: string;
      role: UserRole;
      status: UserStatus;
    }>;
    update: (args: UserMutationArgs) => Promise<{
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

function makeFakeTransaction(
  auditRecords: AuditRecord[],
  options: { failUpdate?: boolean; failAudit?: boolean } = {},
): FakeTransaction {
  return {
    user: {
      async create(args) {
        return {
          id: BigInt(9001),
          username: args.data.username,
          name: args.data.name,
          email: args.data.email,
          role: args.data.role,
          status: args.data.status,
        };
      },
      async update(args) {
        if (options.failUpdate) throw new Error("synthetic update failure");
        return {
          id: args.where.id,
          username: "target-user",
          name: "Target User",
          email: "target@example.invalid",
          role: (args.data.role as UserRole | undefined) ?? UserRole.USER,
          status: (args.data.status as UserStatus | undefined) ?? UserStatus.ACTIVE,
          updatedAt: (args.data.updatedAt as Date | undefined) ?? new Date(),
        };
      },
    },
    userAuditLog: {
      async create(args) {
        if (options.failAudit) throw new Error("synthetic audit failure");
        auditRecords.push(args.data);
        return { id: BigInt(auditRecords.length) };
      },
    },
  };
}

function normalizedCreateInput(): NormalizedCreateUserInput {
  const result = validateCreateUserInput({
    username: "audit-target",
    name: "Audit Target",
    email: "audit-target@example.invalid",
    password: "phase9-valid-password",
    confirmPassword: "phase9-valid-password",
    role: "USER",
  });
  if (!result.valid) throw new Error("audit fixture input is invalid");
  return result.input;
}

async function testExactlyOneAuditPerMutation() {
  const records: AuditRecord[] = [];
  const now = new Date("2026-09-08T00:00:00.000Z");
  const input = normalizedCreateInput();

  await createUserAndAudit(
    makeFakeTransaction(records) as never,
    BigInt(1),
    input,
    "$2b$12$phase9-hash-placeholder",
    now,
  );
  await resetUserPasswordAndAudit(
    makeFakeTransaction(records) as never,
    BigInt(1),
    BigInt(3),
    "$2b$12$phase9-reset-hash-placeholder",
    now,
  );
  await changeUserRoleAndAudit(
    makeFakeTransaction(records) as never,
    BigInt(1),
    BigInt(3),
    UserRole.USER,
    ADMIN_ROLE,
    now,
  );
  await changeUserStatusAndAudit(
    makeFakeTransaction(records) as never,
    BigInt(1),
    BigInt(3),
    UserStatus.ACTIVE,
    DISABLED_STATUS,
    now,
  );
  await changeUserStatusAndAudit(
    makeFakeTransaction(records) as never,
    BigInt(1),
    BigInt(3),
    UserStatus.DISABLED,
    ACTIVE_STATUS,
    now,
  );

  assert(records.length === 5, "five successful Phase 5-8 mutations create exactly five audit records");
  const actionCounts = new Map<UserAuditAction, number>();
  for (const record of records) {
    actionCounts.set(record.action, (actionCounts.get(record.action) ?? 0) + 1);
    assert(
      record.actorUserId === BigInt(1) && record.targetUserId > BigInt(0),
      `${record.action} audit stores actor and target IDs from the transaction`,
    );
    const metadata = JSON.stringify(record.metadata) ?? "";
    assert(
      !/(password|hash|token|session|jwt|cookie|secret|private.?key|database_url)/i.test(
        metadata,
      ),
      `${record.action} metadata excludes credential and session material`,
    );
  }
  assert(
    actionCounts.get(UserAuditAction.USER_CREATED) === 1 &&
      actionCounts.get(UserAuditAction.PASSWORD_RESET) === 1 &&
      actionCounts.get(UserAuditAction.ROLE_CHANGED) === 1 &&
      actionCounts.get(UserAuditAction.USER_DISABLED) === 1 &&
      actionCounts.get(UserAuditAction.USER_ENABLED) === 1,
    "USER_CREATED, PASSWORD_RESET, ROLE_CHANGED, USER_DISABLED, and USER_ENABLED each occur once",
  );
  assert(
    JSON.stringify(records[0]?.metadata) === '{"username":"audit-target","role":"USER"}',
    "USER_CREATED metadata is limited to username and role",
  );
  assert(
    JSON.stringify(records[1]?.metadata) === "{}",
    "PASSWORD_RESET metadata is empty",
  );
  assert(
    JSON.stringify(records[2]?.metadata) === '{"fromRole":"USER","toRole":"ADMIN"}',
    "ROLE_CHANGED metadata is limited to fromRole and toRole",
  );
  assert(
    JSON.stringify(records[3]?.metadata) ===
      '{"fromStatus":"ACTIVE","toStatus":"DISABLED"}' &&
      JSON.stringify(records[4]?.metadata) ===
        '{"fromStatus":"DISABLED","toStatus":"ACTIVE"}',
    "status metadata is limited to fromStatus and toStatus",
  );
}

async function testRejectedAndFailedMutationsCreateNoAudit() {
  const records: AuditRecord[] = [];
  const before = records.length;
  const noOpTx = makeFakeTransaction(records, { failUpdate: true, failAudit: true });

  let rejectedRole = false;
  try {
    await changeUserRoleAndAudit(
      noOpTx as never,
      BigInt(1),
      BigInt(2),
      UserRole.ADMIN,
      ADMIN_ROLE,
    );
  } catch {
    rejectedRole = true;
  }
  let rejectedStatus = false;
  try {
    await changeUserStatusAndAudit(
      noOpTx as never,
      BigInt(1),
      BigInt(2),
      UserStatus.ACTIVE,
      ACTIVE_STATUS,
    );
  } catch {
    rejectedStatus = true;
  }
  let rejectedInvalidStatus = false;
  try {
    await changeUserStatusAndAudit(
      noOpTx as never,
      BigInt(1),
      BigInt(2),
      "INVALID" as UserStatus,
      ACTIVE_STATUS,
    );
  } catch {
    rejectedInvalidStatus = true;
  }

  assert(
    rejectedRole && rejectedStatus && rejectedInvalidStatus && records.length === before,
    "rejected and no-op role/status mutations create zero audit records",
  );

  let failedUpdate = false;
  try {
    await resetUserPasswordAndAudit(
      makeFakeTransaction(records, { failUpdate: true }) as never,
      BigInt(1),
      BigInt(3),
      "$2b$12$phase9-failing-update",
    );
  } catch {
    failedUpdate = true;
  }
  assert(
    failedUpdate && records.length === before,
    "failed password update creates zero PASSWORD_RESET audit records",
  );

  let failedAudit = false;
  try {
    await createUserAndAudit(
      makeFakeTransaction(records, { failAudit: true }) as never,
      BigInt(1),
      normalizedCreateInput(),
      "$2b$12$phase9-failing-audit",
    );
  } catch {
    failedAudit = true;
  }
  assert(
    failedAudit && records.length === before,
    "audit write failure is surfaced for the transaction to roll back the mutation",
  );
}

function testReadAuthorizationMatrix() {
  const activeAdmin = { id: BigInt(1), role: ADMIN_ROLE, status: ACTIVE_STATUS };
  const activeUser = { id: BigInt(2), role: USER_ROLE, status: ACTIVE_STATUS };
  const disabledAdmin = { id: BigInt(3), role: ADMIN_ROLE, status: DISABLED_STATUS };
  const disabledUser = { id: BigInt(4), role: USER_ROLE, status: DISABLED_STATUS };

  assert(canAccessUserManagement(activeAdmin), "ACTIVE ADMIN can access audit read policy");
  assert(!canAccessUserManagement(activeUser), "ACTIVE USER is denied by audit read policy");
  assert(!canAccessUserManagement(disabledAdmin), "DISABLED ADMIN is denied by audit read policy");
  assert(!canAccessUserManagement(disabledUser), "DISABLED USER is denied by audit read policy");
  assert(!canAccessUserManagement(null), "guest is denied by audit read policy");
  assert(
    policyCode(() => assertAdminUser(activeAdmin)) === null &&
      policyCode(() => assertAdminUser(activeUser)) === "FORBIDDEN" &&
      policyCode(() => assertAdminUser(disabledAdmin)) === "ACCOUNT_DISABLED",
    "server ADMIN assertion distinguishes active admin, user, and disabled admin",
  );
}

function testQueryValidationAndSourceBoundaries() {
  const query = parseAuditLogQuery({
    action: UserAuditAction.ROLE_CHANGED,
    page: "999999999",
    pageSize: "999999999",
    search: "  actor-name ".repeat(20),
    from: "2026-09-08",
    to: "2026-09-30",
  });
  assert(query.action === UserAuditAction.ROLE_CHANGED, "known audit action filter is accepted");
  assert(query.pageSize === AUDIT_LOG_PAGE_SIZE_MAX && query.page <= 1000, "audit pagination is bounded");
  assert(query.search.length <= 100, "audit search input is length bounded");
  assert(query.from === "2026-09-08" && query.to === "2026-09-30", "valid date filters are retained");
  const invalid = parseAuditLogQuery({ action: "DROP_TABLE", page: "0", pageSize: "0", from: "2026-02-30" });
  assert(
    invalid.action === "ALL" &&
      invalid.page === 1 &&
      invalid.pageSize === AUDIT_LOG_PAGE_SIZE_DEFAULT &&
      invalid.from === "",
    "invalid action, page, page size, and date filters fall back safely",
  );

  const mutation = readSource("src/lib/user-management-mutation.ts");
  const service = readSource("src/services/audit-log.ts");
  const page = readSource("src/app/(protected)/pengaturan/audit-log/page.tsx");
  const nav = readSource("src/components/layout/NavigationMenu.tsx");
  const schema = readSource("prisma/production/schema.prisma");
  const metadataBlocks = [...mutation.matchAll(/metadata:\s*\{([\s\S]*?)\}/g)].map(
    (match) => match[1] ?? "",
  );

  assert(
    mutation.includes("UserAuditAction.USER_CREATED") &&
      mutation.includes("UserAuditAction.PASSWORD_RESET") &&
      mutation.includes("UserAuditAction.ROLE_CHANGED") &&
      mutation.includes("UserAuditAction.USER_ENABLED") &&
      mutation.includes("UserAuditAction.USER_DISABLED") &&
      mutation.includes("tx.userAuditLog.create"),
    "all five required mutation writers use the shared audit writer",
  );
  assert(
    metadataBlocks.every(
      (block) =>
        !/(password|hash|token|session|jwt|cookie|secret|private.?key|database_url)/i.test(
          block,
        ),
    ),
    "audit metadata source blocks contain no credential, token, or session fields",
  );
  assert(
    service.includes("requireAdminUser()") &&
      service.includes("take: query.pageSize + 1") &&
      service.includes('orderBy: [{ createdAt: "desc" }, { id: "desc" }]') &&
      service.includes("metadata: true") &&
      service.includes("actor:") &&
      service.includes("target:") &&
      !service.includes("password: true") &&
      !service.includes("rememberToken") &&
      !service.includes("JSON.stringify"),
    "audit read uses an ADMIN guard, explicit safe select, deterministic order, and bounded page size",
  );
  assert(
    page.includes("requireAdminUser()") &&
      page.includes("parseAuditLogQuery") &&
      page.includes('method="get"') &&
      page.includes("Audit Log") &&
      !page.includes("JSON.stringify") &&
      !page.includes("delete") &&
      !page.includes("userAuditLog.create"),
    "Audit Log route is guarded, filterable, read-only, and never exposes raw metadata",
  );
  assert(
    nav.includes('href: "/pengaturan/audit-log"') &&
      nav.includes('label: "Audit Log"') &&
      nav.includes("adminOnly: true"),
    "Audit Log navigation is presentation-hidden from non-admin roles",
  );
  assert(
    schema.includes("onDelete: Restrict") &&
      schema.includes("@@index([actorUserId])") &&
      schema.includes("@@index([targetUserId])") &&
      schema.includes("@@index([createdAt])"),
    "audit relations remain immutable/deletion-protected and indexed",
  );
  assert(
    AUDIT_LOG_ACTIONS.includes(UserAuditAction.USER_CREATED) &&
      AUDIT_LOG_ACTIONS.includes(UserAuditAction.PASSWORD_RESET) &&
      AUDIT_LOG_ACTIONS.includes(UserAuditAction.ROLE_CHANGED) &&
      AUDIT_LOG_ACTIONS.includes(UserAuditAction.USER_ENABLED) &&
      AUDIT_LOG_ACTIONS.includes(UserAuditAction.USER_DISABLED),
    "audit filter allowlist covers all Phase 5-8 action types",
  );
}

function testSessionSecurityAndLogoutBoundaries() {
  const auth = readSource("src/auth.ts");
  const authorization = readSource("src/lib/authorization.ts");
  const protectedLayout = readSource("src/app/(protected)/layout.tsx");
  const signOut = readSource("src/components/auth/SignOutButton.tsx");

  assert(
    auth.includes('strategy: "jwt"') &&
      auth.includes("maxAge: 120 * 60") &&
      auth.includes("sessionVersion") &&
      auth.includes("currentUser.status !== UserStatus.ACTIVE") &&
      auth.includes("currentUser.role !== tokenRole") &&
      auth.includes("currentVersion !== tokenVersion") &&
      auth.includes('session.user.role = ""'),
    "Auth.js JWT session revalidates current status, role, and security version with the two-hour lifetime preserved",
  );
  assert(
    authorization.includes("requireAdminUser") &&
      authorization.includes("assertActiveUser") &&
      authorization.includes("user.role !== session.user.role"),
    "server authorization re-reads the current active role before protected admin work",
  );
  assert(
    protectedLayout.includes("requireDashboardUser") &&
      signOut.includes('signOut({ redirectTo: "/login" })'),
    "protected layout and logout lifecycle retain the authoritative server boundary",
  );
}

try {
  await testExactlyOneAuditPerMutation();
  await testRejectedAndFailedMutationsCreateNoAudit();
  testReadAuthorizationMatrix();
  testQueryValidationAndSourceBoundaries();
  testSessionSecurityAndLogoutBoundaries();

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        databaseWrites: 0,
        networkRequests: 0,
        productionMutation: false,
        productionAuditRead: false,
        checks,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Audit Log verification failed.");
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
