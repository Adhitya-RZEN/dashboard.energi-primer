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

const actorEmail = "phase9-e2e-admin@example.invalid";
const actorName = "Phase 9 E2E Admin";
const actorPassword = "Phase9-e2e-admin-password-2026!";
const otherAdminEmail = "phase9-e2e-other-admin@example.invalid";
const otherAdminName = "Phase 9 E2E Other Admin";
const otherAdminPassword = "Phase9-e2e-other-admin-password-2026!";
const targetEmail = "phase9-e2e-target@example.invalid";
const targetName = "Phase 9 E2E Target";
const targetPassword = "Phase9-e2e-target-password-2026!";
const targetResetPassword = "Phase9-e2e-target-reset-password-2026!";
const disabledTargetEmail = "phase9-e2e-disabled@example.invalid";
const disabledTargetName = "Phase 9 E2E Disabled Target";
const disabledTargetPassword = "Phase9-e2e-disabled-password-2026!";

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
  const dataDir = mkdtempSync(join(tmpdir(), "phase9-audit-e2e-pg-"));
  const databaseName = `phase9_audit_e2e_${process.pid}`;
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
      { env: runtimeEnvironment({ DATABASE_URL: databaseUrl, NODE_ENV: "test" }) },
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
    await run("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"]).catch(() => {});
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
  await page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 20_000 });
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
  assert(!/DATABASE_URL|AUTH_SECRET|PrismaClient|query_engine|password hash/iu.test(body), "AUTH_ERROR_DISCLOSURE");
  assert(new URL(page.url()).pathname === "/login", "LOGIN_FAILURE_REDIRECT");
}

async function openActions(page, origin, targetName) {
  await page.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
  const row = page.getByRole("row").filter({ hasText: targetName });
  await row.getByLabel(`Actions for ${targetName}`).click();
}

async function addUserThroughUi(page, origin) {
  await page.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add User", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#add-user-username").fill("phase9-added-user");
  await dialog.locator("#add-user-name").fill("Phase 9 Added User");
  await dialog.locator("#add-user-email").fill("phase9-added-user@example.invalid");
  await dialog.locator("#add-user-password").fill("Phase9-added-user-password-2026!");
  await dialog.locator("#add-user-confirm-password").fill("Phase9-added-user-password-2026!");
  await dialog.locator("#add-user-role").selectOption("USER");
  await dialog.getByRole("button", { name: "Create User", exact: true }).click();
  await page.getByText("User created successfully.", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
}

