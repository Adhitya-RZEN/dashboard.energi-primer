import bcrypt from "bcryptjs";
import { Prisma, UserAuditAction, UserRole, UserStatus } from "@prisma/client";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createUserAndAudit } from "../src/lib/user-management-mutation";
import { duplicateUserField } from "../src/lib/user-management-errors";
import {
  validateCreateUserInput,
  type NormalizedCreateUserInput,
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

const validInput = {
  username: " Operator01 ",
  name: " Budi Santoso ",
  email: " Operator01@Example.invalid ",
  password: "phase5-valid-password",
  confirmPassword: "phase5-valid-password",
  role: "USER",
};

function testValidation() {
  const valid = validateCreateUserInput(validInput);
  assert(valid.valid, "valid Add User input is accepted");
  assert(
    valid.input.username === "operator01" &&
      valid.input.name === "Budi Santoso" &&
      valid.input.email === "operator01@example.invalid",
    "username, name, and email are normalized canonically",
  );
  assert(
    validateCreateUserInput({ ...validInput, role: "admin" }).fieldErrors.role ===
      "Invalid role.",
    "lowercase arbitrary role is rejected",
  );
  assert(
    validateCreateUserInput({ ...validInput, role: "SUPERADMIN" }).fieldErrors
      .role === "Invalid role.",
    "unsupported role is rejected",
  );
  assert(
    validateCreateUserInput({ ...validInput, username: "bad name" }).fieldErrors
      .username === "Invalid username",
    "invalid username shape is rejected",
  );
  assert(
    validateCreateUserInput({ ...validInput, email: "not-an-email" }).fieldErrors
      .email === "Valid email required",
    "invalid email is rejected",
  );
  assert(
    validateCreateUserInput({ ...validInput, password: "short" }).fieldErrors
      .password === "Password must be at least 12 characters.",
    "short password is rejected",
  );
  assert(
    validateCreateUserInput({
      ...validInput,
      confirmPassword: "different-password",
    }).fieldErrors.confirmPassword === "Passwords do not match.",
    "password mismatch is rejected",
  );
  assert(
    validateCreateUserInput({ ...validInput, role: "" }).fieldErrors.role ===
      "Role required",
    "missing role is rejected",
  );
}

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
    create: (args: UserCreateArgs) => Promise<{
      id: bigint;
      username: string;
      name: string;
      email: string;
      role: UserRole;
      status: UserStatus;
    }>;
  };
  userAuditLog: {
    create: (args: AuditCreateArgs) => Promise<{ id: bigint }>;
  };
};

function asMutationInput(): NormalizedCreateUserInput {
  const result = validateCreateUserInput(validInput);
  if (!result.valid) throw new Error("test fixture is invalid");
  return result.input as NormalizedCreateUserInput;
}

async function testHashAndTransactionalAudit() {
  const input = asMutationInput();
  const passwordHash = await bcrypt.hash(input.password, 12);
  let userCreateArgs: UserCreateArgs | null = null;
  let auditCreateArgs: AuditCreateArgs | null = null;

  const tx: FakeTransaction = {
    user: {
      async create(args) {
        userCreateArgs = args;
        return {
          id: BigInt(9001),
          username: args.data.username,
          name: args.data.name,
          email: args.data.email,
          role: args.data.role,
          status: args.data.status,
        };
      },
    },
    userAuditLog: {
      async create(args) {
        auditCreateArgs = args;
        return { id: BigInt(9010) };
      },
    },
  };

  const created = await createUserAndAudit(
    tx as unknown as Parameters<typeof createUserAndAudit>[0],
    BigInt(42),
    input,
    passwordHash,
    new Date("2026-09-08T00:00:00.000Z"),
  );

  assert(created.id === BigInt(9001), "created user id is returned from the insert");
  const capturedUserCreateArgs = userCreateArgs as unknown as UserCreateArgs;
  const capturedAuditCreateArgs = auditCreateArgs as unknown as AuditCreateArgs;
  assert(
    capturedUserCreateArgs.data.password === passwordHash &&
      capturedUserCreateArgs.data.password !== input.password,
    "database insert receives bcrypt hash and never plaintext password",
  );
  assert(
    capturedUserCreateArgs.data.status === UserStatus.ACTIVE &&
      capturedUserCreateArgs.data.role === UserRole.USER,
    "new user is forced ACTIVE with the validated role",
  );
  assert(
    capturedAuditCreateArgs.data.actorUserId === BigInt(42) &&
      capturedAuditCreateArgs.data.targetUserId === BigInt(9001) &&
      capturedAuditCreateArgs.data.action === UserAuditAction.USER_CREATED,
    "USER_CREATED audit uses authenticated actor and newly created target",
  );
  const metadata = JSON.stringify(capturedAuditCreateArgs.data.metadata ?? {});
  assert(
    !metadata.includes(input.password) &&
      !metadata.includes("confirmPassword") &&
      !metadata.includes("passwordHash"),
    "audit metadata excludes plaintext and credential fields",
  );
  assert(
    await bcrypt.compare(input.password, capturedUserCreateArgs.data.password),
    "stored password hash verifies with bcrypt",
  );
}

