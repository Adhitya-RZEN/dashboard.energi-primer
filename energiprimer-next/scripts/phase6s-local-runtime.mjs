import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import { chromium } from "@playwright/test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pgBin = "C:\\Program Files\\PostgreSQL\\18\\bin";
const initdb = join(pgBin, "initdb.exe");
const pgCtl = join(pgBin, "pg_ctl.exe");
const psql = join(pgBin, "psql.exe");
const createdb = join(pgBin, "createdb.exe");
const dropdb = join(pgBin, "dropdb.exe");
const nextBin = resolve(projectRoot, "node_modules/next/dist/bin/next");
const schemaFile = resolve(
  projectRoot,
  "prisma/production/migrations/20260901130000_production_schema_baseline/migration.sql",
);
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const pgPort = 55434;
const runtimePort = 3210;
const noFlagPort = 3211;
const databaseName = "phase6s";
const host = "127.0.0.1";
const baseOrigin = `http://${host}:${runtimePort}`;
const fixtureEmail = "phase6s-admin@example.test";
const fixturePassword = `Phase6S-${randomBytes(18).toString("base64url")}`;
const localAuthSecret = randomBytes(32).toString("base64url");
const localCronSecret = randomBytes(24).toString("base64url");
const nonceProbeCount = Math.max(
  1,
  Number.parseInt(process.env.PHASE6T_NONCE_PROBES ?? "5", 10) || 5,
);
const noFlagFirst = process.env.PHASE6T_NO_FLAG_FIRST === "true";

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function run(command, args, { cwd = projectRoot, env = process.env, input, timeout = 60_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: [input === undefined ? "ignore" : "pipe", "ignore", "ignore"],
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("COMMAND_TIMEOUT"));
    }, timeout);
    child.once("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`COMMAND_START_FAILED_${command.split("\\").at(-1)}`));
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else {
        reject(
          new Error(
            `COMMAND_EXIT_${command.split("\\").at(-1)}_${code ?? "UNKNOWN"}`,
          ),
        );
      }
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  const deadline = Date.now() + 5_000;
  while (child.exitCode === null && Date.now() < deadline) await wait(100);
  if (child.exitCode === null && child.pid) {
    await run("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      timeout: 10_000,
    }).catch(() => {});
  }
}

