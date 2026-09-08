import { execFile, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

import bcrypt from "bcryptjs";
import { chromium } from "@playwright/test";

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
const nextBin = resolve(projectRoot, "node_modules/next/dist/bin/next");
const browserRoot = join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const browserPath = (() => {
  try {
    return readdirSync(browserRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium-"))
      .map((entry) => join(browserRoot, entry.name, "chrome-win64", "chrome.exe"))
      .find(existsSync);
  } catch {
    return undefined;
  }
})();

const actorEmail = "phase7-admin-a@example.invalid";
const otherAdminEmail = "phase7-admin-b@example.invalid";
const activeTargetEmail = "phase7-active-target@example.invalid";
const disabledTargetEmail = "phase7-disabled-target@example.invalid";
const actorName = "Phase 7 Admin A";
const otherAdminName = "Phase 7 Admin B";
const activeTargetName = "Phase 7 Active Target";
const disabledTargetName = "Phase 7 Disabled Target";
const actorPassword = "Phase7-admin-a-password-2026!";
const otherAdminPassword = "Phase7-admin-b-password-2026!";
const activeTargetPassword = "Phase7-active-target-password-2026!";
const disabledTargetPassword = "Phase7-disabled-target-password-2026!";

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function runtimeEnvironment(overrides = {}) {
  const allowedNames = new Set([
    "APPDATA",
    "ComSpec",
    "COMSPEC",
    "LOCALAPPDATA",
    "NUMBER_OF_PROCESSORS",
    "OS",
    "PATH",
    "PATHEXT",
    "PROCESSOR_ARCHITECTURE",
    "ProgramData",
    "ProgramFiles",
    "SystemDrive",
    "SystemRoot",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "WINDIR",
  ]);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => allowedNames.has(name)),
  );
  return { ...env, ...overrides };
}

