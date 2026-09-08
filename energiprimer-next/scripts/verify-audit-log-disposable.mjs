import { execFile, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pgBin = "C:\\Program Files\\PostgreSQL\\18\\bin";
const host = "127.0.0.1";
const initdb = join(pgBin, "initdb.exe");
const postgresExe = join(pgBin, "postgres.exe");
const pgCtl = join(pgBin, "pg_ctl.exe");
const pgIsReady = join(pgBin, "pg_isready.exe");
const createdb = join(pgBin, "createdb.exe");
const dropdb = join(pgBin, "dropdb.exe");

async function run(file, args, options = {}) {
  return execFileAsync(file, args, {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolvePromise);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  if (!port) throw new Error("NO_DISPOSABLE_PORT");
  return port;
}

function postgresArgs(port, extra = []) {
  return ["-h", host, "-p", String(port), "-U", "postgres", ...extra];
}

async function waitForPostgres(child, port) {
  let childError = null;
  const onError = (error) => {
    childError = error;
  };
  child.once("error", onError);
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (childError) throw childError;
      if (child.exitCode !== null) throw new Error("POSTGRES_EXITED");
      try {
        await run(pgIsReady, ["-h", host, "-p", String(port), "-U", "postgres", "-t", "1"]);
        return;
      } catch {
        await wait(250);
      }
    }
    throw new Error("POSTGRES_READY_TIMEOUT");
  } finally {
    child.removeListener("error", onError);
  }
}

async function stopPostgres(child, dataDir) {
  if (dataDir && existsSync(join(dataDir, "postmaster.pid"))) {
    await run(pgCtl, ["-D", dataDir, "stop", "-m", "immediate", "-w"]).catch(() => {});
  }
  if (!child || child.exitCode !== null) return;
  await new Promise((resolvePromise) => {
    const timer = setTimeout(resolvePromise, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolvePromise();
    });
    child.kill();
  });
  if (child.exitCode === null && child.pid) {
    await run("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"]).catch(() => {});
  }
}

async function removeDirectoryWithRetry(directory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!existsSync(directory)) return;
    try {
      rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 19) throw error;
      await wait(250);
    }
  }
}

async function createDatabase() {
  const port = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), "phase9-audit-pg-"));
  const databaseName = `phase9_audit_${process.pid}`;
  const databaseUrl = `postgresql://postgres@${host}:${port}/${databaseName}?schema=public`;
  let postgresProcess = null;
  let setupStage = "initdb";

  try {
    await run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"]);
    setupStage = "start-postgres";
    postgresProcess = spawn(
      postgresExe,
      ["-D", dataDir, "-p", String(port), "-h", host],
      { cwd: projectRoot, windowsHide: true, stdio: "ignore" },
    );
    await waitForPostgres(postgresProcess, port);
    setupStage = "create-database";
    await run(createdb, postgresArgs(port, [databaseName]));
    setupStage = "push-schema";
    await run(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "db",
        "push",
        "--schema=prisma/production/schema.prisma",
        "--skip-generate",
        "--accept-data-loss",
      ],
      { env: { ...process.env, DATABASE_URL: databaseUrl } },
    );
    return { dataDir, databaseName, databaseUrl, port, postgresProcess };
  } catch {
    await stopPostgres(postgresProcess, dataDir);
    await removeDirectoryWithRetry(dataDir).catch(() => {});
    throw new Error(`DISPOSABLE_SETUP_${setupStage}`);
  }
}