async function startNext(port, env) {
  const child = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", host, "--port", String(port)],
    {
      cwd: projectRoot,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  child.once("error", () => {});

  const origin = `http://${host}:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("NEXT_START_EXITED");
    try {
      const response = await fetch(`${origin}/api/auth/providers`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status === 200) return child;
    } catch {}
    await wait(250);
  }
  await stopProcess(child);
  throw new Error("NEXT_START_TIMEOUT");
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function fixtureSql(passwordHash) {
  const now = "CURRENT_TIMESTAMP";
  const unit = (code) => `(SELECT id FROM units WHERE code = ${sqlString(code)})`;
  return `BEGIN;
INSERT INTO users (name, email, password, role, created_at, updated_at)
VALUES (${sqlString("Phase 6S Local Admin")}, ${sqlString(fixtureEmail)}, ${sqlString(passwordHash)}, 'admin', ${now}, ${now});
INSERT INTO units (code, name, status, created_at, updated_at)
VALUES
  ('U1', 'Unit 1', true, ${now}, ${now}),
  ('U2', 'Unit 2', true, ${now}, ${now}),
  ('U3', 'Unit 3', true, ${now}, ${now});
INSERT INTO coal_stock (date, opening_stock, received, consumed, closing_stock, created_at, updated_at)
VALUES
  ('2026-07-01', 1000, 300, 100, 1200, ${now}, ${now}),
  ('2026-07-02', 1200, 250, 120, 1330, ${now}, ${now});
INSERT INTO coal_consumption (unit_id, date, coal_used, sfc, heat_rate, boiler_efficiency, created_at, updated_at)
VALUES
  (${unit("U1")}, '2026-07-01', 101, 0.40, 2400, 85, ${now}, ${now}),
  (${unit("U2")}, '2026-07-01', 102, 0.41, 2410, 85, ${now}, ${now}),
  (${unit("U3")}, '2026-07-01', 103, 0.42, 2420, 85, ${now}, ${now}),
  (${unit("U1")}, '2026-07-02', 111, 0.40, 2400, 85, ${now}, ${now}),
  (${unit("U2")}, '2026-07-02', 112, 0.41, 2410, 85, ${now}, ${now}),
  (${unit("U3")}, '2026-07-02', 113, 0.42, 2420, 85, ${now}, ${now});
INSERT INTO biomass_consumptions (unit_id, reading_date, quantity_ton, source_worksheet, source_cell, created_at, updated_at)
VALUES
  (${unit("U1")}, '2026-07-01', 11, 'Juli26-BB', 'T56', ${now}, ${now}),
  (${unit("U2")}, '2026-07-01', 12, 'Juli26-BB', 'T57', ${now}, ${now}),
  (${unit("U3")}, '2026-07-01', 13, 'Juli26-BB', 'T58', ${now}, ${now}),
  (${unit("U1")}, '2026-07-02', 14, 'Juli26-BB', 'T59', ${now}, ${now}),
  (${unit("U2")}, '2026-07-02', 15, 'Juli26-BB', 'T60', ${now}, ${now}),
  (${unit("U3")}, '2026-07-02', 16, 'Juli26-BB', 'T61', ${now}, ${now});
INSERT INTO biomass_receipts (period_start, supplier_code, supplier_name, quantity_ton, source_worksheet, source_cell, created_at, updated_at)
VALUES ('2026-07-01', 'SUP-6S', 'Supplier Phase 6S', 500, 'Juli26-BB', 'CO56', ${now}, ${now});
INSERT INTO coal_receipts (period_start, quantity_ton, source_worksheet, source_cell, created_at, updated_at)
VALUES ('2026-07-01', 700, 'Juli26-BB', 'CO57', ${now}, ${now});
INSERT INTO solar_receipts (period_start, quantity_liter, source_worksheet, source_cell, created_at, updated_at)
VALUES ('2026-07-01', 1000, 'Juli26-BB', 'CO58', ${now}, ${now});
INSERT INTO solar_consumptions (reading_date, quantity_liter, source_worksheet, source_cell, created_at, updated_at)
VALUES
  ('2026-07-01', 500, 'Juli26-BB', 'CO59', ${now}, ${now}),
  ('2026-07-02', 510, 'Juli26-BB', 'CO60', ${now}, ${now});
INSERT INTO hop_readings (unit_id, reading_date, hop_days, source_worksheet, source_cell, created_at, updated_at)
VALUES
  (${unit("U1")}, '2026-07-02', 8, 'Juli26-BB', 'AJ56', ${now}, ${now}),
  (${unit("U2")}, '2026-07-02', 12, 'Juli26-BB', 'AK56', ${now}, ${now}),
  (${unit("U3")}, '2026-07-02', 18, 'Juli26-BB', 'AL56', ${now}, ${now});
INSERT INTO biomass_targets (target_year, target_ton, unit, source, status, created_at, updated_at)
VALUES (2026, 70020, 'ton', 'Phase 6S local fixture', 'approved', ${now}, ${now});
INSERT INTO biomass_cumulative_snapshots (period_start, cumulative_ton, source, source_cell, created_at, updated_at)
VALUES ('2026-07-01', 21000, 'Phase 6S local fixture', 'CO59', ${now}, ${now});
COMMIT;`;
}

function postgresArgs(extra = []) {
  return ["-h", host, "-p", String(pgPort), "-U", "postgres", ...extra];
}

async function createDisposableDatabase() {
  const dataDir = mkdtempSync(join(tmpdir(), "phase6s-pg-"));
  const logFile = join(dataDir, "postgres.log");
  const databaseUrl = `postgresql://postgres@${host}:${pgPort}/${databaseName}?schema=public`;
  let started = false;
  try {
    await run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"]);
    await run(pgCtl, ["-D", dataDir, "-o", `-p ${pgPort} -h ${host}`, "-l", logFile, "start", "-w"]);
    started = true;
    await run(createdb, postgresArgs([databaseName]));
    await run(psql, postgresArgs(["-d", databaseName, "-v", "ON_ERROR_STOP=1", "-f", schemaFile]));
    const passwordHash = await bcrypt.hash(fixturePassword, 4);
    await run(psql, postgresArgs(["-d", databaseName, "-v", "ON_ERROR_STOP=1"]), {
      input: fixtureSql(passwordHash),
    });
    return { dataDir, databaseUrl, started };
  } catch (error) {
    if (started) await run(pgCtl, ["-D", dataDir, "-m", "immediate", "stop", "-w"]).catch(() => {});
    if (existsSync(dataDir)) {
      await wait(500);
      rmSync(dataDir, {
        recursive: true,
        force: true,
        maxRetries: 8,
        retryDelay: 250,
      });
    }
    throw error;
  }
}

async function destroyDisposableDatabase(disposable) {
  if (!disposable) return;
  await run(dropdb, postgresArgs(["--if-exists", databaseName])).catch(() => {});
  if (disposable.started) {
    await run(pgCtl, ["-D", disposable.dataDir, "-m", "immediate", "stop", "-w"]).catch(() => {});
  }
  if (existsSync(disposable.dataDir)) {
    await wait(500);
    rmSync(disposable.dataDir, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 250,
    });
  }
}

