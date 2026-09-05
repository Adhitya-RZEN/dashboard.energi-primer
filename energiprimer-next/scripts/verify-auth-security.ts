import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isValidAuthEmail,
  normalizeAuthEmail,
  resolveSafeRedirect,
} from "../src/lib/auth-security";
import { safeErrorCategory } from "../src/lib/safe-error";
import { isAuthorizedCronRequest } from "../src/services/google-sheets/sync/cron-auth";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checks: string[] = [];

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

function readSource(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8").replace(
    /\r\n?/g,
    "\n",
  );
}

function testEmailValidation() {
  assert(
    normalizeAuthEmail(" Admin@Example.COM ") === "admin@example.com",
    "email normalization is deterministic",
  );
  assert(isValidAuthEmail("admin@example.com"), "valid email is accepted");
  assert(!isValidAuthEmail("admin@localhost"), "host-only email is rejected");
  assert(!isValidAuthEmail("not-an-email"), "malformed email is rejected");
}

function testRedirectSafety() {
  const baseUrl = "https://dashboard.example.com";
  assert(
    resolveSafeRedirect("/dashboard", baseUrl) ===
      "https://dashboard.example.com/dashboard",
    "relative redirect remains on the application origin",
  );
  assert(
    resolveSafeRedirect("https://dashboard.example.com/settings", baseUrl) ===
      "https://dashboard.example.com/settings",
    "same-origin absolute redirect is accepted",
  );
  assert(
    resolveSafeRedirect("https://malicious.example", baseUrl) === baseUrl,
    "foreign-origin redirect falls back to the application origin",
  );
  assert(
    resolveSafeRedirect("//malicious.example", baseUrl) === baseUrl,
    "protocol-relative redirect is rejected",
  );
  assert(
    resolveSafeRedirect("/\\\\malicious.example", baseUrl) === baseUrl,
    "backslash redirect is rejected",
  );
}

function testCronSecurity() {
  const secret = "phase-19-cron-fixture";
  assert(
    isAuthorizedCronRequest(
      new Headers({ authorization: `Bearer ${secret}` }),
      secret,
    ),
    "correct cron bearer secret is accepted",
  );
  assert(
    !isAuthorizedCronRequest(
      new Headers({ authorization: "Bearer wrong-secret" }),
      secret,
    ),
    "wrong cron bearer secret is rejected",
  );
  assert(
    !isAuthorizedCronRequest(new Headers(), secret),
    "missing cron authorization is rejected",
  );
}

function testSourceSecurity() {
  const authSource = readSource("src/auth.ts");
  const loginSource = readSource("src/app/login/page.tsx");
  const protectedLayoutSource = readSource("src/app/(protected)/layout.tsx");
  const proxySource = readSource("src/proxy.ts");
  const syncRouteSource = readSource("src/app/api/sync/google-sheets/route.ts");
  const throttleSource = readSource("src/lib/login-throttle.ts");
  const nextConfigSource = readSource("next.config.ts");

  assert(
    authSource.includes("resolveSafeRedirect") &&
      authSource.includes("redirect({ url, baseUrl })"),
    "Auth.js redirect callback is explicitly origin-safe",
  );
  assert(
    authSource.includes('currentUser.role !== "admin"') &&
      authSource.includes("currentVersion !== tokenVersion"),
    "session authorization revalidates current role and session version",
  );
  assert(
    authSource.includes('strategy: "jwt"') &&
      authSource.includes("maxAge: 120 * 60"),
    "session strategy and two-hour expiration remain explicit",
  );
  assert(
    throttleSource.includes("pg_advisory_xact_lock") &&
      throttleSource.includes("const MAX_ATTEMPTS = 6") &&
      throttleSource.includes("const WINDOW_SECONDS = 60"),
    "login throttle serializes updates while preserving the six-attempt window",
  );
  assert(
    !loginSource.includes("/forgot-password"),
    "login page does not link to the decommissioned password recovery flow",
  );
  assert(
    syncRouteSource.includes("isAuthorizedCronRequest") &&
      syncRouteSource.includes("process.env.CRON_SECRET"),
    "sync endpoint enforces server-side cron authorization",
  );
  assert(
    protectedLayoutSource.includes("await auth()") &&
      protectedLayoutSource.includes('session.user.role !== "admin"'),
    "protected route group repeats server-side authentication and role checks",
  );
  assert(
    proxySource.includes("isProtectedPath(pathname)") &&
      proxySource.includes('request.auth?.user?.role !== "admin"') &&
      proxySource.includes("NextResponse.redirect(loginUrl)"),
    "proxy rejects guest and non-admin requests before protected rendering",
  );
  assert(
    nextConfigSource.includes('X-Content-Type-Options') &&
      nextConfigSource.includes('X-Frame-Options') &&
      nextConfigSource.includes('Strict-Transport-Security'),
    "security headers are configured at the Next.js boundary",
  );
}

try {
  testEmailValidation();
  testRedirectSafety();
  testCronSecurity();
  testSourceSecurity();

  const e2eEnvironmentAvailable = [
    "AUTH_TEST_ADMIN_EMAIL",
    "AUTH_TEST_ADMIN_PASSWORD",
    "AUTH_TEST_SECRET",
    "AUTH_TEST_BASE_URL",
  ].every((name) => Boolean(process.env[name]?.trim()));

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        authE2eEnvironment: e2eEnvironmentAvailable
          ? "AUTH_E2E_ENV_AVAILABLE"
          : "AUTH_E2E_ENV_NOT_AVAILABLE",
        databaseWrites: 0,
        networkRequests: 0,
        checks,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Auth security verification failed.");
  console.error(`Category: ${safeErrorCategory(error)}`);
  process.exitCode = 1;
}
