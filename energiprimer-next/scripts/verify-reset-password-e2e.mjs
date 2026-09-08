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

const activeTargetEmail = "phase6r-active@example.invalid";
const disabledTargetEmail = "phase6r-disabled@example.invalid";
const actorEmail = "phase6r-admin@example.invalid";
const activeTargetName = "Phase 6R Active Target";
const disabledTargetName = "Phase 6R Disabled Target";
const activeOldPassword = "Phase6R-active-old-2026!";
const activeNewPassword = "Phase6R-active-new-2026!";
const disabledOldPassword = "Phase6R-disabled-old-2026!";
const disabledNewPassword = "Phase6R-disabled-new-2026!";
const actorPassword = "Phase6R-admin-password-2026!";

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
  const dataDir = mkdtempSync(join(tmpdir(), "phase6r-reset-e2e-pg-"));
  const databaseName = `phase6r_reset_e2e_${process.pid}`;
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

async function resetThroughUi(page, origin, targetName, newPassword) {
  let step = "navigate-users";
  const events = [];
  const onRequest = (request) => {
    if (request.method() === "POST") {
      const hasActionHeader = Boolean(request.headers()["next-action"]);
      events.push(
        `REQ_${new URL(request.url()).pathname.replaceAll("/", "_")}_${hasActionHeader ? "ACTION" : "FORM"}`,
      );
    }
  };
  const onResponse = (response) => {
    if (response.request().method() === "POST") {
      events.push(`RES_${response.status()}`);
    }
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  try {
    await page.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
    step = "find-target-row";
    const row = page.getByRole("row").filter({ hasText: targetName });
    step = "open-actions";
    await row.getByLabel(`Actions for ${targetName}`).click();
    step = "open-reset-dialog";
    await page.getByRole("button", { name: "Reset Password", exact: true }).click();
    const dialog = page.getByRole("dialog");
    step = "fill-new-password";
    await dialog.locator("#reset-user-password").fill(newPassword);
    step = "fill-confirm-password";
    await dialog.locator("#reset-user-confirm-password").fill(newPassword);
    step = "submit-reset";
    await dialog.getByRole("button", { name: "Reset Password", exact: true }).click();
    step = "wait-reset-success";
    const feedback = page.getByText("Password reset successfully.", { exact: true });
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if ((await feedback.count()) > 0) {
        return events.join("_") || "NO_EVENT";
      }
      if ((await page.getByRole("dialog").count()) === 0) {
        const pathname = new URL(page.url()).pathname;
        if (pathname !== "/pengaturan/users") {
          throw new Error(`UI_RESET_NAV_${pathname.replaceAll("/", "_")}`);
        }
        return events.join("_") || "NO_EVENT";
      }
      await wait(250);
    }
    throw new Error("UI_RESET_SUCCESS_NOT_OBSERVED");
  } catch {
    throw new Error(`UI_RESET_${step}`);
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
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
  const [actorHash, activeHash, disabledHash] = await Promise.all([
    bcrypt.hash(actorPassword, 12),
    bcrypt.hash(activeOldPassword, 12),
    bcrypt.hash(disabledOldPassword, 12),
  ]);
  const seedNow = new Date();
  const actor = await prisma.user.create({
    data: {
      username: "phase6r-admin",
      name: "Phase 6R Admin",
      email: actorEmail,
      password: actorHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const activeTarget = await prisma.user.create({
    data: {
      username: "phase6r-active",
      name: activeTargetName,
      email: activeTargetEmail,
      password: activeHash,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  });
  const disabledTarget = await prisma.user.create({
    data: {
      username: "phase6r-disabled",
      name: disabledTargetName,
      email: disabledTargetEmail,
      password: disabledHash,
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

  stage = "run-auth-lifecycle-e2e";
  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const targetContext = await browser.newContext();
  const adminContext = await browser.newContext();
  contexts.push(targetContext, adminContext);
  const targetPage = await targetContext.newPage();
  const adminPage = await adminContext.newPage();

  await login(targetPage, origin, activeTargetEmail, activeOldPassword);
  await login(adminPage, origin, actorEmail, actorPassword);

  stage = "reset-active-target-through-ui";
  const activeBefore = await prisma.user.findUniqueOrThrow({
    where: { id: activeTarget.id },
    select: { password: true, role: true, status: true, updatedAt: true },
  });
  const activeUiEvidence = await resetThroughUi(
    adminPage,
    origin,
    activeTargetName,
    activeNewPassword,
  );
  stage = "read-active-reset-user";
  const activeAfter = await prisma.user.findUniqueOrThrow({
    where: { id: activeTarget.id },
    select: { password: true, role: true, status: true, updatedAt: true },
  });
  stage = "read-active-reset-audit";
  const activeAudits = await prisma.userAuditLog.findMany({
    orderBy: { id: "desc" },
    select: {
      actorUserId: true,
      targetUserId: true,
      action: true,
      metadata: true,
    },
  });
  const activeAudit = activeAudits.find(
    (audit) =>
      audit.actorUserId === actor.id &&
      audit.action === UserAuditAction.PASSWORD_RESET,
  );
  if (!activeAudit) {
    throw new Error(
      `ACTIVE_AUDIT_MISSING_${activeAudits.length}_` +
        `${activeAudits.map((audit) => audit.action).join("_") || "NONE"}_` +
        `TARGET_${activeAudits.some((audit) => audit.targetUserId === activeTarget.id)}_` +
        `NEW_HASH_${await bcrypt.compare(activeNewPassword, activeAfter.password)}_` +
        `OLD_HASH_${await bcrypt.compare(activeOldPassword, activeAfter.password)}_` +
        `UI_${activeUiEvidence}`,
    );
  }
  stage = "assert-active-reset-state";
  assert(await bcrypt.compare(activeNewPassword, activeAfter.password), "ACTIVE_HASH_MISMATCH");
  assert(!await bcrypt.compare(activeOldPassword, activeAfter.password), "OLD_PASSWORD_STILL_VALID");
  assert(activeAfter.role === activeBefore.role && activeAfter.status === activeBefore.status, "ACTIVE_SECURITY_STATE_CHANGED");
  assert(
    Boolean(activeBefore.updatedAt && activeAfter.updatedAt && activeAfter.updatedAt > activeBefore.updatedAt),
    "ACTIVE_SECURITY_VERSION_NOT_ADVANCED",
  );
  assert(JSON.stringify(activeAudit.metadata) === "{}", "ACTIVE_AUDIT_METADATA_NOT_EMPTY");

  stage = "verify-old-session-invalidation";
  await targetPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
  assert(new URL(targetPage.url()).pathname === "/login", "OLD_SESSION_REMAINED_VALID");

  const oldPasswordContext = await browser.newContext();
  contexts.push(oldPasswordContext);
  const oldPasswordPage = await oldPasswordContext.newPage();
  await expectLoginFailure(oldPasswordPage, origin, activeTargetEmail, activeOldPassword);

  const newPasswordContext = await browser.newContext();
  contexts.push(newPasswordContext);
  const newPasswordPage = await newPasswordContext.newPage();
  await login(newPasswordPage, origin, activeTargetEmail, activeNewPassword);

  stage = "reset-disabled-target-through-ui";
  const disabledBefore = await prisma.user.findUniqueOrThrow({
    where: { id: disabledTarget.id },
    select: { password: true, role: true, status: true, updatedAt: true },
  });
  await resetThroughUi(adminPage, origin, disabledTargetName, disabledNewPassword);
  const disabledAfter = await prisma.user.findUniqueOrThrow({
    where: { id: disabledTarget.id },
    select: { password: true, role: true, status: true, updatedAt: true },
  });
  assert(await bcrypt.compare(disabledNewPassword, disabledAfter.password), "DISABLED_HASH_MISMATCH");
  assert(disabledAfter.role === disabledBefore.role && disabledAfter.status === UserStatus.DISABLED, "DISABLED_SECURITY_STATE_CHANGED");
  assert(
    Boolean(disabledBefore.updatedAt && disabledAfter.updatedAt && disabledAfter.updatedAt > disabledBefore.updatedAt),
    "DISABLED_SECURITY_VERSION_NOT_ADVANCED",
  );
  const disabledLoginContext = await browser.newContext();
  contexts.push(disabledLoginContext);
  const disabledLoginPage = await disabledLoginContext.newPage();
  await expectLoginFailure(disabledLoginPage, origin, disabledTargetEmail, disabledNewPassword);

  stage = "verify-stale-admin-session";
  await prisma.user.update({
    where: { id: actor.id },
    data: { updatedAt: new Date(Date.now() + 5_000) },
  });
  await adminPage.goto(`${origin}/pengaturan/users`, { waitUntil: "domcontentloaded" });
  assert(new URL(adminPage.url()).pathname === "/login", "STALE_ADMIN_SESSION_REMAINED_VALID");

  const activeAdminCount = await prisma.user.count({
    where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
  });
  assert(activeAdminCount === 1, "LAST_ADMIN_STATE_CHANGED");

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        browserE2E: "PASS",
        databaseWrites: "disposable-only",
        productionMutation: false,
        checks: [
          "admin reset completed through the User Management UI",
          "active target hash changed and old password was rejected",
          "active target old Auth.js session was invalidated",
          "active target new password created a valid Auth.js session",
          "disabled target reset preserved disabled status and rejected login",
          "PASSWORD_RESET audit metadata remained empty",
          "stale admin session was rejected after security-version change",
          "last active administrator remained intact",
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
      stage,
      detail: /^(UI_RESET_|[A-Za-z0-9_]+$)/.test(message)
        ? message
        : "UNSPECIFIED",
      reason: blocked
        ? "Disposable runtime or browser tooling is unavailable."
        : "Reset Password Auth.js lifecycle verification failed.",
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