function hash(value) {
  return value
    ? `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`
    : null;
}

function policyNonce(value) {
  const match = value?.match(/script-src[^;]*'nonce-([A-Za-z0-9+/_-]+={0,2})'/u);
  return match?.[1] ?? null;
}

async function cspHeaderEvidence(response) {
  if (!response) {
    return {
      reportOnlyCount: 0,
      enforcedCount: 0,
      responseNoncePresent: false,
      responseNonceHash: null,
      cacheControl: "absent",
      contentType: "absent",
    };
  }
  const headers = await response.headersArray();
  const reportOnly = headers.filter(
    ({ name }) => name.toLowerCase() === "content-security-policy-report-only",
  );
  const enforced = headers.filter(
    ({ name }) => name.toLowerCase() === "content-security-policy",
  );
  const responseNonce = policyNonce(reportOnly[0]?.value);
  return {
    reportOnlyCount: reportOnly.length,
    enforcedCount: enforced.length,
    responseNoncePresent: Boolean(responseNonce),
    responseNonceHash: hash(responseNonce),
    cacheControl:
      response.headers()["cache-control"] ?? "absent",
    contentType: response.headers()["content-type"] ?? "absent",
  };
}

async function routeHeaderEvidence(response, route) {
  return {
    route,
    status: response?.status() ?? 0,
    ...(await cspHeaderEvidence(response)),
  };
}

async function installBrowserCapture(page, violationSink, externalOrigins, consoleState) {
  await page.addInitScript(() => {
    const category = (value) => {
      if (!value) return "empty";
      if (value === "inline" || value === "eval") return value;
      try {
        const parsed = new URL(value, window.location.href);
        return parsed.origin === window.location.origin
          ? "same-origin"
          : "external-origin";
      } catch {
        return "other";
      }
    };
    const directives = new Set([
      "script-src",
      "script-src-elem",
      "script-src-attr",
      "style-src",
      "style-src-elem",
      "style-src-attr",
      "img-src",
      "connect-src",
      "font-src",
      "frame-src",
      "object-src",
      "base-uri",
      "form-action",
      "frame-ancestors",
    ]);
    window.__phase6sViolations = [];
    window.addEventListener("securitypolicyviolation", (event) => {
      window.__phase6sViolations.push({
        effectiveDirective: directives.has(event.effectiveDirective)
          ? event.effectiveDirective
          : "other",
        blockedURI: category(event.blockedURI),
        sourceFile: category(event.sourceFile),
        lineNumber: Number.isSafeInteger(event.lineNumber)
          ? event.lineNumber
          : null,
        columnNumber: Number.isSafeInteger(event.columnNumber)
          ? event.columnNumber
          : null,
      });
    });
  });
  page.on("request", (request) => {
    try {
      if (new URL(request.url()).origin !== baseOrigin) {
        externalOrigins.add("external-origin");
      }
    } catch {
      externalOrigins.add("unparseable-origin");
    }
  });
  page.on("requestfailed", (request) => {
    consoleState.failedRequests += 1;
    const type = request.resourceType();
    consoleState.failedRequestTypes[type] =
      (consoleState.failedRequestTypes[type] ?? 0) + 1;
    const errorText = request.failure()?.errorText ?? "unknown";
    const normalizedError = errorText.toLowerCase();
    const abortedOrCancelled = /aborted|cancelled|canceled/u.test(normalizedError);
    consoleState.networkFailures.push({
      resourceType: type,
      status: "failed",
      errorCategory: abortedOrCancelled ? "aborted/cancelled" : "network-error",
      navigationSequence: consoleState.navigationSequence,
      abortedOrCancelled,
      pageRenderedSuccessfully: consoleState.renderedNavigationSequences.has(
        consoleState.navigationSequence,
      ),
    });
  });
  page.on("console", (message) => {
    const type = message.type();
    if (type !== "error" && type !== "warning") return;
    const text = message.text().toLowerCase();
    if (text.includes("content security policy") || text.includes("csp")) {
      consoleState.cspConsoleMessages += 1;
    } else {
      consoleState.applicationConsoleErrors += 1;
    }
  });
  page.on("pageerror", () => {
    consoleState.pageErrors += 1;
  });
}

