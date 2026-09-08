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
const psql = join(pgBin, "psql.exe");
const createdb = join(pgBin, "createdb.exe");
const dropdb = join(pgBin, "dropdb.exe");
const migrationPath = join(
  projectRoot,
  "prisma",
  "production",
  "migrations",
  "20260908120000_add_user_management_data_model",
  "migration.sql",
);

const exec = (file, args, options = {}) =>
  execFileAsync(file, args, {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });

const wait = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
        await exec(pgIsReady, ["-h", host, "-p", String(port), "-U", "postgres", "-t", "1"]);
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
    await exec(pgCtl, ["-D", dataDir, "stop", "-m", "immediate", "-w"]).catch(
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
    await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"]).catch(
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

async function startDisposableCluster() {
  const port = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), "phase10-pg-"));
  let postgresProcess = null;
  let setupStage = "initdb";
  try {
    await exec(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"]);
    setupStage = "start-postgres";
    postgresProcess = spawn(
      postgresExe,
      ["-D", dataDir, "-p", String(port), "-h", host],
      { cwd: projectRoot, windowsHide: true, stdio: "ignore" },
    );
    await waitForPostgres(postgresProcess, port);
    return { dataDir, port, postgresProcess, databases: new Set() };
  } catch {
    await stopPostgres(postgresProcess, dataDir);
    await removeDirectoryWithRetry(dataDir).catch(() => {});
    throw new Error(`DISPOSABLE_SETUP_${setupStage}`);
  }
}

async function createDatabase(cluster, suffix) {
  const databaseName = `phase10_${suffix}_${process.pid}_${Date.now()}`.slice(0, 60);
  await exec(createdb, postgresArgs(cluster.port, [databaseName]));
  cluster.databases.add(databaseName);
  return {
    databaseName,
    databaseUrl: `postgresql://postgres@${host}:${cluster.port}/${databaseName}?schema=public`,
  };
}

async function dropDatabasesAndStop(cluster) {
  if (!cluster) return;
  for (const databaseName of cluster.databases) {
    await exec(
      dropdb,
      postgresArgs(cluster.port, ["--if-exists", databaseName]),
    ).catch(() => {});
  }
  await stopPostgres(cluster.postgresProcess, cluster.dataDir);
  await removeDirectoryWithRetry(cluster.dataDir);
}

function psqlArgs(cluster, databaseName, extra = []) {
  return [
    "-X",
    "-h",
    host,
    "-p",
    String(cluster.port),
    "-U",
    "postgres",
    "-d",
    databaseName,
    ...extra,
  ];
}

async function query(cluster, databaseName, sql) {
  const result = await exec(psql, [
    ...psqlArgs(cluster, databaseName),
    "-A",
    "-t",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ]);
  return result.stdout.trim();
}

async function executeSql(cluster, databaseName, sql) {
  await exec(psql, [
    ...psqlArgs(cluster, databaseName),
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ]);
}

async function prepareLegacyUsers(cluster, databaseName, rows) {
  await executeSql(
    cluster,
    databaseName,
    `
      CREATE TABLE "users" (
        "id" BIGINT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "password" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'admin',
        "created_at" TIMESTAMP,
        "updated_at" TIMESTAMP,
        "last_login_at" TIMESTAMP
      );
      INSERT INTO "users" ("id", "name", "email", "password", "role")
      VALUES ${rows
        .map(
          ({ id, name, email, password, role }) =>
            `(${id}, '${name}', '${email}', '${password}', '${role}')`,
        )
        .join(",")};
    `,
  );
}

async function runMigration(cluster, databaseName, singleTransaction = false) {
  const args = [
    ...psqlArgs(cluster, databaseName),
    "-v",
    "ON_ERROR_STOP=1",
  ];
  if (singleTransaction) args.push("--single-transaction");
  args.push("-f", migrationPath);
  return exec(psql, args);
}

