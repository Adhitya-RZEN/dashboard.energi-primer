import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  UserAuditAction,
  UserRole,
  UserStatus,
} from "@prisma/client";

import {
  assertUserProfileUnique,
  updateUserProfileAndAudit,
} from "../src/lib/user-management-mutation";
import { UserManagementDuplicateError } from "../src/lib/user-management-errors";
import {
  normalizeEditUserInput,
  validateEditUserInput,
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

function testInputValidation() {
  const valid = validateEditUserInput({
    username: "  Admin.User  ",
    name: "  Updated Name  ",
    email: "  UPDATED@EXAMPLE.INVALID  ",
  });
  assert(
    valid.valid &&
      valid.input.username === "admin.user" &&
      valid.input.name === "Updated Name" &&
      valid.input.email === "updated@example.invalid",
    "Edit profile input is canonicalized with the existing user rules",
  );

  const invalid = validateEditUserInput({
    username: "bad username",
    name: "",
    email: "not-an-email",
  });
  assert(
    !invalid.valid &&
      invalid.fieldErrors.username === "Invalid username" &&
      invalid.fieldErrors.name === "Name required" &&
      invalid.fieldErrors.email === "Valid email required",
    "Edit profile rejects invalid username, empty name, and invalid email",
  );
}

async function testDuplicatePreflight() {
  let lookupCount = 0;
  const duplicateTx = {
    user: {
      async findFirst() {
        lookupCount += 1;
        return lookupCount === 1 ? { id: BigInt(9) } : null;
      },
    },
  };
  let rejected = false;
  try {
    await assertUserProfileUnique(
      duplicateTx as never,
      BigInt(2),
      normalizeEditUserInput({
        username: "existing-user",
        name: "Target",
        email: "target@example.invalid",
      }),
    );
  } catch (error) {
    rejected =
      error instanceof UserManagementDuplicateError && error.field === "username";
  }
  assert(rejected && lookupCount === 1, "duplicate username is rejected before profile update");

  lookupCount = 0;
  const emailDuplicateTx = {
    user: {
      async findFirst() {
        lookupCount += 1;
        return lookupCount === 2 ? { id: BigInt(10) } : null;
      },
    },
  };
  rejected = false;
  try {
    await assertUserProfileUnique(
      emailDuplicateTx as never,
      BigInt(2),
      normalizeEditUserInput({
        username: "new-user",
        name: "Target",
        email: "existing@example.invalid",
      }),
    );
  } catch (error) {
    rejected =
      error instanceof UserManagementDuplicateError && error.field === "email";
  }
  assert(rejected && lookupCount === 2, "duplicate email is rejected before profile update");
}

async function testAtomicProfileMutation() {
  type UpdateArgs = {
    where: { id: bigint };
    data: Record<string, unknown>;
    select: unknown;
  };
  type AuditArgs = {
    data: {
      actorUserId: bigint;
      targetUserId: bigint;
      action: UserAuditAction;
      metadata: unknown;
    };
    select: unknown;
  };

  let updateArgs: UpdateArgs | null = null;
  let auditArgs: AuditArgs | null = null;
  const tx = {
    user: {
      async update(args: UpdateArgs) {
        updateArgs = args;
        return {
          id: BigInt(2),
          username: "updated-user",
          name: "Updated User",
          email: "updated@example.invalid",
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
        };
      },
    },
    userAuditLog: {
      async create(args: AuditArgs) {
        auditArgs = args;
        return { id: BigInt(20) };
      },
    },
  };
  const input = normalizeEditUserInput({
    username: "Updated-User",
    name: "Updated User",
    email: "UPDATED@EXAMPLE.INVALID",
  });
  const updated = await updateUserProfileAndAudit(
    tx as never,
    BigInt(1),
    BigInt(2),
    input,
    ["username", "name", "email"],
  );
  const capturedUpdate = updateArgs as unknown as UpdateArgs;
  const capturedAudit = auditArgs as unknown as AuditArgs;
  assert(
    capturedUpdate.where.id === BigInt(2) &&
      Object.keys(capturedUpdate.data).sort().join(",") === "email,name,username" &&
      !Object.hasOwn(capturedUpdate.data, "password") &&
      !Object.hasOwn(capturedUpdate.data, "role") &&
      !Object.hasOwn(capturedUpdate.data, "status") &&
      !Object.hasOwn(capturedUpdate.data, "updatedAt"),
    "profile mutation writes only username, name, and email",
  );
  assert(
    updated.role === UserRole.USER && updated.status === UserStatus.ACTIVE,
    "profile mutation result preserves role and status",
  );
  assert(
    capturedAudit.data.actorUserId === BigInt(1) &&
      capturedAudit.data.targetUserId === BigInt(2) &&
      capturedAudit.data.action === UserAuditAction.USER_UPDATED &&
      JSON.stringify(capturedAudit.data.metadata) ===
        '{"fields":["username","name","email"]}',
    "profile mutation records one safe USER_UPDATED audit with changed fields",
  );

  let auditCalls = 0;
  const failingUpdateTx = {
    user: {
      async update() {
        throw new Error("synthetic update failure");
      },
    },
    userAuditLog: {
      async create() {
        auditCalls += 1;
        return { id: BigInt(21) };
      },
    },
  };
  let failed = false;
  try {
    await updateUserProfileAndAudit(
      failingUpdateTx as never,
      BigInt(1),
      BigInt(2),
      input,
      ["name"],
    );
  } catch {
    failed = true;
  }
  assert(failed && auditCalls === 0, "failed profile update writes no audit row");
}

function testServerAndUiBoundaries() {
  const actionSource = readSource(
    "src/app/(protected)/pengaturan/users/actions.ts",
  );
  const editStart = actionSource.indexOf("export async function editUser");
  const editEnd = actionSource.indexOf(
    "export async function resetPassword",
    editStart,
  );
  const editAction = actionSource.slice(editStart, editEnd);
  const mutationSource = readSource("src/lib/user-management-mutation.ts");
  const authorizationSource = readSource("src/lib/authorization.ts");
  const clientSource = readSource(
    "src/components/user-management/UserManagementClient.tsx",
  );
  const editDialogStart = clientSource.indexOf("function EditUserDialog");
  const editDialogEnd = clientSource.indexOf("type PasswordForm", editDialogStart);
  const editDialog = clientSource.slice(editDialogStart, editDialogEnd);

  assert(
    editStart >= 0 &&
      editEnd > editStart &&
      editAction.includes("requireAdminUser()") &&
      editAction.includes("assertCanEditUserInTransaction") &&
      editAction.includes("assertUserProfileUnique") &&
      editAction.includes("updateUserProfileAndAudit") &&
      editAction.includes("withUserManagementTransaction") &&
      editAction.includes("revalidatePath"),
    "Edit User uses the active ADMIN guard, duplicate preflight, transaction, and revalidation",
  );
  assert(
    editAction.includes('formData.get("targetUserId")') &&
      editAction.includes('formData.get("username")') &&
      editAction.includes('formData.get("name")') &&
      editAction.includes('formData.get("email")') &&
      !editAction.includes('formData.get("password")') &&
      !editAction.includes('formData.get("role")') &&
      !editAction.includes('formData.get("status")') &&
      !editAction.includes('formData.get("actorUserId")'),
    "Edit User accepts only targetUserId and editable profile fields from the client",
  );
  assert(
    mutationSource.includes("assertUserProfileUnique") &&
      mutationSource.includes("updateUserProfileAndAudit") &&
      mutationSource.includes("UserAuditAction.USER_UPDATED") &&
      mutationSource.includes("metadata: { fields: changedFields }") &&
      authorizationSource.includes("assertCanEditUserInTransaction") &&
      authorizationSource.includes("assertAdminUser(asPolicySubject(context.actor))"),
    "profile persistence and authorization use the existing server mutation/audit boundary",
  );
  assert(
    editDialog.includes("useActionState") &&
      editDialog.includes("editUser") &&
      editDialog.includes('name="targetUserId"') &&
      editDialog.includes('name="username"') &&
      editDialog.includes('name="name"') &&
      editDialog.includes('name="email"') &&
      editDialog.includes("Saving...") &&
      editDialog.includes("onCompleted") &&
      !editDialog.includes("No changes were saved") &&
      !editDialog.includes("presentation-only"),
    "Edit User UI submits real profile data with pending, validation, and success handling",
  );
  assert(
    clientSource.includes("Deactivate") &&
      clientSource.includes("Activate") &&
      clientSource.includes("changeStatus") &&
      clientSource.includes("User deactivated successfully.") &&
      clientSource.includes("User activated successfully."),
    "Deactivate/Activate reuses the existing status action and feedback flow",
  );
}

try {
  testInputValidation();
  await testDuplicatePreflight();
  await testAtomicProfileMutation();
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
  console.error("Edit User verification failed.");
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
