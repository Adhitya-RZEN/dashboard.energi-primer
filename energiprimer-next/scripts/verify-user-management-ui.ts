import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function testRouteBoundary() {
  const page = readSource("src/app/(protected)/pengaturan/users/page.tsx");
  assert(
    page.includes("requireAdminUser") &&
      page.includes("isAuthorizationPolicyError") &&
      page.includes("/pengaturan/users"),
    "User Management route has an explicit server-side ADMIN guard",
  );
  assert(
    !page.includes("prisma.") &&
      !page.includes('"use server"') &&
      !page.includes(".create(") &&
      !page.includes(".update(") &&
      !page.includes(".delete("),
    "User Management page does not contain database mutation code",
  );
}

function testNavigationBoundary() {
  const navigation = readSource("src/components/layout/NavigationMenu.tsx");
  const shell = readSource("src/components/layout/AppShell.tsx");
  const header = readSource("src/components/layout/SiteHeader.tsx");
  const sidebar = readSource("src/components/layout/Sidebar.tsx");
  assert(
    navigation.includes('href: "/pengaturan/users"') &&
      navigation.includes("adminOnly: true") &&
      navigation.includes("role === ADMIN_ROLE"),
    "navigation entry is restricted to ADMIN presentation",
  );
  assert(
    shell.includes("<Sidebar role={user.role} />") &&
      header.includes("<NavigationMenu role={user.role} />") &&
      sidebar.includes("<NavigationMenu role={role} />"),
    "server-authenticated role is passed to desktop and mobile navigation",
  );
}

function testPresentationSurface() {
  const client = readSource(
    "src/components/user-management/UserManagementClient.tsx",
  );
  const service = readSource("src/services/user-management.ts");
  const loading = readSource(
    "src/app/(protected)/pengaturan/users/loading.tsx",
  );
  const error = readSource("src/app/(protected)/pengaturan/users/error.tsx");

  for (const label of [
    "User Management",
    "Search users...",
    "Role",
    "Status",
    "Edit User",
    "Reset Password",
    "Change Role",
    "Disable User",
    "Enable User",
    "Add New User",
    "No users found",
    "No users yet",
    "Unable to load users.",
    "Try Again",
  ]) {
    assert(client.includes(label), `presentation includes ${label}`);
  }

  assert(
    client.includes("role=\"dialog\"") &&
      client.includes('aria-modal="true"') &&
      client.includes('event.key === "Escape"') &&
      client.includes("focusableSelector"),
    "dialogs provide modal semantics, Escape handling, and focus management",
  );
  assert(
    client.includes("user.username") &&
      client.includes("user.name") &&
      client.includes("user.email") &&
      client.includes("roleFilter") &&
      client.includes("statusFilter"),
    "table and combined search/filter state are implemented",
  );
  assert(
    service.includes("requireAdminUser") &&
      service.includes("userListSelect") &&
      service.includes("prisma.user.findMany") &&
      !service.includes("password: true") &&
      !service.includes("rememberToken"),
    "user list uses an ADMIN-guarded allowlisted read query",
  );
  assert(
    loading.includes('label="Loading users..."') &&
      error.includes("UserManagementErrorState"),
    "loading and safe retry error boundaries are present",
  );
}

function testNoMutationOrSensitivePersistence() {
  const client = readSource(
    "src/components/user-management/UserManagementClient.tsx",
  );
  const forbidden = [
    "prisma.",
    "fetch(",
    '"use server"',
    ".create(",
    ".update(",
    ".delete(",
    "localStorage",
    "sessionStorage",
    "UserAuditLog",
  ];

  for (const token of forbidden) {
    assert(!client.includes(token), `UI client does not use ${token}`);
  }
  assert(
    client.includes("No changes were saved") &&
      client.includes("No password was changed"),
    "presentation actions provide no fake mutation success feedback",
  );
}

try {
  testRouteBoundary();
  testNavigationBoundary();
  testPresentationSurface();
  testNoMutationOrSensitivePersistence();

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        databaseWrites: 0,
        networkRequests: 0,
        checks,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("User Management UI verification failed.");
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