async function verifyMigration(cluster) {
  const migrated = await createDatabase(cluster, "migration");
  await prepareLegacyUsers(cluster, migrated.databaseName, [
    {
      id: 1,
      name: "Legacy Admin",
      email: "Admin.Name@Example.invalid",
      password: "legacy-admin-hash-fixture",
      role: "admin",
    },
    {
      id: 2,
      name: "Legacy User",
      email: "User.Name@Example.invalid",
      password: "legacy-user-hash-fixture",
      role: "user",
    },
  ]);
  await runMigration(cluster, migrated.databaseName);

  const rows = (await query(
    cluster,
    migrated.databaseName,
    `SELECT "id" || '|' || "username" || '|' || "role"::text || '|' || "status"::text || '|' || "email" || '|' || "password" FROM "users" ORDER BY "id"`,
  )).replace(/\r/g, "");
  assert(
    rows ===
      "1|admin.name|ADMIN|ACTIVE|Admin.Name@Example.invalid|legacy-admin-hash-fixture\n" +
        "2|user.name|USER|ACTIVE|User.Name@Example.invalid|legacy-user-hash-fixture",
    "MIGRATION_BACKFILL_OR_PRESERVATION_FAILED",
  );

  const structure = await query(
    cluster,
    migrated.databaseName,
    `SELECT
      (SELECT COUNT(*) FROM pg_type WHERE typname = 'UserRole') || '|' ||
      (SELECT COUNT(*) FROM pg_type WHERE typname = 'UserStatus') || '|' ||
      (SELECT COUNT(*) FROM pg_type WHERE typname = 'UserAuditAction') || '|' ||
      (SELECT COUNT(*) FROM pg_class WHERE relname = 'user_audit_logs') || '|' ||
      (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'user_audit_logs') || '|' ||
      (SELECT COUNT(*) FROM pg_constraint WHERE conrelid = 'user_audit_logs'::regclass AND contype = 'f' AND confdeltype = 'r')`,
  );
  assert(structure === "1|1|1|1|4|2", "MIGRATION_STRUCTURE_FAILED");

  const collision = await createDatabase(cluster, "collision");
  await prepareLegacyUsers(cluster, collision.databaseName, [
    {
      id: 1,
      name: "Collision One",
      email: "same@one.example.invalid",
      password: "collision-one-fixture",
      role: "admin",
    },
    {
      id: 2,
      name: "Collision Two",
      email: "same@two.example.invalid",
      password: "collision-two-fixture",
      role: "user",
    },
  ]);
  let collisionRejected = false;
  try {
    await runMigration(cluster, collision.databaseName, true);
  } catch {
    collisionRejected = true;
  }
  assert(collisionRejected, "MIGRATION_COLLISION_NOT_REJECTED");
  const collisionState = await query(
    cluster,
    collision.databaseName,
    `SELECT
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'username') || '|' ||
      (SELECT COUNT(*) FROM pg_type WHERE typname = 'UserRole')`,
  );
  assert(collisionState === "0|0", "MIGRATION_COLLISION_PARTIALLY_APPLIED");

  const invalidRole = await createDatabase(cluster, "invalidrole");
  await prepareLegacyUsers(cluster, invalidRole.databaseName, [
    {
      id: 1,
      name: "Invalid Role",
      email: "invalid-role@example.invalid",
      password: "invalid-role-fixture",
      role: "operator",
    },
  ]);
  let invalidRoleRejected = false;
  try {
    await runMigration(cluster, invalidRole.databaseName, true);
  } catch {
    invalidRoleRejected = true;
  }
  assert(invalidRoleRejected, "MIGRATION_UNKNOWN_ROLE_NOT_REJECTED");
  const invalidRoleState = await query(
    cluster,
    invalidRole.databaseName,
    `SELECT
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'username') || '|' ||
      (SELECT COUNT(*) FROM pg_type WHERE typname = 'UserRole')`,
  );
  assert(invalidRoleState === "0|0", "MIGRATION_UNKNOWN_ROLE_PARTIALLY_APPLIED");
}

async function pushProductionSchema(cluster, database) {
  await exec(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "db",
      "push",
      "--schema=prisma/production/schema.prisma",
      "--skip-generate",
      "--accept-data-loss",
    ],
    { env: { ...process.env, DATABASE_URL: database.databaseUrl } },
  );
}