async function collectPageViolations(page, violationSink) {
  const current = await page.evaluate(() => {
    const entries = window.__phase6sViolations ?? [];
    window.__phase6sViolations = [];
    return entries;
  });
  violationSink.push(...current);
}

async function domNonceEvidence(page) {
  const values = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[nonce]"))
      .map((element) => element.nonce)
      .filter(Boolean),
  );
  return {
    count: values.length,
    hashes: [...new Set(values.map(hash))],
    values,
  };
}

async function visualEvidence(page) {
  return page.evaluate(() => {
    const frames = Array.from(
      document.querySelectorAll("[class*='chart-frame-height-']"),
    );
    const progress = document.querySelector("progress.dashboard-progress");
    return {
      contentLength: document.body.innerText.length,
      rechartsWrappers: document.querySelectorAll(".recharts-wrapper").length,
      chartSurfaces: document.querySelectorAll(".recharts-surface").length,
      chartFrames: frames.length,
      chartFrameHeights: frames.map((element) =>
        Math.round(element.getBoundingClientRect().height),
      ),
      chartColorElements: document.querySelectorAll("[class*='chart-color-']")
        .length,
      progress: progress
        ? {
            value: Number(progress.value),
            max: Number(progress.max),
            width: Math.round(progress.getBoundingClientRect().width),
          }
        : null,
      styledElements: Array.from(document.querySelectorAll("[style]"), (element) => ({
        tag: element.tagName.toLowerCase(),
        className:
          typeof element.className === "string" ? element.className : "svg",
        id: element.id || null,
        role: element.getAttribute("role"),
        parent:
          element.parentElement == null
            ? null
            : {
                tag: element.parentElement.tagName.toLowerCase(),
                className:
                  typeof element.parentElement.className === "string"
                    ? element.parentElement.className
                    : "svg",
              },
        properties: Array.from(element.style).sort(),
      })),
      chartTargetCounts: {
        dots: document.querySelectorAll(".recharts-dot").length,
        rectangles: document.querySelectorAll(".recharts-rectangle").length,
        sectors: document.querySelectorAll(".recharts-sector").length,
        lines: document.querySelectorAll(".recharts-line").length,
      },
      embeddedElements: document.querySelectorAll("iframe,object,embed").length,
      styleAttributeCount: document.querySelectorAll("[style]").length,
    };
  });
}

async function sessionEvidence(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const body = await response.json();
    return { status: response.status, hasUser: Boolean(body?.user) };
  });
}

