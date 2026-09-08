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
    await run(pgCtl, ["-D", dataDir, "stop", "-m", "immediate", "-w"]).catch(
      () => {},
    );
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
    await run("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"]).catch(
      () => {},
    );
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
  const dataDir = mkdtempSync(join(tmpdir(), "phase7-role-pg-"));
  const databaseName = `phase7_role_${process.pid}`;
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

  stage = "load-prisma-and-mutation";
  const { Prisma, PrismaClient, UserAuditAction, UserRole, UserStatus } =
    await import("@prisma/client");
  const { assertCanChangeRole } = await import(
    "../src/lib/authorization-policy.ts"
  );
  const { changeUserRoleAndAudit } = await import(
    "../src/lib/user-management-mutation.ts"
  );
  prisma = new PrismaClient({
    datasources: { db: { url: disposable.databaseUrl } },
  });

  stage = "seed-disposable-users";
  const seedNow = new Date(Date.now() - 5_000);
  const actor = await prisma.user.create({
    data: {
      username: "phase7-actor",
      name: "Phase 7 Actor",
      email: "phase7-actor@example.invalid",
      password: "not-used-by-this-verifier",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const otherAdmin = await prisma.user.create({
    data: {
      username: "phase7-other-admin",
      name: "Phase 7 Other Admin",
      email: "phase7-other-admin@example.invalid",
      password: "not-used-by-this-verifier",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const activeTarget = await prisma.user.create({
    data: {
      username: "phase7-active-target",
      name: "Phase 7 Active Target",
      email: "phase7-active-target@example.invalid",
      password: "not-used-by-this-verifier",
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const disabledTarget = await prisma.user.create({
    data: {
      username: "phase7-disabled-target",
      name: "Phase 7 Disabled Target",
      email: "phase7-disabled-target@example.invalid",
      password: "not-used-by-this-verifier",
      role: UserRole.USER,
      status: UserStatus.DISABLED,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });

  stage = "run-promote-transaction";
  const promoteAt = new Date(Date.now() + 2_000);
  await prisma.$transaction(
    (tx) =>
      changeUserRoleAndAudit(
        tx,
        actor.id,
        activeTarget.id,
        UserRole.USER,
        UserRole.ADMIN,
        promoteAt,
      ),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  const promoted = await prisma.user.findUniqueOrThrow({
    where: { id: activeTarget.id },
    select: { role: true, status: true, updatedAt: true },
  });
  const promoteAudit = await prisma.userAuditLog.findFirstOrThrow({
    where: {
      actorUserId: actor.id,
      targetUserId: activeTarget.id,
      action: UserAuditAction.ROLE_CHANGED,
    },
    orderBy: { id: "desc" },
    select: { metadata: true },
  });
  assert(promoted.role === UserRole.ADMIN, "ACTIVE_USER_NOT_PROMOTED");
  assert(promoted.status === UserStatus.ACTIVE, "ACTIVE_TARGET_STATUS_CHANGED");
  assert(promoted.updatedAt && promoted.updatedAt > activeTarget.updatedAt, "PROMOTE_VERSION_NOT_ADVANCED");
  const promoteMetadata = promoteAudit.metadata;
  assert(
    promoteMetadata &&
      typeof promoteMetadata === "object" &&
      promoteMetadata.fromRole === "USER" &&
      promoteMetadata.toRole === "ADMIN",
    "PROMOTE_AUDIT_METADATA_INVALID",
  );

  stage = "run-disabled-target-transaction";
  const disabledBefore = await prisma.user.findUniqueOrThrow({
    where: { id: disabledTarget.id },
    select: { updatedAt: true },
  });
  await prisma.$transaction(
    (tx) =>
      changeUserRoleAndAudit(
        tx,
        actor.id,
        disabledTarget.id,
        UserRole.USER,
        UserRole.ADMIN,
      ),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  const disabledAfter = await prisma.user.findUniqueOrThrow({
    where: { id: disabledTarget.id },
    select: { role: true, status: true, updatedAt: true },
  });
  assert(disabledAfter.role === UserRole.ADMIN, "DISABLED_TARGET_NOT_PROMOTED");
  assert(disabledAfter.status === UserStatus.DISABLED, "DISABLED_TARGET_WAS_ENABLED");
  assert(disabledAfter.updatedAt > disabledBefore.updatedAt, "DISABLED_VERSION_NOT_ADVANCED");

  stage = "verify-rollback";
  const rollbackTarget = await prisma.user.create({
    data: {
      username: "phase7-rollback-target",
      name: "Phase 7 Rollback Target",
      email: "phase7-rollback@example.invalid",
      password: "not-used-by-this-verifier",
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  let rollbackFailed = false;
  try {
    await prisma.$transaction(
      (tx) =>
        changeUserRoleAndAudit(
          tx,
          BigInt(999999999999),
          rollbackTarget.id,
          UserRole.USER,
          UserRole.ADMIN,
        ),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch {
    rollbackFailed = true;
  }
  const rollbackState = await prisma.user.findUniqueOrThrow({
    where: { id: rollbackTarget.id },
    select: { role: true, updatedAt: true },
  });
  const rollbackAudits = await prisma.userAuditLog.count({
    where: {
      targetUserId: rollbackTarget.id,
      action: UserAuditAction.ROLE_CHANGED,
    },
  });
  assert(rollbackFailed, "ROLE_AUDIT_FAILURE_NOT_SURFACED");
  assert(rollbackState.role === UserRole.USER, "ROLE_ROLLBACK_FAILED");
  assert(
    rollbackState.updatedAt?.getTime() === rollbackTarget.updatedAt?.getTime(),
    "ROLE_VERSION_ROLLBACK_FAILED",
  );
  assert(rollbackAudits === 0, "ORPHAN_ROLE_AUDIT_CREATED");

  stage = "run-concurrent-last-admin-transactions";
  // Reconfigure the earlier fixtures so the race has exactly two ACTIVE
  // administrators. This is disposable setup state, not an application
  // mutation path.
  await prisma.user.updateMany({
    where: { id: { in: [actor.id, otherAdmin.id, activeTarget.id] } },
    data: { role: UserRole.USER, updatedAt: new Date(Date.now() + 3_000) },
  });
  const concurrentA = await prisma.user.create({
    data: {
      username: "phase7-concurrent-a",
      name: "Phase 7 Concurrent A",
      email: "phase7-concurrent-a@example.invalid",
      password: "not-used-by-this-verifier",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const concurrentB = await prisma.user.create({
    data: {
      username: "phase7-concurrent-b",
      name: "Phase 7 Concurrent B",
      email: "phase7-concurrent-b@example.invalid",
      password: "not-used-by-this-verifier",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });

  async function concurrentRoleChange(actorId, targetId) {
    try {
      await prisma.$transaction(
        async (tx) => {
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
          const actorRow = users.find((user) => user.id === actorId);
          const targetRow = users.find((user) => user.id === targetId);
          const activeAdminCount = await tx.user.count({
            where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
          });
          assert(actorRow && targetRow, "CONCURRENT_PARTICIPANT_MISSING");
          assertCanChangeRole(actorRow, targetRow, UserRole.USER, activeAdminCount);
          await changeUserRoleAndAudit(
            tx,
            actorId,
            targetId,
            targetRow.role,
            UserRole.USER,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return "COMMITTED";
    } catch {
      return "REJECTED";
    }
  }

  const concurrentResults = await Promise.all([
    concurrentRoleChange(concurrentA.id, concurrentB.id),
    concurrentRoleChange(concurrentB.id, concurrentA.id),
  ]);
  const concurrentActiveAdmins = await prisma.user.count({
    where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
  });
  assert(
    concurrentResults.includes("REJECTED"),
    "concurrent last-admin mutations reject at least one transaction",
  );
  assert(
    concurrentActiveAdmins >= 1,
    "concurrent role changes preserve an active administrator",
  );

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        databaseWrites: "disposable-only",
        productionMutation: false,
        checks: [
          "ACTIVE USER promoted and ROLE_CHANGED audit persisted",
          "DISABLED target became ADMIN without becoming ACTIVE",
          "audit failure rolled back role and updatedAt",
          "concurrent opposite demotions rejected at least one transaction",
          "active administrator invariant remained true",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown";
  const blocked =
    message === "DISPOSABLE_POSTGRES_BINARIES_UNAVAILABLE" ||
    message.includes("WINDOWS_RESTRICTED_TOKEN");
  console.error(
    JSON.stringify({
      status: blocked ? "BLOCKED" : "FAILED",
      productionMutation: false,
      stage: message.startsWith("DISPOSABLE_SETUP_") ? message : stage,
      reason: blocked
        ? "Disposable PostgreSQL runtime is unavailable in this environment."
        : "Disposable Role Management transaction verification failed.",
    }),
  );
  process.exitCode = blocked ? 2 : 1;
} finally {
  await prisma?.$disconnect().catch(() => {});
  await destroyDatabase(disposable);
}