async function verifyCrossMutationConcurrency(cluster) {
  const database = await createDatabase(cluster, "concurrency");
  await pushProductionSchema(cluster, database);
  process.env.DATABASE_URL = database.databaseUrl;

  const {
    Prisma,
    PrismaClient,
    UserRole,
    UserStatus,
  } = await import("@prisma/client");
  const bcrypt = (await import("bcryptjs")).default;
  const {
    assertCanChangeRole,
    assertCanChangeStatus,
    assertCanResetPassword,
  } = await import("../src/lib/authorization-policy.ts");
  const { changeUserRoleAndAudit, changeUserStatusAndAudit, resetUserPasswordAndAudit } =
    await import("../src/lib/user-management-mutation.ts");

  const prisma = new PrismaClient({
    datasources: { db: { url: database.databaseUrl } },
  });
  try {
    async function loadLockedContext(tx, actorId, targetId) {
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
      assert(actor && target, "CONCURRENT_PARTICIPANT_MISSING");
      const activeAdminCount = await tx.user.count({
        where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      });
      return { actor, target, activeAdminCount };
    }

    const seedNow = new Date("2026-09-08T11:00:00.000Z");
    const actor = await prisma.user.create({
      data: {
        username: "phase10-actor",
        name: "Phase 10 Actor",
        email: "phase10-actor@example.invalid",
        password: "actor-fixture",
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        createdAt: seedNow,
        updatedAt: seedNow,
      },
    });
    await prisma.user.create({
      data: {
        username: "phase10-other-admin",
        name: "Phase 10 Other Admin",
        email: "phase10-other-admin@example.invalid",
        password: "other-admin-fixture",
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        createdAt: seedNow,
        updatedAt: seedNow,
      },
    });
    const roleStatusTarget = await prisma.user.create({
      data: {
        username: "phase10-role-status",
        name: "Phase 10 Role Status",
        email: "phase10-role-status@example.invalid",
        password: "role-status-fixture",
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: seedNow,
        updatedAt: seedNow,
      },
    });
    const passwordStatusTarget = await prisma.user.create({
      data: {
        username: "phase10-password-status",
        name: "Phase 10 Password Status",
        email: "phase10-password-status@example.invalid",
        password: "password-status-old-fixture",
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: seedNow,
        updatedAt: seedNow,
      },
    });

    async function runConcurrent(label, callback) {
      try {
        await callback();
        return { label, status: "COMMITTED", error: "" };
      } catch (error) {
        const code = typeof error?.code === "string" ? error.code : "";
        const message = error instanceof Error ? error.message : "";
        assert(
          !/deadlock|lock timeout|P2028|timeout exceeded/i.test(`${code} ${message}`),
          `${label}_DEADLOCK_OR_TIMEOUT`,
        );
        return { label, status: "REJECTED", error: code || "SERIALIZATION" };
      }
    }

    async function changeRole() {
      await prisma.$transaction(
        async (tx) => {
          const context = await loadLockedContext(tx, actor.id, roleStatusTarget.id);
          assertCanChangeRole(
            context.actor,
            context.target,
            UserRole.ADMIN,
            context.activeAdminCount,
          );
          await changeUserRoleAndAudit(
            tx,
            actor.id,
            context.target.id,
            context.target.role,
            UserRole.ADMIN,
            new Date(),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5_000 },
      );
    }

    async function disableStatus() {
      await prisma.$transaction(
        async (tx) => {
          const context = await loadLockedContext(tx, actor.id, roleStatusTarget.id);
          assertCanChangeStatus(
            context.actor,
            context.target,
            UserStatus.DISABLED,
            context.activeAdminCount,
          );
          await changeUserStatusAndAudit(
            tx,
            actor.id,
            context.target.id,
            context.target.status,
            UserStatus.DISABLED,
            new Date(),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5_000 },
      );
    }

    const roleStatusResults = await Promise.all([
      runConcurrent("role", changeRole),
      runConcurrent("status", disableStatus),
    ]);
    const roleStatusFinal = await prisma.user.findUniqueOrThrow({
      where: { id: roleStatusTarget.id },
      select: { role: true, status: true },
    });
    const roleStatusAudits = await prisma.userAuditLog.findMany({
      where: { targetUserId: roleStatusTarget.id },
      orderBy: { id: "asc" },
      select: { action: true },
    });
    const roleCommitted = roleStatusResults.some(
      (result) => result.label === "role" && result.status === "COMMITTED",
    );
    const statusCommitted = roleStatusResults.some(
      (result) => result.label === "status" && result.status === "COMMITTED",
    );
    assert(
      roleStatusResults.some((result) => result.status === "COMMITTED"),
      "ROLE_STATUS_BOTH_REJECTED",
    );
    assert(
      roleStatusFinal.role === (roleCommitted ? UserRole.ADMIN : UserRole.USER) &&
        roleStatusFinal.status === (statusCommitted ? UserStatus.DISABLED : UserStatus.ACTIVE),
      "ROLE_STATUS_INVALID_FINAL_STATE",
    );
    assert(
      roleStatusAudits.length === Number(roleCommitted) + Number(statusCommitted) &&
        new Set(roleStatusAudits.map(({ action }) => action)).size === roleStatusAudits.length,
      "ROLE_STATUS_AUDIT_COUNT_OR_DUPLICATE_FAILED",
    );

    const oldPassword = "password-status-old-fixture";
    const newPassword = "password-status-new-fixture";
    const newPasswordHash = await bcrypt.hash(newPassword, 4);
    async function resetPassword() {
      await prisma.$transaction(
        async (tx) => {
          const context = await loadLockedContext(tx, actor.id, passwordStatusTarget.id);
          assertCanResetPassword(context.actor, context.target);
          await resetUserPasswordAndAudit(
            tx,
            actor.id,
            context.target.id,
            newPasswordHash,
            new Date(),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5_000 },
      );
    }
    async function disablePasswordStatus() {
      await prisma.$transaction(
        async (tx) => {
          const context = await loadLockedContext(tx, actor.id, passwordStatusTarget.id);
          assertCanChangeStatus(
            context.actor,
            context.target,
            UserStatus.DISABLED,
            context.activeAdminCount,
          );
          await changeUserStatusAndAudit(
            tx,
            actor.id,
            context.target.id,
            context.target.status,
            UserStatus.DISABLED,
            new Date(),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5_000 },
      );
    }
    const passwordStatusResults = await Promise.all([
      runConcurrent("password", resetPassword),
      runConcurrent("password-status", disablePasswordStatus),
    ]);
    const passwordStatusFinal = await prisma.user.findUniqueOrThrow({
      where: { id: passwordStatusTarget.id },
      select: { password: true, role: true, status: true },
    });
    const passwordStatusAudits = await prisma.userAuditLog.findMany({
      where: { targetUserId: passwordStatusTarget.id },
      orderBy: { id: "asc" },
      select: { action: true },
    });
    const passwordCommitted = passwordStatusResults.some(
      (result) => result.label === "password" && result.status === "COMMITTED",
    );
    const passwordStatusCommitted = passwordStatusResults.some(
      (result) => result.label === "password-status" && result.status === "COMMITTED",
    );
    assert(
      passwordStatusResults.some((result) => result.status === "COMMITTED"),
      "PASSWORD_STATUS_BOTH_REJECTED",
    );
    assert(
      passwordStatusFinal.role === UserRole.USER &&
        passwordStatusFinal.status ===
          (passwordStatusCommitted ? UserStatus.DISABLED : UserStatus.ACTIVE),
      "PASSWORD_STATUS_INVALID_FINAL_STATE",
    );
    assert(
      passwordStatusAudits.length ===
        Number(passwordCommitted) + Number(passwordStatusCommitted) &&
        new Set(passwordStatusAudits.map(({ action }) => action)).size ===
          passwordStatusAudits.length,
      "PASSWORD_STATUS_AUDIT_COUNT_OR_DUPLICATE_FAILED",
    );
    assert(
      (await bcrypt.compare(
        passwordCommitted ? newPassword : oldPassword,
        passwordStatusFinal.password,
      )),
      "PASSWORD_STATUS_PASSWORD_ATOMICITY_FAILED",
    );

    return {
      roleStatusResults: roleStatusResults.map(({ label, status }) => `${label}:${status}`),
      passwordStatusResults: passwordStatusResults.map(({ label, status }) => `${label}:${status}`),
    };
  } finally {
    await prisma.$disconnect();
  }
}

let cluster;
let stage = "startup";
try {
  if (
    ![initdb, postgresExe, pgCtl, pgIsReady, psql, createdb, dropdb, migrationPath].every(
      existsSync,
    )
  ) {
    throw new Error("DISPOSABLE_POSTGRES_OR_MIGRATION_UNAVAILABLE");
  }

  stage = "start-disposable-cluster";
  cluster = await startDisposableCluster();
  stage = "verify-migration";
  await verifyMigration(cluster);
  stage = "verify-cross-mutation-concurrency";
  const concurrency = await verifyCrossMutationConcurrency(cluster);
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        databaseWrites: "disposable-only",
        productionMutation: false,
        productionAuditRead: false,
        productionUserRead: false,
        migrationAppliedToProduction: false,
        checks: [
          "legacy username backfill, role mapping, status default, password/email preservation, audit relations, and indexes verified",
          "duplicate username candidates fail closed without partial migration",
          "unknown legacy role fails closed without partial migration",
          "concurrent role/status mutation leaves a valid final state with no duplicate audit rows",
          "concurrent password/status mutation leaves a valid final state with no duplicate audit rows",
          "cross-mutation lock paths complete without deadlock or transaction timeout",
        ],
        concurrency,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown";
  const blocked = message === "DISPOSABLE_POSTGRES_OR_MIGRATION_UNAVAILABLE";
  console.error(
    JSON.stringify({
      status: blocked ? "BLOCKED" : "FAILED",
      productionMutation: false,
      productionAuditRead: false,
      stage,
      detail: message,
      reason: blocked
        ? "Disposable PostgreSQL binaries or migration artifact are unavailable."
        : "Phase 10 disposable migration/concurrency verification failed.",
    }),
  );
  process.exitCode = blocked ? 2 : 1;
} finally {
  await dropDatabasesAndStop(cluster);
}