async function run(file, args, options = {}) {
  return execFileAsync(file, args, {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    env: runtimeEnvironment(),
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
  const dataDir = mkdtempSync(join(tmpdir(), "phase7-role-e2e-pg-"));
  const databaseName = `phase7_role_e2e_${process.pid}`;
  const databaseUrl = `postgresql://postgres@${host}:${port}/${databaseName}?schema=public`;
  let postgresProcess = null;
  let setupStage = "initdb";

  try {
    await run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"]);
    setupStage = "start-postgres";
    postgresProcess = spawn(
      postgresExe,
      ["-D", dataDir, "-p", String(port), "-h", host],
      { cwd: projectRoot, env: runtimeEnvironment(), windowsHide: true, stdio: "ignore" },
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
      {
        env: runtimeEnvironment({
          DATABASE_URL: databaseUrl,
          NODE_ENV: "test",
        }),
      },
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

async function stopNext(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  const deadline = Date.now() + 8_000;
  while (child.exitCode === null && Date.now() < deadline) await wait(100);
  if (child.exitCode === null && child.pid) {
    await run("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"]).catch(
      () => {},
    );
  }
}

async function startNext(port, env) {
  const child = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", host, "--port", String(port)],
    { cwd: projectRoot, env, windowsHide: true, stdio: "ignore" },
  );
  child.once("error", () => {});
  const origin = `http://${host}:${port}`;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("NEXT_START_EXITED");
    try {
      const response = await fetch(`${origin}/api/auth/providers`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status === 200) return child;
    } catch {
      // The server is still starting.
    }
    await wait(250);
  }
  await stopNext(child);
  throw new Error("NEXT_START_TIMEOUT");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(page, origin, email, password) {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/dashboard", {
    timeout: 20_000,
  });
}

async function expectLoginFailure(page, origin, email, password) {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByText("Email atau password tidak valid.", { exact: true }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  const body = await page.locator("body").innerText();
  assert(
    !/DATABASE_URL|AUTH_SECRET|PrismaClient|query_engine|password hash/iu.test(body),
    "AUTH_ERROR_DISCLOSURE",
  );
  assert(new URL(page.url()).pathname === "/login", "LOGIN_FAILURE_REDIRECT");
}

async function changeRoleThroughUi(page, origin, targetName, nextRole) {
  let step = "navigate-users";
  try {
    await page.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
    step = "find-target-row";
    const row = page.getByRole("row").filter({ hasText: targetName });
    await row.getByLabel(`Actions for ${targetName}`).click();
    step = "open-change-role";
    await page.getByRole("button", { name: "Change Role", exact: true }).click();
    const dialog = page.getByRole("dialog");
    step = "select-role";
    await dialog.locator("#change-user-role").selectOption(nextRole);
    step = "submit-role";
    await dialog.getByRole("button", { name: "Change Role", exact: true }).click();
    step = "wait-role-success";
    await page.getByText("Role updated successfully.", { exact: true }).waitFor({
      state: "visible",
      timeout: 20_000,
    });
  } catch {
    throw new Error(`UI_ROLE_${step}`);
  }
}

let disposable;
let prisma;
let browser;
let nextProcess;
let stage = "startup";
const contexts = [];

try {
  stage = "check-runtime";
  if (![initdb, postgresExe, pgCtl, pgIsReady, createdb, dropdb].every(existsSync)) {
    throw new Error("DISPOSABLE_POSTGRES_BINARIES_UNAVAILABLE");
  }
  if (!browserPath) throw new Error("BROWSER_UNAVAILABLE");

  stage = "create-disposable-database";
  disposable = await createDatabase();
  const { PrismaClient, UserRole, UserStatus, UserAuditAction } =
    await import("@prisma/client");
  prisma = new PrismaClient({
    datasources: { db: { url: disposable.databaseUrl } },
  });

  stage = "seed-disposable-users";
  const [actorHash, otherAdminHash, activeTargetHash, disabledTargetHash] =
    await Promise.all([
      bcrypt.hash(actorPassword, 12),
      bcrypt.hash(otherAdminPassword, 12),
      bcrypt.hash(activeTargetPassword, 12),
      bcrypt.hash(disabledTargetPassword, 12),
    ]);
  const seedNow = new Date();
  const actor = await prisma.user.create({
    data: {
      username: "phase7-admin-a",
      name: actorName,
      email: actorEmail,
      password: actorHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const otherAdmin = await prisma.user.create({
    data: {
      username: "phase7-admin-b",
      name: otherAdminName,
      email: otherAdminEmail,
      password: otherAdminHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const activeTarget = await prisma.user.create({
    data: {
      username: "phase7-active-target",
      name: activeTargetName,
      email: activeTargetEmail,
      password: activeTargetHash,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const disabledTarget = await prisma.user.create({
    data: {
      username: "phase7-disabled-target",
      name: disabledTargetName,
      email: disabledTargetEmail,
      password: disabledTargetHash,
      role: UserRole.USER,
      status: UserStatus.DISABLED,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });

  stage = "start-disposable-next";
  const runtimePort = await freePort();
  const origin = `http://${host}:${runtimePort}`;
  const runtimeEnv = runtimeEnvironment({
    NODE_ENV: "production",
    DATABASE_URL: disposable.databaseUrl,
    DASHBOARD_DATA_SOURCE: "postgres",
    AUTH_SECRET: randomBytes(32).toString("base64url"),
    AUTH_URL: origin,
    NEXTAUTH_URL: origin,
    AUTH_TRUST_HOST: "true",
    NEXT_PUBLIC_APP_URL: origin,
    CRON_SECRET: randomBytes(24).toString("base64url"),
    NEXT_TELEMETRY_DISABLED: "1",
  });
  nextProcess = await startNext(runtimePort, runtimeEnv);

  stage = "run-role-auth-lifecycle-e2e";
  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const adminContext = await browser.newContext();
  const activeUserContext = await browser.newContext();
  const otherAdminContext = await browser.newContext();
  contexts.push(adminContext, activeUserContext, otherAdminContext);
  const adminPage = await adminContext.newPage();
  const activeUserPage = await activeUserContext.newPage();
  const otherAdminPage = await otherAdminContext.newPage();

  await login(adminPage, origin, actorEmail, actorPassword);
  await login(activeUserPage, origin, activeTargetEmail, activeTargetPassword);
  await login(otherAdminPage, origin, otherAdminEmail, otherAdminPassword);

  stage = "promote-active-user-through-ui";
  const activeBefore = await prisma.user.findUniqueOrThrow({
    where: { id: activeTarget.id },
    select: { role: true, status: true, updatedAt: true },
  });
  await changeRoleThroughUi(adminPage, origin, activeTargetName, "ADMIN");
  const activeAfter = await prisma.user.findUniqueOrThrow({
    where: { id: activeTarget.id },
    select: { role: true, status: true, updatedAt: true },
  });
  const activeAudit = await prisma.userAuditLog.findFirstOrThrow({
    where: {
      actorUserId: actor.id,
      targetUserId: activeTarget.id,
      action: UserAuditAction.ROLE_CHANGED,
    },
    orderBy: { id: "desc" },
    select: { metadata: true },
  });
  assert(activeBefore.role === UserRole.USER && activeAfter.role === UserRole.ADMIN, "ACTIVE_USER_PROMOTION_FAILED");
  assert(activeAfter.status === UserStatus.ACTIVE, "ACTIVE_USER_STATUS_CHANGED");
  assert(activeAfter.updatedAt > activeBefore.updatedAt, "ACTIVE_USER_VERSION_NOT_ADVANCED");
  assert(
    activeAudit.metadata?.fromRole === "USER" && activeAudit.metadata?.toRole === "ADMIN",
    "ACTIVE_USER_AUDIT_INVALID",
  );

  stage = "verify-promoted-user-session-invalidation";
  await activeUserPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
  assert(new URL(activeUserPage.url()).pathname === "/login", "OLD_USER_SESSION_REMAINED_VALID");
  const promotedUserContext = await browser.newContext();
  contexts.push(promotedUserContext);
  const promotedUserPage = await promotedUserContext.newPage();
  await login(promotedUserPage, origin, activeTargetEmail, activeTargetPassword);
  await promotedUserPage.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
  assert(new URL(promotedUserPage.url()).pathname === "/pengaturan/users", "PROMOTED_USER_LACKS_ADMIN_ACCESS");

  stage = "demote-admin-through-ui";
  await changeRoleThroughUi(adminPage, origin, otherAdminName, "USER");
  const demoted = await prisma.user.findUniqueOrThrow({
    where: { id: otherAdmin.id },
    select: { role: true, status: true },
  });
  assert(demoted.role === UserRole.USER, "ADMIN_DEMOTION_FAILED");
  assert(demoted.status === UserStatus.ACTIVE, "ADMIN_DEMOTION_STATUS_CHANGED");

  stage = "verify-demoted-admin-session-invalidation";
  await otherAdminPage.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
  assert(new URL(otherAdminPage.url()).pathname === "/login", "OLD_ADMIN_SESSION_REMAINED_VALID");
  const demotedContext = await browser.newContext();
  contexts.push(demotedContext);
  const demotedPage = await demotedContext.newPage();
  await login(demotedPage, origin, otherAdminEmail, otherAdminPassword);
  await demotedPage.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
  await demotedPage
    .waitForURL((url) => url.pathname === "/dashboard", { timeout: 20_000 })
    .catch(() => {});
  assert(
    new URL(demotedPage.url()).pathname === "/dashboard",
    "DEMOTED_USER_RETAINED_ADMIN_ACCESS",
  );

  stage = "change-disabled-target-role-through-ui";
  await changeRoleThroughUi(adminPage, origin, disabledTargetName, "ADMIN");
  const disabledAfter = await prisma.user.findUniqueOrThrow({
    where: { id: disabledTarget.id },
    select: { role: true, status: true },
  });
  assert(disabledAfter.role === UserRole.ADMIN, "DISABLED_TARGET_ROLE_CHANGE_FAILED");
  assert(disabledAfter.status === UserStatus.DISABLED, "DISABLED_TARGET_WAS_ENABLED");
  const disabledLoginContext = await browser.newContext();
  contexts.push(disabledLoginContext);
  const disabledLoginPage = await disabledLoginContext.newPage();
  await expectLoginFailure(disabledLoginPage, origin, disabledTargetEmail, disabledTargetPassword);

  stage = "verify-final-audit-and-invariant";
  const activeAdminCount = await prisma.user.count({
    where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
  });
  const roleAudits = await prisma.userAuditLog.count({
    where: { action: UserAuditAction.ROLE_CHANGED },
  });
  assert(activeAdminCount >= 1, "LAST_ACTIVE_ADMIN_INVARIANT_FAILED");
  assert(roleAudits === 3, "ROLE_CHANGED_AUDIT_COUNT_INVALID");

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        browserE2E: "PASS",
        databaseWrites: "disposable-only",
        productionMutation: false,
        checks: [
          "ACTIVE USER became ADMIN through Change Role UI",
          "old USER session was invalidated and new ADMIN session reached User Management",
          "ADMIN became USER through Change Role UI",
          "old ADMIN session was invalidated and re-authenticated USER was denied User Management",
          "DISABLED USER became DISABLED ADMIN without login access",
          "ROLE_CHANGED audit rows and metadata were persisted",
          "active administrator invariant remained true",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  const blocked =
    message === "DISPOSABLE_POSTGRES_BINARIES_UNAVAILABLE" ||
    message === "BROWSER_UNAVAILABLE";
  console.error(
    JSON.stringify({
      status: blocked ? "BLOCKED" : "FAILED",
      productionMutation: false,
      stage: message.startsWith("DISPOSABLE_SETUP_") ? message : stage,
      detail: /^(UI_ROLE_|[A-Za-z0-9_]+$)/.test(message)
        ? message
        : "UNSPECIFIED",
      reason: blocked
        ? "Disposable runtime or browser tooling is unavailable."
        : "Role Management Auth.js lifecycle verification failed.",
    }),
  );
  process.exitCode = blocked ? 2 : 1;
} finally {
  for (const context of contexts.reverse()) await context.close().catch(() => {});
  await browser?.close().catch(() => {});
  await stopNext(nextProcess);
  await prisma?.$disconnect().catch(() => {});
  await destroyDatabase(disposable);
}