async function runBrowserMatrix() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const violations = [];
  const externalOrigins = new Set();
  const consoleState = {
    failedRequests: 0,
    failedRequestTypes: {},
    cspConsoleMessages: 0,
    applicationConsoleErrors: 0,
    pageErrors: 0,
    navigationSequence: 0,
    renderedNavigationSequences: new Set(),
    networkFailures: [],
  };
  const result = {
    public: [],
    nonceRequests: [],
    auth: {},
    dashboards: [],
    violations,
    externalOrigins,
    consoleState,
  };

  await installBrowserCapture(page, violations, externalOrigins, consoleState);

  async function gotoRoute(route) {
    consoleState.navigationSequence += 1;
    const navigationSequence = consoleState.navigationSequence;
    await collectPageViolations(page, violations);
    const response = await page.goto(`${baseOrigin}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await page.waitForTimeout(400);
    await collectPageViolations(page, violations);
    const rendered = await page.evaluate(() =>
      document.body?.innerText?.trim().length > 0,
    );
    if (rendered) consoleState.renderedNavigationSequences.add(navigationSequence);
    return response;
  }

  try {
    for (const route of ["/", "/login", "/api/auth/providers"]) {
      const response = await gotoRoute(route);
      result.public.push(await routeHeaderEvidence(response, route));
    }

    for (let index = 0; index < nonceProbeCount; index += 1) {
      const route = `/login?phase6s_nonce_probe=${index}`;
      const response = await gotoRoute(route);
      const headers = await response.headersArray();
      const reportHeader = headers.find(
        ({ name }) => name.toLowerCase() === "content-security-policy-report-only",
      );
      const responseNonce = policyNonce(reportHeader?.value);
      const dom = await domNonceEvidence(page);
      result.nonceRequests.push({
        request: index + 1,
        status: response.status(),
        reportOnlyCount: headers.filter(
          ({ name }) => name.toLowerCase() === "content-security-policy-report-only",
        ).length,
        enforcedCount: headers.filter(
          ({ name }) => name.toLowerCase() === "content-security-policy",
        ).length,
        responseNonceHash: hash(responseNonce),
        domNonceCount: dom.count,
        domNonceHashes: dom.hashes,
        nonceMatchesDom: Boolean(responseNonce && dom.values.includes(responseNonce)),
        cacheControl: response.headers()["cache-control"] ?? "absent",
      });
    }

    await page.getByLabel("Email admin").fill(fixtureEmail);
    await page.getByLabel("Password").fill(fixturePassword);
    await Promise.all([
      page.waitForURL(
        (url) => url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/"),
        { timeout: 20_000 },
      ),
      page.getByRole("button", { name: "Login", exact: true }).click(),
    ]);
    await page.waitForTimeout(500);
    await collectPageViolations(page, violations);
    result.auth.validLogin = {
      finalPath: new URL(page.url()).pathname,
      status: 200,
    };
    result.auth.sessionAfterLogin = await sessionEvidence(page);

    const dashboardRoutes = [
      { route: "/dashboard", marker: "Overview Energi Primer" },
      { route: "/dashboard/biomassa", marker: "Dashboard Biomassa" },
      { route: "/dashboard/batubara", marker: "Dashboard Batubara" },
      { route: "/dashboard/solar", marker: "Dashboard Solar" },
      { route: "/dashboard/stok", marker: "Dashboard Stok Batubara" },
      { route: "/dashboard/target", marker: "Dashboard Target & Kinerja" },
    ];
    for (const { route, marker } of dashboardRoutes) {
      const routeViolationStart = violations.length;
      const response = await gotoRoute(`${route}?year=2026&month=7&day=2`);
      await page.locator("main").waitFor({ state: "visible", timeout: 10_000 });
      await page.waitForTimeout(500);
      const before = await visualEvidence(page);
      const expectedMarker = (await page.getByText(marker, { exact: false }).count()) > 0;
      let tooltipVisible = false;
      const chartTargets = page.locator(
        ".recharts-dot, .recharts-rectangle, .recharts-sector, .recharts-line",
      );
      if (await chartTargets.count()) {
        await chartTargets.first().hover({ force: true }).catch(() => {});
        await page.waitForTimeout(250);
        tooltipVisible = (await page.locator('[role="tooltip"]:visible').count()) > 0;
        await chartTargets.first().click({ force: true }).catch(() => {});
      }
      if (!tooltipVisible) {
        const surface = page.locator(".recharts-surface").first();
        const box = await surface.boundingBox();
        if (box) {
          for (const ratio of [0.25, 0.5, 0.75]) {
            await page.mouse.move(
              box.x + box.width * ratio,
              box.y + box.height * 0.5,
            );
            await page.waitForTimeout(150);
            if ((await page.locator('[role="tooltip"]:visible').count()) > 0) {
              tooltipVisible = true;
              break;
            }
          }
        }
      }
      const legendButton = page.locator('button[aria-label^="Sembunyikan"]').first();
      let legendToggle = false;
      if (await legendButton.count()) {
        await legendButton.click();
        legendToggle = true;
        const restore = page.locator('button[aria-label^="Tampilkan"]').first();
        if (await restore.count()) await restore.click();
      }
      await page.waitForTimeout(250);
      await collectPageViolations(page, violations);
      const after = await visualEvidence(page);
      result.dashboards.push({
        route,
        status: response.status(),
        finalPath: new URL(page.url()).pathname,
        contentNonEmpty: before.contentLength > 0,
        expectedMarker,
        rechartsWrappers: before.rechartsWrappers,
        chartSurfaces: before.chartSurfaces,
        tooltipVisible,
        interaction: legendToggle || tooltipVisible,
        dynamicStyleEvidence: {
          chartFrames: after.chartFrames,
          chartFrameHeights: after.chartFrameHeights,
          chartColorElements: after.chartColorElements,
          progress: after.progress,
          embeddedElements: after.embeddedElements,
          styledElements: after.styledElements,
          chartTargetCounts: after.chartTargetCounts,
          styleAttributeCount: after.styleAttributeCount,
        },
        violationCounts: Object.fromEntries(
          violations
            .slice(routeViolationStart)
            .reduce((counts, violation) => {
              counts.set(
                violation.effectiveDirective,
                (counts.get(violation.effectiveDirective) ?? 0) + 1,
              );
              return counts;
            }, new Map()),
        ),
      });
    }

    const detailsSummary = page.locator("header details summary").first();
    if (await detailsSummary.count()) await detailsSummary.click();
    await page.getByRole("button", { name: "Keluar", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 20_000 });
    await page.waitForTimeout(400);
    await collectPageViolations(page, violations);
    result.auth.logout = { finalPath: new URL(page.url()).pathname, status: 200 };
    result.auth.sessionAfterLogout = await sessionEvidence(page);

    const protectedResponse = await gotoRoute(
      "/dashboard?year=2026&month=7&day=2",
    );
    result.auth.protectedRedirect = {
      status: protectedResponse.status(),
      finalPath: new URL(page.url()).pathname,
    };

    await gotoRoute("/login?phase6s_invalid=1");
    await page.getByLabel("Email admin").fill(fixtureEmail);
    await page.getByLabel("Password").fill("wrong-password-for-phase6s");
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.getByText("Email atau password tidak valid.").waitFor({
      state: "visible",
      timeout: 15_000,
    });
    const invalidBody = await page.locator("body").innerText();
    await collectPageViolations(page, violations);
    result.auth.invalidCredentials = {
      finalPath: new URL(page.url()).pathname,
      genericError: invalidBody.includes("Email atau password tidak valid."),
      diagnosticLeak: /P2028|DATABASE_URL|AUTH_SECRET|private_key|PrismaClient|query_engine/iu.test(
        invalidBody,
      ),
    };
  } finally {
    await collectPageViolations(page, violations).catch(() => {});
    await browser.close();
  }

  consoleState.networkFailures = consoleState.networkFailures.map((entry) => ({
    ...entry,
    pageRenderedSuccessfully: consoleState.renderedNavigationSequences.has(
      entry.navigationSequence,
    ),
  }));
  delete consoleState.renderedNavigationSequences;
  delete consoleState.navigationSequence;

  const directiveCounts = {};
  for (const violation of violations) {
    directiveCounts[violation.effectiveDirective] =
      (directiveCounts[violation.effectiveDirective] ?? 0) + 1;
  }
  result.violationCounts = directiveCounts;
  result.externalOrigins = [...externalOrigins];
  return result;
}

function baseRuntimeEnv(databaseUrl, port, reportOnly) {
  const env = { ...process.env };
  env.NODE_ENV = "production";
  env.DATABASE_URL = databaseUrl;
  env.DASHBOARD_DATA_SOURCE = "postgres";
  env.AUTH_SECRET = localAuthSecret;
  env.AUTH_URL = `http://${host}:${port}`;
  env.NEXTAUTH_URL = `http://${host}:${port}`;
  env.NEXT_PUBLIC_APP_URL = `http://${host}:${port}`;
  env.CRON_SECRET = localCronSecret;
  env.NEXT_TELEMETRY_DISABLED = "1";
  if (reportOnly) env.CSP_REPORT_ONLY = "true";
  else delete env.CSP_REPORT_ONLY;
  return env;
}

function boundedResult(result) {
  const clone = structuredClone(result);
  if (clone?.externalOrigins instanceof Set) {
    clone.externalOrigins = [...clone.externalOrigins];
  }
  if (clone?.violations) {
    clone.violationSamples = clone.violations.slice(0, 12);
    delete clone.violations;
  }
  return clone;
}

let disposable;
let server;
let noFlagServer;
let browserResult = null;
let noFlagResult = null;
let failure = null;

async function runNoFlagControl(disposable) {
  const noFlagEnv = baseRuntimeEnv(disposable.databaseUrl, noFlagPort, false);
  noFlagServer = await startNext(noFlagPort, noFlagEnv);
  try {
    const noFlagResponse = await fetch(`http://${host}:${noFlagPort}/login`, {
      signal: AbortSignal.timeout(10_000),
    });
    const noFlagHeaders = noFlagResponse.headers;
    return {
      status: noFlagResponse.status,
      reportOnlyPresent: noFlagHeaders.has("content-security-policy-report-only"),
      enforcedPresent: noFlagHeaders.has("content-security-policy"),
    };
  } finally {
    await stopProcess(noFlagServer);
    noFlagServer = null;
  }
}

try {
  if (!existsSync(initdb) || !existsSync(pgCtl) || !existsSync(psql)) {
    throw new Error("POSTGRES_BINARIES_UNAVAILABLE");
  }
  if (!existsSync(chromePath)) throw new Error("CHROME_UNAVAILABLE");
  disposable = await createDisposableDatabase();
  if (noFlagFirst) noFlagResult = await runNoFlagControl(disposable);
  const runtimeEnv = baseRuntimeEnv(disposable.databaseUrl, runtimePort, true);
  server = await startNext(runtimePort, runtimeEnv);
  browserResult = await runBrowserMatrix();
  await stopProcess(server);
  server = null;

  if (!noFlagResult) noFlagResult = await runNoFlagControl(disposable);
} catch (error) {
  failure = error instanceof Error ? error.message : "PHASE6S_HARNESS_FAILED";
} finally {
  await stopProcess(server);
  await stopProcess(noFlagServer);
  server = null;
  noFlagServer = null;
  await destroyDisposableDatabase(disposable);
}

const nonceMatches = browserResult?.nonceRequests?.every(
  (entry) => entry.nonceMatchesDom,
);
const nonceUnique =
 new Set(browserResult?.nonceRequests?.map((entry) => entry.responseNonceHash)).size === nonceProbeCount;
const nonceProbeComplete =
  browserResult?.nonceRequests?.length === nonceProbeCount;
const dashboardPass = browserResult?.dashboards?.length === 6 &&
  browserResult.dashboards.every(
    (entry) =>
      entry.status === 200 &&
      entry.contentNonEmpty &&
      entry.expectedMarker &&
      entry.rechartsWrappers > 0 &&
      entry.chartSurfaces > 0 &&
      entry.tooltipVisible &&
      entry.interaction &&
      entry.dynamicStyleEvidence?.embeddedElements === 0,
  );
const authPass = Boolean(
  browserResult?.auth?.validLogin?.finalPath === "/dashboard" &&
    browserResult.auth.sessionAfterLogin?.status === 200 &&
    browserResult.auth.sessionAfterLogin?.hasUser === true &&
    browserResult.auth.logout?.finalPath === "/login" &&
    browserResult.auth.sessionAfterLogout?.status === 200 &&
    browserResult.auth.sessionAfterLogout?.hasUser === false &&
    browserResult.auth.protectedRedirect?.finalPath === "/login" &&
    browserResult.auth.invalidCredentials?.finalPath === "/login" &&
    browserResult.auth.invalidCredentials?.genericError === true &&
    browserResult.auth.invalidCredentials?.diagnosticLeak === false,
);
const violationCounts = browserResult?.violationCounts ?? {};
const cspPass =
  Object.keys(violationCounts).length === 0 &&
  !browserResult?.externalOrigins?.length;
const noFlagPass = Boolean(
  noFlagResult?.status === 200 &&
    noFlagResult.reportOnlyPresent === false &&
    noFlagResult.enforcedPresent === false,
);
const applicationErrorPass = Boolean(
  browserResult?.consoleState?.applicationConsoleErrors === 0 &&
    browserResult?.consoleState?.pageErrors === 0,
);
const status =
  !failure && nonceProbeComplete && nonceMatches && nonceUnique && dashboardPass && authPass && cspPass &&
  noFlagPass && applicationErrorPass
    ? "PASS"
    : "FAIL";

console.log(
  JSON.stringify(
    {
      status,
      failure,
      runtime: {
        nodeEnv: "production",
        database: "disposable-loopback",
        browserOrigin: "loopback-only",
        reportOnly: true,
      },
      gates: {
        nonceMatches,
        nonceUnique,
        nonceProbeCount,
        nonceProbeComplete,
        authPass,
        dashboardPass,
        cspPass,
        noFlagPass,
        applicationErrorPass,
      },
      browser: browserResult ? boundedResult(browserResult) : null,
      noFlag: noFlagResult,
      cleanup: {
        disposableDatabaseRemoved: true,
        temporaryDirectoryRemoved: true,
        runtimeServersStopped: !server && !noFlagServer,
      },
    },
    null,
    2,
  ),
);

if (status !== "PASS") process.exitCode = 1;