async function resetThroughUi(page, origin, targetName) {
  await openActions(page, origin, targetName);
  await page.getByRole("button", { name: "Reset Password", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#reset-user-password").fill(targetResetPassword);
  await dialog.locator("#reset-user-confirm-password").fill(targetResetPassword);
  await dialog.getByRole("button", { name: "Reset Password", exact: true }).click();
  await page.getByText("Password reset successfully.", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
}

async function changeRoleThroughUi(page, origin, targetName, nextRole) {
  await openActions(page, origin, targetName);
  await page.getByRole("button", { name: "Change Role", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#change-user-role").selectOption(nextRole);
  await dialog.getByRole("button", { name: "Change Role", exact: true }).click();
  await page.getByText("Role updated successfully.", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
}

async function changeStatusThroughUi(page, origin, targetName, desiredStatus) {
  const actionLabel = desiredStatus === "DISABLED" ? "Disable User" : "Enable User";
  await openActions(page, origin, targetName);
  await page.getByRole("button", { name: actionLabel, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: actionLabel, exact: true }).click();
  await page.getByText(
    desiredStatus === "DISABLED" ? "User disabled successfully." : "User enabled successfully.",
    { exact: true },
  ).waitFor({ state: "visible", timeout: 20_000 });
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
  const { PrismaClient, UserAuditAction, UserRole, UserStatus } = await import("@prisma/client");
  prisma = new PrismaClient({ datasources: { db: { url: disposable.databaseUrl } } });

  stage = "seed-disposable-users";
  const [actorHash, otherAdminHash, targetHash, disabledTargetHash] = await Promise.all([
    bcrypt.hash(actorPassword, 12),
    bcrypt.hash(otherAdminPassword, 12),
    bcrypt.hash(targetPassword, 12),
    bcrypt.hash(disabledTargetPassword, 12),
  ]);
  const seedNow = new Date(Date.now() - 60_000);
  await prisma.user.create({
    data: {
      username: "phase9-e2e-admin",
      name: actorName,
      email: actorEmail,
      password: actorHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  await prisma.user.create({
    data: {
      username: "phase9-e2e-other-admin",
      name: otherAdminName,
      email: otherAdminEmail,
      password: otherAdminHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const target = await prisma.user.create({
    data: {
      username: "phase9-e2e-target",
      name: targetName,
      email: targetEmail,
      password: targetHash,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  await prisma.user.create({
    data: {
      username: "phase9-e2e-disabled",
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
  nextProcess = await startNext(runtimePort, runtimeEnvironment({
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
  }));

  stage = "browser-session-setup";
  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const actorContext = await browser.newContext();
  const targetContext = await browser.newContext();
  const otherAdminContext = await browser.newContext();
  contexts.push(actorContext, targetContext, otherAdminContext);
  const actorPage = await actorContext.newPage();
  const targetPage = await targetContext.newPage();
  const otherAdminPage = await otherAdminContext.newPage();
  await login(actorPage, origin, actorEmail, actorPassword);
  await login(targetPage, origin, targetEmail, targetPassword);
  await login(otherAdminPage, origin, otherAdminEmail, otherAdminPassword);

  stage = "add-user-through-ui";
  await addUserThroughUi(actorPage, origin);
  stage = "reset-password-through-ui";
  await resetThroughUi(actorPage, origin, targetName);
  stage = "verify-password-reset-session";
  await targetPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
  assert(new URL(targetPage.url()).pathname === "/login", "password reset invalidated old target session");
  await expectLoginFailure(targetPage, origin, targetEmail, targetPassword);
  const targetFreshContext = await browser.newContext();
  contexts.push(targetFreshContext);
  const targetFreshPage = await targetFreshContext.newPage();
  stage = "login-target-after-password-reset";
  await login(targetFreshPage, origin, targetEmail, targetResetPassword);

  stage = "promote-target-through-ui";
  await changeRoleThroughUi(actorPage, origin, targetName, "ADMIN");
  stage = "verify-promotion-session";
  await targetFreshPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
  assert(new URL(targetFreshPage.url()).pathname === "/login", "role promotion invalidated old target USER session");
  const targetAdminContext = await browser.newContext();
  contexts.push(targetAdminContext);
  const targetAdminPage = await targetAdminContext.newPage();
  stage = "login-target-after-promotion";
  await login(targetAdminPage, origin, targetEmail, targetResetPassword);
  stage = "verify-promoted-admin-access";
  await targetAdminPage.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
  assert(new URL(targetAdminPage.url()).pathname === "/pengaturan/users", "fresh promoted target lacks ADMIN access");

  stage = "demote-target-through-ui";
  await changeRoleThroughUi(actorPage, origin, targetName, "USER");
  stage = "verify-demotion-session";
  await targetAdminPage.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
  assert(new URL(targetAdminPage.url()).pathname !== "/pengaturan/users", "role demotion retained old ADMIN access");
  stage = "login-target-after-demotion";
  await login(targetFreshPage, origin, targetEmail, targetResetPassword);

  stage = "disable-target-through-ui";
  await changeStatusThroughUi(actorPage, origin, targetName, "DISABLED");
  stage = "verify-disabled-target-session";
  await targetFreshPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
  assert(new URL(targetFreshPage.url()).pathname === "/login", "disable invalidated old target session");
  await expectLoginFailure(targetFreshPage, origin, targetEmail, targetResetPassword);
  stage = "enable-target-through-ui";
  await changeStatusThroughUi(actorPage, origin, targetName, "ACTIVE");
  const reenabledTargetState = await prisma.user.findUniqueOrThrow({
    where: { id: target.id },
    select: { role: true, status: true, password: true },
  });
  assert(
    reenabledTargetState.role === UserRole.USER &&
      reenabledTargetState.status === UserStatus.ACTIVE &&
      await bcrypt.compare(targetResetPassword, reenabledTargetState.password),
    "reenabled target database state is active, USER, and password-valid",
  );
  const reenabledTargetContext = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": "10.0.0.9" },
  });
  contexts.push(reenabledTargetContext);
  const reenabledTargetPage = await reenabledTargetContext.newPage();
  stage = "login-target-after-enable";
  await login(reenabledTargetPage, origin, targetEmail, targetResetPassword);

  stage = "disable-admin-through-ui";
  await changeStatusThroughUi(actorPage, origin, otherAdminName, "DISABLED");
  stage = "verify-disabled-admin-session";
  await otherAdminPage.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
  assert(new URL(otherAdminPage.url()).pathname === "/login", "disabled ADMIN session retained access");
  await expectLoginFailure(otherAdminPage, origin, otherAdminEmail, otherAdminPassword);
  stage = "enable-admin-through-ui";
  await changeStatusThroughUi(actorPage, origin, otherAdminName, "ACTIVE");
  const reenabledAdminContext = await browser.newContext();
  contexts.push(reenabledAdminContext);
  const reenabledAdminPage = await reenabledAdminContext.newPage();
  stage = "login-admin-after-enable";
  await login(reenabledAdminPage, origin, otherAdminEmail, otherAdminPassword);
  stage = "verify-reenabled-admin-access";
  await reenabledAdminPage.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
  assert(new URL(reenabledAdminPage.url()).pathname === "/pengaturan/users", "reenabled ADMIN lacks fresh access");

  stage = "verify-audit-log-admin-read";
  await actorPage.goto(`${origin}/pengaturan/audit-log`, { waitUntil: "domcontentloaded" });
  await actorPage.getByRole("heading", { name: "Audit Log", exact: true }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await actorPage.locator('select[name="action"]').waitFor({ state: "visible", timeout: 20_000 });
  const auditBody = await actorPage.locator("body").innerText();
  assert(auditBody.includes("Audit Log"), "ADMIN can render Audit Log page");
  for (const action of [
    "USER_CREATED",
    "PASSWORD_RESET",
    "ROLE_CHANGED",
    "USER_ENABLED",
    "USER_DISABLED",
  ]) {
    if (!auditBody.includes(action)) {
      const diagnostic = auditBody
        .replace(/Phase9-[A-Za-z0-9!_-]+/g, "[redacted]")
        .replace(/\s+/g, " ")
        .slice(0, 600);
      throw new Error(`AUDIT_ACTION_MISSING_${action}_${diagnostic}`);
    }
  }
  assert(auditBody.includes(actorName) && auditBody.includes(targetName), "Audit Log renders safe actor and target identities");
  assert(!/Phase9-(?:e2e-admin-password|e2e-other-admin-password|e2e-target-password|e2e-target-reset-password|e2e-disabled-password)|AUTH_SECRET|DATABASE_URL|query_engine/iu.test(auditBody), "Audit Log does not render credentials or session material");

  await actorPage.locator('select[name="action"]').selectOption("ROLE_CHANGED");
  await actorPage.getByRole("button", { name: "Terapkan filter", exact: true }).click();
  await actorPage.waitForURL((url) => url.searchParams.get("action") === "ROLE_CHANGED", { timeout: 20_000 });
  const filteredRows = await actorPage.locator("table tbody tr").count();
  assert(filteredRows === 2, "Audit Log action filter returns both role changes only");
  assert(!(await actorPage.locator("table tbody").innerText()).includes("USER_CREATED"), "Audit Log filter excludes other actions");

  await actorPage.goto(`${origin}/pengaturan/audit-log?page=2&pageSize=2`, { waitUntil: "domcontentloaded" });
  await actorPage.getByRole("heading", { name: "Audit Log", exact: true }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await actorPage.locator("table").waitFor({ state: "visible", timeout: 20_000 });
  const pagedBody = await actorPage.locator("body").innerText();
  if (!pagedBody.includes("halaman 2")) {
    throw new Error(`AUDIT_PAGINATION_STATE_${pagedBody.replace(/Phase9-[A-Za-z0-9!_-]+/g, "[redacted]").replace(/\s+/g, " ").slice(0, 500)}`);
  }
  assert(await actorPage.locator("table tbody tr").count() <= 2, "Audit Log page size is bounded");

  stage = "verify-audit-log-denials-and-logout";
  const finalTargetState = await prisma.user.findUniqueOrThrow({
    where: { id: target.id },
    select: { role: true, status: true },
  });
  assert(
    finalTargetState.role === UserRole.USER && finalTargetState.status === UserStatus.ACTIVE,
    "final target state is ACTIVE USER before Audit Log denial check",
  );
  await reenabledTargetPage.goto(`${origin}/pengaturan/audit-log`, { waitUntil: "domcontentloaded" });
  await wait(500);
  const targetSession = await reenabledTargetPage.evaluate(async () => {
    const response = await fetch("/api/auth/session");
    return response.json();
  });
  assert(
    targetSession?.user?.role === "USER",
    `ACTIVE USER session role is ${String(targetSession?.user?.role ?? "MISSING")}`,
  );
  assert(new URL(reenabledTargetPage.url()).pathname !== "/pengaturan/audit-log", "ACTIVE USER is denied Audit Log server-side");
  assert(!(await reenabledTargetPage.locator("body").innerText()).includes("Audit Log"), "ACTIVE USER navigation omits Audit Log");
  await actorPage.locator("summary").first().click();
  await actorPage.getByRole("button", { name: "Keluar", exact: true }).first().click();
  await actorPage.waitForURL((url) => url.pathname === "/login", { timeout: 20_000 });
  await actorPage.goto(`${origin}/pengaturan/audit-log`, { waitUntil: "domcontentloaded" });
  assert(new URL(actorPage.url()).pathname === "/login", "logout invalidates protected Audit Log access");

  stage = "verify-actual-audit-counts";
  const actionCounts = await prisma.userAuditLog.groupBy({ by: ["action"], _count: { _all: true } });
  const counts = new Map(actionCounts.map((row) => [row.action, row._count._all]));
  assert(counts.get(UserAuditAction.USER_CREATED) === 1, "E2E actual USER_CREATED count is one");
  assert(counts.get(UserAuditAction.PASSWORD_RESET) === 1, "E2E actual PASSWORD_RESET count is one");
  assert(counts.get(UserAuditAction.ROLE_CHANGED) === 2, "E2E actual ROLE_CHANGED count is two");
  assert(counts.get(UserAuditAction.USER_ENABLED) === 2, "E2E actual USER_ENABLED count is two");
  assert(counts.get(UserAuditAction.USER_DISABLED) === 2, "E2E actual USER_DISABLED count is two");

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        browserE2E: "PASS",
        databaseWrites: "disposable-only",
        productionMutation: false,
        productionAuditRead: false,
        checks: [
          "all five mutation types were driven through User Management UI",
          "password reset, role promotion/demotion, status disable/enable, and stale-session rejection passed",
          "ADMIN Audit Log read, action filter, bounded pagination, and safe projection passed",
          "ACTIVE USER, disabled ADMIN login, and post-logout access were denied",
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
      productionAuditRead: false,
      stage: message.startsWith("DISPOSABLE_SETUP_") ? message : stage,
      detail: /password|secret|database_url|query_engine|token|cookie/i.test(message)
        ? "UNSPECIFIED"
        : message.replace(/\s+/g, " ").slice(0, 320),
      reason: blocked
        ? "Disposable runtime, browser, or Next.js build is unavailable."
        : "Audit Log browser and session verification failed.",
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
