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

const actorEmail = "phase8-admin-a@example.invalid";
const otherAdminEmail = "phase8-admin-b@example.invalid";
const activeUserEmail = "phase8-active-user@example.invalid";
const disabledUserEmail = "phase8-disabled-user@example.invalid";
const actorName = "Phase 8 Admin A";
const otherAdminName = "Phase 8 Admin B";
const activeUserName = "Phase 8 Active User";
const disabledUserName = "Phase 8 Disabled User";
const actorPassword = "Phase8-admin-a-password-2026!";
const otherAdminPassword = "Phase8-admin-b-password-2026!";
const activeUserPassword = "Phase8-active-user-password-2026!";
const disabledUserPassword = "Phase8-disabled-user-password-2026!";

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
  const dataDir = mkdtempSync(join(tmpdir(), "phase8-status-e2e-pg-"));
  const databaseName = `phase8_status_e2e_${process.pid}`;
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

async function changeStatusThroughUi(page, origin, targetName, desiredStatus) {
  const isDisable = desiredStatus === "DISABLED";
  const actionLabel = isDisable ? "Deactivate" : "Activate";
  let step = "navigate-users";
  try {
    await page.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
    step = "find-target-row";
    const row = page.getByRole("row").filter({ hasText: targetName });
    await row.getByLabel(`Actions for ${targetName}`).click();
    step = "open-status-dialog";
    await page.getByRole("button", { name: actionLabel, exact: true }).click();
    const dialog = page.getByRole("dialog");
    step = "submit-status";
    await dialog.getByRole("button", { name: actionLabel, exact: true }).click();
    step = "wait-status-success";
    await page.getByText(
      isDisable ? "User deactivated successfully." : "User activated successfully.",
      { exact: true },
    ).waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    throw new Error(`UI_STATUS_${step}`);
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
  if (!existsSync(nextBin)) throw new Error("NEXT_BUILD_UNAVAILABLE");

  stage = "create-disposable-database";
  disposable = await createDatabase();
  const { PrismaClient, UserAuditAction, UserRole, UserStatus } =
    await import("@prisma/client");
  prisma = new PrismaClient({
    datasources: { db: { url: disposable.databaseUrl } },
  });

  stage = "seed-disposable-users";
  const [actorHash, otherAdminHash, activeUserHash, disabledUserHash] =
    await Promise.all([
      bcrypt.hash(actorPassword, 12),
      bcrypt.hash(otherAdminPassword, 12),
      bcrypt.hash(activeUserPassword, 12),
      bcrypt.hash(disabledUserPassword, 12),
    ]);
  const seedNow = new Date(Date.now() - 60_000);
  const actor = await prisma.user.create({
    data: {
      username: "phase8-admin-a",
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
      username: "phase8-admin-b",
      name: otherAdminName,
      email: otherAdminEmail,
      password: otherAdminHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const activeUser = await prisma.user.create({
    data: {
      username: "phase8-active-user",
      name: activeUserName,
      email: activeUserEmail,
      password: activeUserHash,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const disabledUser = await prisma.user.create({
    data: {
      username: "phase8-disabled-user",
      name: disabledUserName,
      email: disabledUserEmail,
      password: disabledUserHash,
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

  stage = "run-status-auth-lifecycle-e2e";
  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const adminContext = await browser.newContext();
  const activeUserContext = await browser.newContext();
  const otherAdminContext = await browser.newContext();
  contexts.push(adminContext, activeUserContext, otherAdminContext);
  const adminPage = await adminContext.newPage();
  const activeUserPage = await activeUserContext.newPage();
  const otherAdminPage = await otherAdminContext.newPage();

  await login(adminPage, origin, actorEmail, actorPassword);
  await login(activeUserPage, origin, activeUserEmail, activeUserPassword);
  await login(otherAdminPage, origin, otherAdminEmail, otherAdminPassword);

  stage = "disable-active-user-through-ui";
  const activeBefore = await prisma.user.findUniqueOrThrow({
    where: { id: activeUser.id },
    select: { role: true, status: true, updatedAt: true },
  });
  await changeStatusThroughUi(adminPage, origin, activeUserName, "DISABLED");
  const activeDisabled = await prisma.user.findUniqueOrThrow({
    where: { id: activeUser.id },
    select: { role: true, status: true, updatedAt: true },
  });
  const disableAudit = await prisma.userAuditLog.findFirstOrThrow({
    where: {
      actorUserId: actor.id,
      targetUserId: activeUser.id,
      action: UserAuditAction.USER_DISABLED,
    },
    orderBy: { id: "desc" },
    select: { metadata: true },
  });
  assert(activeDisabled.role === UserRole.USER, "ACTIVE_USER_DISABLE_CHANGED_ROLE");
  assert(activeDisabled.status === UserStatus.DISABLED, "ACTIVE_USER_DISABLE_FAILED");
  assert(activeDisabled.updatedAt > activeBefore.updatedAt, "ACTIVE_USER_DISABLE_VERSION_FAILED");
  assert(
    disableAudit.metadata?.fromStatus === "ACTIVE" &&
      disableAudit.metadata?.toStatus === "DISABLED",
    "ACTIVE_USER_DISABLE_AUDIT_INVALID",
  );

  stage = "verify-disabled-user-session-and-login";
  await activeUserPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
  assert(new URL(activeUserPage.url()).pathname === "/login", "OLD_DISABLED_USER_SESSION_REMAINED_VALID");
  await expectLoginFailure(activeUserPage, origin, activeUserEmail, activeUserPassword);

  stage = "enable-user-through-ui";
  await changeStatusThroughUi(adminPage, origin, disabledUserName, "ACTIVE");
  const disabledEnabled = await prisma.user.findUniqueOrThrow({
    where: { id: disabledUser.id },
    select: { role: true, status: true },
  });
  const enableAudit = await prisma.userAuditLog.findFirstOrThrow({
    where: {
      actorUserId: actor.id,
      targetUserId: disabledUser.id,
      action: UserAuditAction.USER_ENABLED,
    },
    orderBy: { id: "desc" },
    select: { metadata: true },
  });
  assert(disabledEnabled.role === UserRole.USER, "USER_ENABLE_CHANGED_ROLE");
  assert(disabledEnabled.status === UserStatus.ACTIVE, "DISABLED_USER_ENABLE_FAILED");
  assert(
    enableAudit.metadata?.fromStatus === "DISABLED" &&
      enableAudit.metadata?.toStatus === "ACTIVE",
    "USER_ENABLE_AUDIT_INVALID",
  );
  const reenabledContext = await browser.newContext();
  contexts.push(reenabledContext);
  const reenabledPage = await reenabledContext.newPage();
  await login(reenabledPage, origin, disabledUserEmail, disabledUserPassword);

  stage = "disable-admin-through-ui";
  const adminBefore = await prisma.user.findUniqueOrThrow({
    where: { id: otherAdmin.id },
    select: { role: true, status: true, updatedAt: true },
  });
  await changeStatusThroughUi(adminPage, origin, otherAdminName, "DISABLED");
  const adminDisabled = await prisma.user.findUniqueOrThrow({
    where: { id: otherAdmin.id },
    select: { role: true, status: true, updatedAt: true },
  });
  const adminDisableAudit = await prisma.userAuditLog.findFirstOrThrow({
    where: {
      actorUserId: actor.id,
      targetUserId: otherAdmin.id,
      action: UserAuditAction.USER_DISABLED,
    },
    orderBy: { id: "desc" },
    select: { metadata: true },
  });
  assert(adminDisabled.role === UserRole.ADMIN, "ADMIN_DISABLE_CHANGED_ROLE");
  assert(adminDisabled.status === UserStatus.DISABLED, "ADMIN_DISABLE_FAILED");
  assert(adminDisabled.updatedAt > adminBefore.updatedAt, "ADMIN_DISABLE_VERSION_FAILED");
  assert(
    adminDisableAudit.metadata?.fromStatus === "ACTIVE" &&
      adminDisableAudit.metadata?.toStatus === "DISABLED",
    "ADMIN_DISABLE_AUDIT_INVALID",
  );

  stage = "verify-disabled-admin-session-and-login";
  await otherAdminPage.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
  assert(new URL(otherAdminPage.url()).pathname === "/login", "OLD_DISABLED_ADMIN_SESSION_REMAINED_VALID");
  await expectLoginFailure(otherAdminPage, origin, otherAdminEmail, otherAdminPassword);

  stage = "enable-admin-through-ui";
  await changeStatusThroughUi(adminPage, origin, otherAdminName, "ACTIVE");
  const adminEnabled = await prisma.user.findUniqueOrThrow({
    where: { id: otherAdmin.id },
    select: { role: true, status: true },
  });
  const adminEnableAudit = await prisma.userAuditLog.findFirstOrThrow({
    where: {
      actorUserId: actor.id,
      targetUserId: otherAdmin.id,
      action: UserAuditAction.USER_ENABLED,
    },
    orderBy: { id: "desc" },
    select: { metadata: true },
  });
  assert(adminEnabled.role === UserRole.ADMIN, "ADMIN_ENABLE_CHANGED_ROLE");
  assert(adminEnabled.status === UserStatus.ACTIVE, "DISABLED_ADMIN_ENABLE_FAILED");
  assert(
    adminEnableAudit.metadata?.fromStatus === "DISABLED" &&
      adminEnableAudit.metadata?.toStatus === "ACTIVE",
    "ADMIN_ENABLE_AUDIT_INVALID",
  );
  const reenabledAdminContext = await browser.newContext();
  contexts.push(reenabledAdminContext);
  const reenabledAdminPage = await reenabledAdminContext.newPage();
  await login(reenabledAdminPage, origin, otherAdminEmail, otherAdminPassword);
  await reenabledAdminPage.goto(`${origin}/pengaturan/users`, {
    waitUntil: "domcontentloaded",
  });
  assert(new URL(reenabledAdminPage.url()).pathname === "/pengaturan/users", "REENABLED_ADMIN_LACKS_USER_MANAGEMENT_ACCESS");

  stage = "verify-final-audit-and-invariant";
  const activeAdminCount = await prisma.user.count({
    where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
  });
  const enabledAudits = await prisma.userAuditLog.count({
    where: { action: UserAuditAction.USER_ENABLED },
  });
  const disabledAudits = await prisma.userAuditLog.count({
    where: { action: UserAuditAction.USER_DISABLED },
  });
  assert(activeAdminCount >= 1, "LAST_ACTIVE_ADMIN_INVARIANT_FAILED");
  assert(enabledAudits === 2, "USER_ENABLED_AUDIT_COUNT_INVALID");
  assert(disabledAudits === 2, "USER_DISABLED_AUDIT_COUNT_INVALID");

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        browserE2E: "PASS",
        databaseWrites: "disposable-only",
        productionMutation: false,
        checks: [
          "ACTIVE USER was disabled through User Management UI",
          "old USER session was rejected and disabled login failed",
          "USER was enabled and valid-password login succeeded",
          "ACTIVE ADMIN was disabled through User Management UI",
          "old ADMIN session was rejected and disabled login failed",
          "ADMIN was enabled and re-authenticated User Management access succeeded",
          "role preservation, status audits, and active-admin invariant were verified",
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
    message === "BROWSER_UNAVAILABLE" ||
    message === "NEXT_BUILD_UNAVAILABLE";
  console.error(
    JSON.stringify({
      status: blocked ? "BLOCKED" : "FAILED",
      productionMutation: false,
      stage: message.startsWith("DISPOSABLE_SETUP_") ? message : stage,
      detail: /^(UI_STATUS_|[A-Za-z0-9_]+$)/.test(message)
        ? message
        : "UNSPECIFIED",
      reason: blocked
        ? "Disposable runtime, browser, or Next.js build is unavailable."
        : "Account Status Auth.js lifecycle verification failed.",
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
