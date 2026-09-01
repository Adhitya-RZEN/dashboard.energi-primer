import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isValidAuthEmail,
  normalizeAuthEmail,
  resolveSafeRedirect,
} from "../src/lib/auth-security";
import {
  createPasswordResetToken,
  getPasswordResetUrl,
  isPasswordResetExpired,
  isPasswordResetThrottled,
} from "../src/lib/password-reset";
import { getMailConfigurationStatus } from "../src/lib/mail/index";
import { isAuthorizedCronRequest } from "../src/services/google-sheets/sync/cron-auth";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checks: string[] = [];
const environment = process.env as Record<string, string | undefined>;

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

function expectThrows(action: () => unknown, message: string) {
  try {
    action();
  } catch {
    checks.push(message);
    return;
  }
  throw new Error(message);
}

function readSource(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete environment[name];
  else environment[name] = value;
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

function testPasswordResetPrimitives() {
  const firstToken = createPasswordResetToken();
  const secondToken = createPasswordResetToken();
  const now = new Date("2026-09-01T00:00:00.000Z");

  assert(
    /^[a-f0-9]{64}$/i.test(firstToken),
    "reset token is a 32-byte hexadecimal value",
  );
  assert(firstToken !== secondToken, "reset tokens are not reused by generation");
  assert(
    !isPasswordResetExpired(new Date(now.getTime() - 59 * 60_000), now),
    "reset token is valid before the 60-minute boundary",
  );
  assert(
    isPasswordResetExpired(new Date(now.getTime() - 60 * 60_000), now),
    "reset token expires at the 60-minute boundary",
  );
  assert(
    isPasswordResetExpired(new Date(now.getTime() + 1_000), now),
    "future-dated reset token is rejected",
  );
  assert(
    isPasswordResetThrottled(new Date(now.getTime() - 30_000), now),
    "password reset requests are throttled for the first minute",
  );
  assert(
    !isPasswordResetThrottled(new Date(now.getTime() - 60_000), now),
    "password reset throttle expires at the one-minute boundary",
  );

  const oldAuthUrl = process.env.AUTH_URL;
  const oldPublicUrl = process.env.NEXT_PUBLIC_APP_URL;
  const oldNodeEnv = process.env.NODE_ENV;

  environment.NODE_ENV = "test";
  environment.AUTH_URL = "https://dashboard.example.com";
  const resetUrl = getPasswordResetUrl(firstToken, "admin@example.com");
  assert(
    new URL(resetUrl).origin === "https://dashboard.example.com",
    "reset URL uses the configured application origin",
  );
  assert(
    new URL(resetUrl).searchParams.get("email") === "admin@example.com",
    "reset URL encodes the intended account address",
  );

  delete environment.AUTH_URL;
  environment.NEXT_PUBLIC_APP_URL = "https://public.example.com";
  environment.NODE_ENV = "production";
  expectThrows(
    () => getPasswordResetUrl(firstToken, "admin@example.com"),
    "production reset URL requires server-side AUTH_URL",
  );

  environment.AUTH_URL = "http://dashboard.example.com";
  expectThrows(
    () => getPasswordResetUrl(firstToken, "admin@example.com"),
    "production reset URL requires HTTPS",
  );

  restoreEnvironment("AUTH_URL", oldAuthUrl);
  restoreEnvironment("NEXT_PUBLIC_APP_URL", oldPublicUrl);
  restoreEnvironment("NODE_ENV", oldNodeEnv);
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

function testMailBoundary() {
  const oldMode = process.env.AUTH_MAILER;
  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.RESEND_FROM_EMAIL;

  process.env.AUTH_MAILER = "resend";
  process.env.RESEND_API_KEY = "phase-19-fixture-secret";
  process.env.RESEND_FROM_EMAIL = "Energi Primer <noreply@example.com>";
  const status = getMailConfigurationStatus();
  const serializedStatus = JSON.stringify(status);

  assert(status.resendApiKeyConfigured, "mail status reports configured API key safely");
  assert(status.senderFormatValid, "mail status validates sender format");
  assert(
    !serializedStatus.includes("phase-19-fixture-secret"),
    "mail configuration status does not expose the API key",
  );

  restoreEnvironment("AUTH_MAILER", oldMode);
  restoreEnvironment("RESEND_API_KEY", oldKey);
  restoreEnvironment("RESEND_FROM_EMAIL", oldFrom);
}

function testSourceSecurity() {
  const authSource = readSource("src/auth.ts");
  const resetSource = readSource("src/app/forgot-password/actions.ts");
  const passwordResetSource = readSource("src/lib/password-reset.ts");
  const resetActionSource = readSource("src/app/forgot-password/actions.ts");
  const protectedLayoutSource = readSource("src/app/(protected)/layout.tsx");
  const syncRouteSource = readSource("src/app/api/sync/google-sheets/route.ts");
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
    resetSource.includes("GENERIC_MESSAGE") &&
      resetSource.includes("if (!user) {\n    return { message: GENERIC_MESSAGE };") ,
    "forgot-password response remains enumeration-safe",
  );
  assert(
    passwordResetSource.includes("randomBytes(32)") &&
      passwordResetSource.includes("isPasswordResetExpired") &&
      resetActionSource.includes("passwordResetToken.delete") &&
      resetActionSource.includes("prisma.$transaction"),
    "reset flow retains secure generation, expiry, and invalidation",
  );
  assert(
    passwordResetSource.includes("Development password reset email suppressed") &&
      !passwordResetSource.includes("url: getPasswordResetUrl(token, email)"),
    "reset token is not written to development logs",
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
    nextConfigSource.includes('X-Content-Type-Options') &&
      nextConfigSource.includes('X-Frame-Options') &&
      nextConfigSource.includes('Strict-Transport-Security'),
    "security headers are configured at the Next.js boundary",
  );
}

try {
  testEmailValidation();
  testRedirectSafety();
  testPasswordResetPrimitives();
  testCronSecurity();
  testMailBoundary();
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
  console.error(
    "Auth security verification failed:",
    error instanceof Error ? error.message : "Unknown verification error",
  );
  process.exitCode = 1;
}
