import { encode } from "next-auth/jwt";
import { safeErrorCategory } from "./safe-error.mjs";

const baseUrl = (
  process.env.AUTH_TEST_BASE_URL || "http://localhost:3000"
).replace(/\/$/, "");
const adminEmail = process.env.AUTH_TEST_ADMIN_EMAIL;
const adminPassword = process.env.AUTH_TEST_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  console.error(
    "AUTH_TEST_ADMIN_EMAIL dan AUTH_TEST_ADMIN_PASSWORD wajib diatur untuk auth verification.",
  );
  process.exit(2);
}

class CookieJar {
  values = new Map();

  update(response) {
    const cookies = response.headers.getSetCookie?.() || [];
    for (const cookie of cookies) {
      const [pair] = cookie.split(";", 1);
      const separator = pair.indexOf("=");
      if (separator > 0) {
        this.values.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    }
  }

  header() {
    return [...this.values.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

async function request(path, options = {}, jar = new CookieJar()) {
  const headers = new Headers(options.headers);
  const cookie = jar.header();
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    redirect: "manual",
  });
  jar.update(response);
  return response;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function csrf(jar) {
  const response = await request("/api/auth/csrf", {}, jar);
  assert(response.ok, `CSRF endpoint failed with ${response.status}`);
  const body = await response.json();
  assert(typeof body.csrfToken === "string", "CSRF token missing");
  return body.csrfToken;
}

async function credentialsCallback({ email, password, jar }) {
  const csrfToken = await csrf(jar);
  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: `${baseUrl}/dashboard`,
    redirectTo: "/dashboard",
  });
  return request(
    "/api/auth/callback/credentials",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
    jar,
  );
}

try {
  const guest = new CookieJar();
  const guestDashboard = await request("/dashboard", {}, guest);
  assert(
    guestDashboard.status >= 300 && guestDashboard.status < 400,
    "Guest could open dashboard",
  );
  assert(
    (guestDashboard.headers.get("location") || "").includes("/login"),
    "Guest redirect does not target login",
  );

  const invalidJar = new CookieJar();
  const invalidLogin = await credentialsCallback({
    email: adminEmail,
    password: `${adminPassword}-invalid`,
    jar: invalidJar,
  });
  assert(
    invalidLogin.status >= 300 && invalidLogin.status < 400,
    "Invalid login did not redirect",
  );
  assert(
    !(invalidLogin.headers.get("location") || "").includes("/dashboard"),
    "Invalid login reached dashboard",
  );

  const sessionJar = new CookieJar();
  const validLogin = await credentialsCallback({
    email: adminEmail,
    password: adminPassword,
    jar: sessionJar,
  });
  assert(
    validLogin.status >= 300 && validLogin.status < 400,
    "Valid login did not redirect",
  );
  const validLocation = validLogin.headers.get("location") || "";
  assert(
    !validLocation.includes("error="),
    `Valid login returned an auth error (${validLocation || "no location"})`,
  );
  assert(
    [...sessionJar.values.keys()].some((name) =>
      name.includes("session-token"),
    ),
    "Valid login did not create a session cookie",
  );

  const dashboard = await request("/dashboard", {}, sessionJar);
  const dashboardHtml = await dashboard.text();
  assert(
    dashboard.status === 200,
    `Authenticated dashboard returned ${dashboard.status}`,
  );
  assert(
    dashboardHtml.includes("Overview Energi Primer"),
    "Authenticated overview marker missing",
  );

  const signOutCsrf = await csrf(sessionJar);
  const signOutBody = new URLSearchParams({
    csrfToken: signOutCsrf,
    callbackUrl: `${baseUrl}/login`,
  });
  const signOut = await request(
    "/api/auth/signout",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: signOutBody,
    },
    sessionJar,
  );
  assert(
    signOut.status >= 300 && signOut.status < 400,
    "Logout did not redirect",
  );

  const afterLogout = await request("/dashboard", {}, sessionJar);
  assert(
    afterLogout.status >= 300 && afterLogout.status < 400,
    "Dashboard remained accessible after logout",
  );
  assert(
    (afterLogout.headers.get("location") || "").includes("/login"),
    "Logout redirect does not target login",
  );

  const roleJar = new CookieJar();
  const roleCookieName =
    [...sessionJar.values.keys()].find((name) =>
      name.includes("session-token"),
    ) || "authjs.session-token";
  const operatorToken = await encode({
    token: { sub: "authorization-test", role: "operator" },
    secret: process.env.AUTH_TEST_SECRET,
    salt: roleCookieName,
  });
  roleJar.values.set(roleCookieName, operatorToken);
  const unauthorizedRole = await request("/dashboard", {}, roleJar);
  assert(
    unauthorizedRole.status >= 300 && unauthorizedRole.status < 400,
    "Non-admin role could open dashboard",
  );
  assert(
    (unauthorizedRole.headers.get("location") || "").includes("/login"),
    "Non-admin role was not redirected to login",
  );

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        checks: [
          "guest dashboard redirect",
          "invalid credentials rejected",
          "valid admin login creates a session and opens dashboard",
          "logout invalidates session cookie",
          "operator role is rejected by authorization boundary",
        ],
        roleUnauthorized:
          "authorization callback tested with a signed operator-role session; no user record was changed",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Authentication verification failed.");
  console.error(`Category: ${safeErrorCategory(error)}`);
  process.exitCode = 1;
}
