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
  const dataDir = mkdtempSync(join(tmpdir(), "phase8-status-pg-"));
  const databaseName = `phase8_status_${process.pid}`;
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

  stage = "load-status-transaction";
  const { Prisma, PrismaClient, UserAuditAction, UserRole, UserStatus } =
    await import("@prisma/client");
  const { assertCanChangeStatus } = await import(
    "../src/lib/authorization-policy.ts"
  );
  const { changeUserStatusAndAudit } = await import(
    "../src/lib/user-management-mutation.ts"
  );
  prisma = new PrismaClient({
    datasources: { db: { url: disposable.databaseUrl } },
  });

  stage = "seed-disposable-users";
  const seedNow = new Date("2026-09-08T11:00:00.000Z");
  const actor = await prisma.user.create({
    data: {
      username: "phase8-actor",
      name: "Phase 8 Actor",
      email: "phase8-actor@example.invalid",
      password: "not-used-by-this-verifier",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const otherAdmin = await prisma.user.create({
    data: {
      username: "phase8-other-admin",
      name: "Phase 8 Other Admin",
      email: "phase8-other-admin@example.invalid",
      password: "not-used-by-this-verifier",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const activeTarget = await prisma.user.create({
    data: {
      username: "phase8-active-target",
      name: "Phase 8 Active Target",
      email: "phase8-active-target@example.invalid",
      password: "not-used-by-this-verifier",
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const disabledTarget = await prisma.user.create({
    data: {
      username: "phase8-disabled-target",
      name: "Phase 8 Disabled Target",
      email: "phase8-disabled-target@example.invalid",
      password: "not-used-by-this-verifier",
      role: UserRole.USER,
      status: UserStatus.DISABLED,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const disabledAdmin = await prisma.user.create({
    data: {
      username: "phase8-disabled-admin",
      name: "Phase 8 Disabled Admin",
      email: "phase8-disabled-admin@example.invalid",
      password: "not-used-by-this-verifier",
      role: UserRole.ADMIN,
      status: UserStatus.DISABLED,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });

  async function changeStatus(actorId, targetId, desiredStatus, now) {
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
      const actor = users.find((user) => user.id === actorId);
      const target = users.find((user) => user.id === targetId);
      if (!actor) throw new Error("INVALID_SESSION");
      if (!target) throw new Error("INVALID_TARGET");
      const activeAdminCount = await tx.user.count({
        where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      });
      assertCanChangeStatus(actor, target, desiredStatus, activeAdminCount);
      return changeUserStatusAndAudit(
        tx,
        actorId,
        target.id,
        target.status,
        desiredStatus,
        now,
      );
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 5_000,
    });
  }

  stage = "disable-active-user";
  const activeBefore = await prisma.user.findUniqueOrThrow({
    where: { id: activeTarget.id },
    select: { role: true, status: true, updatedAt: true },
  });
  await changeStatus(
    actor.id,
    activeTarget.id,
    UserStatus.DISABLED,
    new Date("2026-09-08T11:01:00.000Z"),
  );
  const activeDisabled = await prisma.user.findUniqueOrThrow({
    where: { id: activeTarget.id },
    select: { role: true, status: true, updatedAt: true },
  });
  const disableAudit = await prisma.userAuditLog.findFirstOrThrow({
    where: {
      actorUserId: actor.id,
      targetUserId: activeTarget.id,
      action: UserAuditAction.USER_DISABLED,
    },
    orderBy: { id: "desc" },
    select: { metadata: true },
  });
  assert(activeDisabled.role === UserRole.USER, "DISABLE_CHANGED_ROLE");
  assert(activeDisabled.status === UserStatus.DISABLED, "ACTIVE_USER_NOT_DISABLED");
  assert(activeDisabled.updatedAt > activeBefore.updatedAt, "DISABLE_VERSION_NOT_ADVANCED");
  assert(
    disableAudit.metadata?.fromStatus === "ACTIVE" &&
      disableAudit.metadata?.toStatus === "DISABLED",
    "DISABLE_AUDIT_METADATA_INVALID",
  );

  stage = "enable-disabled-user";
  const disabledBefore = await prisma.user.findUniqueOrThrow({
    where: { id: disabledTarget.id },
    select: { role: true, status: true, updatedAt: true },
  });
  await changeStatus(
    actor.id,
    disabledTarget.id,
    UserStatus.ACTIVE,
    new Date("2026-09-08T11:02:00.000Z"),
  );
  const disabledEnabled = await prisma.user.findUniqueOrThrow({
    where: { id: disabledTarget.id },
    select: { role: true, status: true, updatedAt: true },
  });
  const enableAudit = await prisma.userAuditLog.findFirstOrThrow({
    where: {
      actorUserId: actor.id,
      targetUserId: disabledTarget.id,
      action: UserAuditAction.USER_ENABLED,
    },
    orderBy: { id: "desc" },
    select: { metadata: true },
  });
  assert(disabledEnabled.role === UserRole.USER, "ENABLE_CHANGED_ROLE");
  assert(disabledEnabled.status === UserStatus.ACTIVE, "DISABLED_USER_NOT_ENABLED");
  assert(disabledEnabled.updatedAt > disabledBefore.updatedAt, "ENABLE_VERSION_NOT_ADVANCED");
  assert(
    enableAudit.metadata?.fromStatus === "DISABLED" &&
      enableAudit.metadata?.toStatus === "ACTIVE",
    "ENABLE_AUDIT_METADATA_INVALID",
  );

  stage = "enable-disabled-admin";
  await changeStatus(
    actor.id,
    disabledAdmin.id,
    UserStatus.ACTIVE,
    new Date("2026-09-08T11:03:00.000Z"),
  );
  const enabledAdmin = await prisma.user.findUniqueOrThrow({
    where: { id: disabledAdmin.id },
    select: { role: true, status: true },
  });
  assert(enabledAdmin.role === UserRole.ADMIN, "ENABLE_ADMIN_CHANGED_ROLE");
  assert(enabledAdmin.status === UserStatus.ACTIVE, "DISABLED_ADMIN_NOT_ENABLED");

  stage = "verify-no-op";
  const noOpBefore = await prisma.user.findUniqueOrThrow({
    where: { id: activeTarget.id },
    select: { status: true, updatedAt: true },
  });
  const noOpAuditCount = await prisma.userAuditLog.count({
    where: { targetUserId: activeTarget.id, action: UserAuditAction.USER_DISABLED },
  });
  let noOpRejected = false;
  try {
    await changeStatus(
      actor.id,
      activeTarget.id,
      UserStatus.DISABLED,
      new Date("2026-09-08T11:04:00.000Z"),
    );
  } catch {
    noOpRejected = true;
  }
  const noOpAfter = await prisma.user.findUniqueOrThrow({
    where: { id: activeTarget.id },
    select: { status: true, updatedAt: true },
  });
  const noOpAuditAfter = await prisma.userAuditLog.count({
    where: { targetUserId: activeTarget.id, action: UserAuditAction.USER_DISABLED },
  });
  assert(noOpRejected, "STATUS_NO_OP_NOT_REJECTED");
  assert(
    noOpAfter.status === noOpBefore.status &&
      noOpAfter.updatedAt?.getTime() === noOpBefore.updatedAt?.getTime() &&
      noOpAuditAfter === noOpAuditCount,
    "STATUS_NO_OP_MUTATED_STATE_OR_AUDIT",
  );

  stage = "verify-audit-rollback";
  const rollbackBefore = await prisma.user.findUniqueOrThrow({
    where: { id: disabledTarget.id },
    select: { status: true, updatedAt: true },
  });
  const rollbackAuditsBefore = await prisma.userAuditLog.count({
    where: { targetUserId: disabledTarget.id, action: UserAuditAction.USER_DISABLED },
  });
  let rollbackFailed = false;
  try {
    await prisma.$transaction(async (tx) => {
      const ids = [actor.id, disabledTarget.id];
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
      const target = users.find((user) => user.id === disabledTarget.id);
      if (!target) throw new Error("INVALID_TARGET");
      const activeAdminCount = await tx.user.count({
        where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      });
      assertCanChangeStatus(
        users.find((user) => user.id === actor.id),
        target,
        UserStatus.DISABLED,
        activeAdminCount,
      );
      await changeUserStatusAndAudit(
        tx,
        BigInt(999999999999),
        target.id,
        target.status,
        UserStatus.DISABLED,
        new Date("2026-09-08T11:05:00.000Z"),
      );
    });
  } catch {
    rollbackFailed = true;
  }
  const rollbackAfter = await prisma.user.findUniqueOrThrow({
    where: { id: disabledTarget.id },
    select: { status: true, updatedAt: true },
  });
  const rollbackAuditsAfter = await prisma.userAuditLog.count({
    where: { targetUserId: disabledTarget.id, action: UserAuditAction.USER_DISABLED },
  });
  assert(rollbackFailed, "STATUS_AUDIT_FAILURE_NOT_SURFACED");
  assert(
    rollbackAfter.status === rollbackBefore.status &&
      rollbackAfter.updatedAt?.getTime() === rollbackBefore.updatedAt?.getTime(),
    "STATUS_ROLLBACK_FAILED",
  );
  assert(rollbackAuditsAfter === rollbackAuditsBefore, "ORPHAN_STATUS_AUDIT_CREATED");

  stage = "verify-policy-last-admin-and-self";
  assert(
    (() => {
      try {
        assertCanChangeStatus(
          { id: actor.id, role: UserRole.ADMIN, status: UserStatus.ACTIVE },
          { id: otherAdmin.id, role: UserRole.ADMIN, status: UserStatus.ACTIVE },
          UserStatus.DISABLED,
          1,
        );
        return false;
      } catch (error) {
        return error?.code === "LAST_ADMIN";
      }
    })(),
    "last-admin policy rejects a final active administrator",
  );
  assert(
    (() => {
      try {
        assertCanChangeStatus(
          { id: actor.id, role: UserRole.ADMIN, status: UserStatus.ACTIVE },
          { id: actor.id, role: UserRole.ADMIN, status: UserStatus.ACTIVE },
          UserStatus.DISABLED,
          2,
        );
        return false;
      } catch (error) {
        return error?.code === "SELF_DISABLE";
      }
    })(),
    "self-disable policy rejects the actor target",
  );

  stage = "verify-concurrency";
  await prisma.user.updateMany({
    where: { id: { in: [actor.id, otherAdmin.id] } },
    data: { status: UserStatus.ACTIVE, role: UserRole.ADMIN, updatedAt: new Date("2026-09-08T11:10:00.000Z") },
  });

  async function concurrentDisable(actorId, targetId) {
    try {
      await changeStatus(
        actorId,
        targetId,
        UserStatus.DISABLED,
        new Date("2026-09-08T11:11:00.000Z"),
      );
      return "COMMITTED";
    } catch {
      return "REJECTED";
    }
  }

  const concurrentResults = await Promise.all([
    concurrentDisable(actor.id, otherAdmin.id),
    concurrentDisable(otherAdmin.id, actor.id),
  ]);
  const concurrentActiveAdmins = await prisma.user.count({
    where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
  });
  assert(
    concurrentResults.includes("REJECTED"),
    "concurrent opposite status changes reject at least one transaction",
  );
  assert(
    concurrentActiveAdmins >= 1,
    "concurrent status changes preserve an active administrator",
  );

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        databaseWrites: "disposable-only",
        productionMutation: false,
        checks: [
          "ACTIVE USER became DISABLED with role and audit preserved",
          "DISABLED USER became ACTIVE with role and audit preserved",
          "DISABLED ADMIN became ACTIVE without role change",
          "no-op status mutation changed neither timestamp nor audit",
          "audit failure rolled back status and updatedAt",
          "self-disable and last-admin policy remained enforced",
          "concurrent opposite status changes preserved an active administrator",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
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
        : "Disposable Account Status transaction verification failed.",
    }),
  );
  process.exitCode = blocked ? 2 : 1;
} finally {
  await prisma?.$disconnect().catch(() => {});
  await destroyDatabase(disposable);
}