async function destroyDatabase(disposable) {
  if (!disposable) return;
  await run(
    dropdb,
    postgresArgs(disposable.port, ["--if-exists", disposable.databaseName]),
  ).catch(() => {});
  await stopPostgres(disposable.postgresProcess, disposable.dataDir);
  await removeDirectoryWithRetry(disposable.dataDir);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let disposable;
let prisma;
let stage = "startup";

try {
  if (![initdb, postgresExe, pgCtl, pgIsReady, createdb, dropdb].every(existsSync)) {
    throw new Error("DISPOSABLE_POSTGRES_BINARIES_UNAVAILABLE");
  }

  stage = "create-disposable-database";
  disposable = await createDatabase();
  process.env.DATABASE_URL = disposable.databaseUrl;

  stage = "load-audit-transaction";
  const { Prisma, PrismaClient, UserAuditAction, UserRole, UserStatus } =
    await import("@prisma/client");
  const {
    assertCanChangeRole,
    assertCanChangeStatus,
    assertCanResetPassword,
  } = await import("../src/lib/authorization-policy.ts");
  const {
    changeUserRoleAndAudit,
    changeUserStatusAndAudit,
    createUserAndAudit,
    resetUserPasswordAndAudit,
  } = await import("../src/lib/user-management-mutation.ts");
  prisma = new PrismaClient({
    datasources: { db: { url: disposable.databaseUrl } },
  });

  stage = "seed-disposable-users";
  const seedNow = new Date("2026-09-08T11:00:00.000Z");
  const actor = await prisma.user.create({
    data: {
      username: "phase9-audit-actor",
      name: "Phase 9 Audit Actor",
      email: "phase9-audit-actor@example.invalid",
      password: "seed-hash",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  await prisma.user.create({
    data: {
      username: "phase9-audit-other-admin",
      name: "Phase 9 Audit Other Admin",
      email: "phase9-audit-other-admin@example.invalid",
      password: "seed-hash",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const target = await prisma.user.create({
    data: {
      username: "phase9-audit-target",
      name: "Phase 9 Audit Target",
      email: "phase9-audit-target@example.invalid",
      password: "seed-hash",
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const disabledTarget = await prisma.user.create({
    data: {
      username: "phase9-audit-disabled-target",
      name: "Phase 9 Audit Disabled Target",
      email: "phase9-audit-disabled-target@example.invalid",
      password: "seed-hash",
      role: UserRole.USER,
      status: UserStatus.DISABLED,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  assert(
    (await prisma.userAuditLog.count()) === 0,
    "seed users create no audit records outside a management mutation",
  );

  async function lockedMutation(actorId, targetId, callback) {
    return prisma.$transaction(async (tx) => {
      const ids = actorId === targetId ? [actorId] : [actorId, targetId];
      await tx.$queryRaw(Prisma.sql`
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
      const actorRecord = users.find((user) => user.id === actorId);
      const targetRecord = users.find((user) => user.id === targetId);
      if (!actorRecord || !targetRecord) throw new Error("INVALID_TARGET");
      const activeAdminCount = await tx.user.count({
        where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      });
      return callback(tx, actorRecord, targetRecord, activeAdminCount);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 5_000,
    });
  }

  stage = "create-user-audit";
  const created = await prisma.$transaction((tx) =>
    createUserAndAudit(
      tx,
      actor.id,
      {
        username: "phase9-audit-created",
        name: "Phase 9 Audit Created",
        email: "phase9-audit-created@example.invalid",
        password: "phase9-created-password",
        role: "USER",
      },
      "$2b$12$phase9-created-hash",
      new Date("2026-09-08T11:01:00.000Z"),
    ),
  );
  stage = "reset-password-audit";
  await lockedMutation(actor.id, target.id, (tx, actorRecord, targetRecord) => {
    assertCanResetPassword(actorRecord, targetRecord);
    return resetUserPasswordAndAudit(
      tx,
      actor.id,
      target.id,
      "$2b$12$phase9-reset-hash",
      new Date("2026-09-08T11:02:00.000Z"),
    );
  });
  stage = "role-change-audit";
  await lockedMutation(actor.id, target.id, (tx, actorRecord, targetRecord, activeAdminCount) => {
    assertCanChangeRole(actorRecord, targetRecord, UserRole.ADMIN, activeAdminCount);
    return changeUserRoleAndAudit(
      tx,
      actor.id,
      target.id,
      targetRecord.role,
      UserRole.ADMIN,
      new Date("2026-09-08T11:03:00.000Z"),
    );
  });
  stage = "disable-enable-audits";
  await lockedMutation(actor.id, disabledTarget.id, (tx, actorRecord, targetRecord, activeAdminCount) => {
    assertCanChangeStatus(actorRecord, targetRecord, UserStatus.ACTIVE, activeAdminCount);
    return changeUserStatusAndAudit(
      tx,
      actor.id,
      disabledTarget.id,
      targetRecord.status,
      UserStatus.ACTIVE,
      new Date("2026-09-08T11:04:00.000Z"),
    );
  });
  await lockedMutation(actor.id, disabledTarget.id, (tx, actorRecord, targetRecord, activeAdminCount) => {
    assertCanChangeStatus(actorRecord, targetRecord, UserStatus.DISABLED, activeAdminCount);
    return changeUserStatusAndAudit(
      tx,
      actor.id,
      disabledTarget.id,
      targetRecord.status,
      UserStatus.DISABLED,
      new Date("2026-09-08T11:05:00.000Z"),
    );
  });

  stage = "verify-exact-audit-records";
  const actionCounts = await prisma.userAuditLog.groupBy({
    by: ["action"],
    _count: { _all: true },
  });
  const counts = new Map(actionCounts.map((row) => [row.action, row._count._all]));
  assert(counts.get(UserAuditAction.USER_CREATED) === 1, "actual USER_CREATED count is exactly one");
  assert(counts.get(UserAuditAction.PASSWORD_RESET) === 1, "actual PASSWORD_RESET count is exactly one");
  assert(counts.get(UserAuditAction.ROLE_CHANGED) === 1, "actual ROLE_CHANGED count is exactly one");
  assert(counts.get(UserAuditAction.USER_ENABLED) === 1, "actual USER_ENABLED count is exactly one");
  assert(counts.get(UserAuditAction.USER_DISABLED) === 1, "actual USER_DISABLED count is exactly one");
  assert(
    actionCounts.reduce((total, row) => total + row._count._all, 0) === 5,
    "actual database contains exactly five Phase 5-8 audit records",
  );

  const audits = await prisma.userAuditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      createdAt: true,
      action: true,
      metadata: true,
      actor: { select: { username: true, name: true, status: true } },
      target: { select: { username: true, name: true, status: true } },
    },
  });
  assert(audits.length === 5, "bounded safe audit projection returns five records");
  assert(
    audits.every((row) => {
      const text = JSON.stringify(row.metadata ?? {});
      return !/(password|hash|token|session|jwt|cookie|secret|private.?key|database_url)/i.test(text);
    }),
    "actual audit metadata contains no credential, token, or session material",
  );
  const createdAudit = audits.find((row) => row.action === UserAuditAction.USER_CREATED);
  const resetAudit = audits.find((row) => row.action === UserAuditAction.PASSWORD_RESET);
  const roleAudit = audits.find((row) => row.action === UserAuditAction.ROLE_CHANGED);
  const enabledAudit = audits.find((row) => row.action === UserAuditAction.USER_ENABLED);
  const disabledAudit = audits.find((row) => row.action === UserAuditAction.USER_DISABLED);
  assert(
    createdAudit?.target.username === created.username &&
      createdAudit?.metadata?.username === created.username &&
      createdAudit?.metadata?.role === "USER",
    "actual USER_CREATED record has safe target and allowlisted metadata",
  );
  assert(
    resetAudit?.target.username === target.username &&
      JSON.stringify(resetAudit.metadata) === "{}",
    "actual PASSWORD_RESET record has empty metadata and correct target",
  );
  assert(
    roleAudit?.target.username === target.username &&
      roleAudit?.metadata?.fromRole === "USER" &&
      roleAudit?.metadata?.toRole === "ADMIN",
    "actual ROLE_CHANGED record has allowlisted role metadata",
  );
  assert(
    enabledAudit?.metadata?.fromStatus === "DISABLED" &&
      enabledAudit?.metadata?.toStatus === "ACTIVE" &&
      disabledAudit?.metadata?.fromStatus === "ACTIVE" &&
      disabledAudit?.metadata?.toStatus === "DISABLED",
    "actual status records have allowlisted transition metadata",
  );
  assert(
    audits.every((row) => row.actor.username === actor.username),
    "actual audit projection resolves the authenticated actor consistently",
  );

  stage = "verify-rejected-and-rollback";
  const beforeRejected = await prisma.userAuditLog.count();
  let rejectedRole = false;
  try {
    await lockedMutation(actor.id, target.id, (tx, actorRecord, targetRecord, activeAdminCount) => {
      assertCanChangeRole(actorRecord, targetRecord, UserRole.ADMIN, activeAdminCount);
      return changeUserRoleAndAudit(tx, actor.id, target.id, targetRecord.role, UserRole.ADMIN);
    });
  } catch {
    rejectedRole = true;
  }
  let rejectedStatus = false;
  try {
    await lockedMutation(actor.id, disabledTarget.id, (tx, actorRecord, targetRecord, activeAdminCount) => {
      assertCanChangeStatus(actorRecord, targetRecord, UserStatus.DISABLED, activeAdminCount);
      return changeUserStatusAndAudit(tx, actor.id, disabledTarget.id, targetRecord.status, UserStatus.DISABLED);
    });
  } catch {
    rejectedStatus = true;
  }
  assert(
    rejectedRole && rejectedStatus && (await prisma.userAuditLog.count()) === beforeRejected,
    "actual rejected/no-op mutations create zero audit records",
  );

  const rollbackBefore = await prisma.user.findUniqueOrThrow({
    where: { id: target.id },
    select: { status: true, updatedAt: true },
  });
  const rollbackAuditCount = await prisma.userAuditLog.count();
  let rollbackFailed = false;
  try {
    await lockedMutation(actor.id, target.id, (tx, actorRecord, targetRecord, activeAdminCount) => {
      assertCanChangeStatus(actorRecord, targetRecord, UserStatus.DISABLED, activeAdminCount);
      return changeUserStatusAndAudit(
        tx,
        BigInt(999999999999),
        target.id,
        targetRecord.status,
        UserStatus.DISABLED,
        new Date("2026-09-08T11:06:00.000Z"),
      );
    });
  } catch {
    rollbackFailed = true;
  }
  const rollbackAfter = await prisma.user.findUniqueOrThrow({
    where: { id: target.id },
    select: { status: true, updatedAt: true },
  });
  assert(rollbackFailed, "actual audit foreign-key failure is surfaced");
  assert(
    rollbackAfter.status === rollbackBefore.status &&
      rollbackAfter.updatedAt?.getTime() === rollbackBefore.updatedAt?.getTime() &&
      (await prisma.userAuditLog.count()) === rollbackAuditCount,
    "actual transaction rolls back target status, security version, and orphan audit",
  );

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        databaseWrites: "disposable-only",
        productionMutation: false,
        productionAuditRead: false,
        checks: [
          "actual USER_CREATED, PASSWORD_RESET, ROLE_CHANGED, USER_ENABLED, and USER_DISABLED rows were verified",
          "actual safe relation projection was bounded and credential-free",
          "actual rejected/no-op mutations created zero rows",
          "actual audit failure rolled back the target mutation and audit row",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  const blocked = message === "DISPOSABLE_POSTGRES_BINARIES_UNAVAILABLE";
  console.error(
    JSON.stringify({
      status: blocked ? "BLOCKED" : "FAILED",
      productionMutation: false,
      productionAuditRead: false,
      stage: message.startsWith("DISPOSABLE_SETUP_") ? message : stage,
      reason: blocked
        ? "Disposable PostgreSQL runtime is unavailable in this environment."
        : "Disposable Audit Log database verification failed.",
    }),
  );
  process.exitCode = blocked ? 2 : 1;
} finally {
  await prisma?.$disconnect().catch(() => {});
  await destroyDatabase(disposable);
}
