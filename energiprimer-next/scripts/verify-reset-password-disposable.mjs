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
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (childError) throw childError;
      if (child.exitCode !== null) throw new Error("POSTGRES_EXITED");
      try {
        await run(pgIsReady, ["-h", host, "-p", String(port), "-U", "postgres", "-t", "1"]);
        return;
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
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
}

async function removeDirectoryWithRetry(directory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!existsSync(directory)) return;
    try {
      rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
  }
}

async function createDatabase() {
  const port = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), "phase6-reset-pg-"));
  const databaseName = `phase6_reset_${process.pid}`;
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

    const env = { ...process.env, DATABASE_URL: databaseUrl };
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
      { env },
    );

    return { dataDir, databaseName, databaseUrl, port, postgresProcess };
  } catch (error) {
    const errorText = [
      error instanceof Error ? error.message : "",
      error?.stdout,
      error?.stderr,
    ]
      .filter(Boolean)
      .join(" ");
    await stopPostgres(postgresProcess, dataDir);
    await removeDirectoryWithRetry(dataDir);
    throw new Error(
      `DISPOSABLE_SETUP_${setupStage}_${errorText ? "FAILED" : "UNKNOWN"}`,
    );
  }
}

async function destroyDatabase(disposable) {
  if (!disposable) return;
  await run(dropdb, postgresArgs(disposable.port, ["--if-exists", disposable.databaseName])).catch(
    () => {},
  );
  await stopPostgres(disposable.postgresProcess, disposable.dataDir);
  await removeDirectoryWithRetry(disposable.dataDir);
}

let disposable;
let prisma;
let stage = "startup";

try {
  if (![initdb, postgresExe, pgIsReady, createdb, dropdb].every(existsSync)) {
    throw new Error("DISPOSABLE_POSTGRES_BINARIES_UNAVAILABLE");
  }

  stage = "create-disposable-database";
  disposable = await createDatabase();
  process.env.DATABASE_URL = disposable.databaseUrl;

  stage = "load-prisma-and-mutation";
  const { Prisma, PrismaClient, UserAuditAction, UserRole, UserStatus } =
    await import("@prisma/client");
  const bcrypt = (await import("bcryptjs")).default;
  const { resetUserPasswordAndAudit } = await import(
    "../src/lib/user-management-mutation.ts"
  );

  prisma = new PrismaClient({
    datasources: { db: { url: disposable.databaseUrl } },
  });

  stage = "seed-disposable-users";
  const oldPasswordHash = await bcrypt.hash("old-password-fixture", 4);
  const newPassword = "new-password-fixture";
  const newPasswordHash = await bcrypt.hash(newPassword, 12);
  const now = new Date(Date.now() + 1_000);
  const actor = await prisma.user.create({
    data: {
      username: "phase6-actor",
      name: "Phase 6 Actor",
      email: "phase6-actor@example.invalid",
      password: oldPasswordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });
  const target = await prisma.user.create({
    data: {
      username: "phase6-target",
      name: "Phase 6 Target",
      email: "phase6-target@example.invalid",
      password: oldPasswordHash,
      role: UserRole.USER,
      status: UserStatus.DISABLED,
    },
  });

  stage = "run-reset-transaction";
  await prisma.$transaction(
    (tx) =>
      resetUserPasswordAndAudit(
        tx,
        actor.id,
        target.id,
        newPasswordHash,
        now,
      ),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  stage = "verify-reset-result";
  const updatedTarget = await prisma.user.findUniqueOrThrow({
    where: { id: target.id },
    select: { password: true, role: true, status: true, updatedAt: true },
  });
  const resetAudit = await prisma.userAuditLog.findFirstOrThrow({
    where: {
      actorUserId: actor.id,
      targetUserId: target.id,
      action: UserAuditAction.PASSWORD_RESET,
    },
    orderBy: { id: "desc" },
    select: { metadata: true },
  });

  if (!(await bcrypt.compare(newPassword, updatedTarget.password))) {
    throw new Error("RESET_HASH_MISMATCH");
  }
  if (
    updatedTarget.role !== UserRole.USER ||
    updatedTarget.status !== UserStatus.DISABLED ||
    !updatedTarget.updatedAt ||
    (target.updatedAt && updatedTarget.updatedAt <= target.updatedAt)
  ) {
    throw new Error("TARGET_SECURITY_STATE_CHANGED");
  }
  if (JSON.stringify(resetAudit.metadata) !== "{}") {
    throw new Error("RESET_AUDIT_METADATA_NOT_EMPTY");
  }

  stage = "verify-rollback";
  const rollbackTarget = await prisma.user.create({
    data: {
      username: "phase6-rollback-target",
      name: "Phase 6 Rollback Target",
      email: "phase6-rollback@example.invalid",
      password: oldPasswordHash,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    },
  });
  let rollbackFailed = false;
  try {
    await prisma.$transaction(
      (tx) =>
        resetUserPasswordAndAudit(
          tx,
          BigInt(999999999999),
          rollbackTarget.id,
          newPasswordHash,
        ),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch {
    rollbackFailed = true;
  }
  const rollbackState = await prisma.user.findUniqueOrThrow({
    where: { id: rollbackTarget.id },
    select: { password: true, updatedAt: true },
  });
  const rollbackAudits = await prisma.userAuditLog.count({
    where: {
      targetUserId: rollbackTarget.id,
      action: UserAuditAction.PASSWORD_RESET,
    },
  });
  if (
    !rollbackFailed ||
    rollbackState.password !== oldPasswordHash ||
    rollbackAudits !== 0
  ) {
    throw new Error("RESET_ROLLBACK_FAILED");
  }

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        databaseWrites: "disposable-only",
        productionMutation: false,
        checks: [
          "disposable PostgreSQL schema was created and removed",
          "DISABLED target password reset preserved role/status",
          "updatedAt security version advanced",
          "PASSWORD_RESET audit persisted with empty metadata",
          "bcrypt hash was verified",
          "foreign-key audit failure rolled back password update",
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
  const failureStage = message.startsWith("DISPOSABLE_SETUP_")
    ? message
    : stage;
  console.error(
    JSON.stringify({
      status: blocked ? "BLOCKED" : "FAILED",
      productionMutation: false,
      stage: failureStage,
      reason: blocked
        ? "Disposable PostgreSQL runtime is unavailable in this environment."
        : "Disposable Reset Password verification failed.",
    }),
  );
  process.exitCode = blocked ? 2 : 1;
} finally {
  await prisma?.$disconnect().catch(() => {});
  await destroyDatabase(disposable);
}