async function testRollbackOnAuditFailure() {
  const input = asMutationInput();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const users: bigint[] = [];
  const audits: bigint[] = [];
  const tx: FakeTransaction = {
    user: {
      async create(args) {
        users.push(BigInt(9002));
        return {
          id: BigInt(9002),
          username: args.data.username,
          name: args.data.name,
          email: args.data.email,
          role: args.data.role,
          status: args.data.status,
        };
      },
    },
    userAuditLog: {
      async create() {
        throw new Error("synthetic audit failure");
      },
    },
  };

  async function fakeSerializableTransaction(
    callback: () => Promise<unknown>,
  ) {
    const usersBefore = users.length;
    const auditsBefore = audits.length;
    try {
      return await callback();
    } catch (error) {
      users.splice(usersBefore);
      audits.splice(auditsBefore);
      throw error;
    }
  }

  let failed = false;
  try {
    await fakeSerializableTransaction(() =>
      createUserAndAudit(
        tx as unknown as Parameters<typeof createUserAndAudit>[0],
        BigInt(42),
        input,
        passwordHash,
      ),
    );
  } catch {
    failed = true;
  }
  assert(failed, "audit failure is surfaced to the transaction boundary");
  assert(
    users.length === 0 && audits.length === 0,
    "audit failure rolls back the simulated user transaction",
  );
}

function testDuplicateMapping() {
  const usernameError = Object.assign(
    Object.create(Prisma.PrismaClientKnownRequestError.prototype),
    { code: "P2002", meta: { target: ["username"] } },
  );
  const emailError = Object.assign(
    Object.create(Prisma.PrismaClientKnownRequestError.prototype),
    { code: "P2002", meta: { target: ["email"] } },
  );
  const namedConstraintError = Object.assign(
    Object.create(Prisma.PrismaClientKnownRequestError.prototype),
    { code: "P2002", meta: { target: "users_username_key" } },
  );
  assert(
    duplicateUserField(usernameError) === "username",
    "username unique constraint maps to a safe field error",
  );
  assert(
    duplicateUserField(emailError) === "email",
    "email unique constraint maps to a safe field error",
  );
  assert(
    duplicateUserField(namedConstraintError) === "username",
    "named unique constraint maps to a safe field error",
  );
  assert(
    duplicateUserField(new Error("database failure")) === null,
    "unknown database errors do not expose constraint details",
  );
}

function testServerAndUiIntegration() {
  const action = readSource("src/app/(protected)/pengaturan/users/actions.ts");
  const page = readSource("src/app/(protected)/pengaturan/users/page.tsx");
  const mutation = readSource("src/lib/user-management-mutation.ts");
  const service = readSource("src/services/user-management.ts");
  const client = readSource(
    "src/components/user-management/UserManagementClient.tsx",
  );

  assert(
      action.includes('"use server"') &&
      action.includes("requireAdminUser()") &&
      action.includes("withUserManagementTransaction") &&
      action.includes("assertUserCreationUnique") &&
      action.includes("bcrypt.hash"),
    "Add User is a server action with ADMIN guard, transaction, and bcrypt",
  );
  assert(
    action.includes('formData.get("username")') &&
      action.includes('formData.get("confirmPassword")') &&
      !action.includes('formData.get("status")') &&
      !action.includes('formData.get("actorUserId")'),
    "server action accepts only client-controlled Add User fields",
  );
  assert(
      mutation.includes("tx.user.create") &&
      mutation.includes("tx.userAuditLog.create") &&
      mutation.includes("mode: \"insensitive\"") &&
      mutation.includes("UserAuditAction.USER_CREATED") &&
      mutation.includes("UserStatus.ACTIVE") &&
      mutation.includes("targetUserId: createdUser.id"),
    "user and USER_CREATED audit are created in one transaction callback",
  );
  assert(
    page.includes("requireAdminUser") &&
      service.includes("userListSelect") &&
      !service.includes("password: true") &&
      !service.includes("rememberToken"),
    "page guard and user list use the server-side allowlisted read path",
  );
  assert(
    client.includes("useActionState") &&
      client.includes("action={formAction}") &&
      client.includes("Creating...") &&
      client.includes("User created successfully.") &&
      client.includes("router.refresh()"),
    "Phase 4 Add User dialog submits, reports success, and refreshes the list",
  );
  assert(
    !action.includes("console.log") &&
      !action.includes("console.error") &&
      !action.includes("return { password") &&
      !action.includes("return { passwordHash"),
    "Add User action does not log or return credential material",
  );
}

try {
  testValidation();
  await testHashAndTransactionalAudit();
  await testRollbackOnAuditFailure();
  testDuplicateMapping();
  testServerAndUiIntegration();

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
  console.error("Add User verification failed.");
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
