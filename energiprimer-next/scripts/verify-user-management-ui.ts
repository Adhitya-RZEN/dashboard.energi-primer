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
    client.includes("resetPassword") &&
      client.includes('name="targetUserId"') &&
      client.includes('name="newPassword"') &&
      client.includes("Resetting...") &&
      client.includes("Password reset successfully.") &&
      client.includes("!user.isCurrentUser"),
    "Reset Password dialog is action-integrated and hidden for the current user",
  );
  assert(
    client.includes("changeRole") &&
      client.includes('name="targetUserId"') &&
      client.includes('name="newRole"') &&
      client.includes("Updating...") &&
      client.includes("Role updated successfully."),
    "Change Role dialog is action-integrated with safe pending and success feedback",
  );
  assert(
    client.includes("changeStatus") &&
      client.includes('name="desiredStatus"') &&
      client.includes('name="targetUserId"') &&
      client.includes("Updating...") &&
      client.includes("User disabled successfully.") &&
      client.includes("User enabled successfully."),
    "Enable/Disable dialog is action-integrated with safe pending and success feedback",
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
  const roleDialogStart = client.indexOf("function ChangeRoleDialog");
  const roleDialogEnd = client.indexOf("function UserStatusDialog");
  const roleDialog = client.slice(roleDialogStart, roleDialogEnd);
  const statusDialogStart = client.indexOf("function UserStatusDialog");
  const statusDialog = client.slice(statusDialogStart);
  assert(
    client.includes("No changes were saved") &&
      !roleDialog.includes("presentation-only") &&
      statusDialog.includes("changeStatus") &&
      !statusDialog.includes("deferred to a later phase") &&
      !client.includes("No password was changed"),
    "remaining deferred presentation actions provide no fake success while status mutation is persistent",
  );
}

function testActionMenuBoundary() {
  const client = readSource(
    "src/components/user-management/UserManagementClient.tsx",
  );
  const menuStart = client.indexOf("function UserActionMenu");
  const menuEnd = client.indexOf("function UserTable", menuStart);
  const menu = client.slice(menuStart, menuEnd);
  const editTrigger = menu.indexOf('onClick={() => select("edit")}');
  const resetCondition = menu.indexOf("!user.isCurrentUser");

  assert(
    menuStart >= 0 &&
      menuEnd > menuStart &&
      menu.includes('type="button"') &&
      menu.includes('aria-haspopup="menu"') &&
      menu.includes("aria-expanded={isOpen}") &&
      menu.includes("setIsOpen((open) => !open)"),
    "each user row has an independently controlled action trigger",
  );
  assert(
    menu.includes("createPortal(menu, document.body)") &&
      menu.includes('position: "fixed"') &&
      menu.includes("handlePointerDown") &&
      menu.includes("handleKeyDown") &&
      !menu.includes("<details") &&
      !menu.includes("className=\"absolute right-0"),
    "action menu escapes the table overflow clipping boundary and closes safely",
  );
  assert(
    editTrigger >= 0 &&
      resetCondition > editTrigger &&
      menu.includes('onClick={() => select("reset-password")}') &&
      menu.includes("onSelect(action, user, statusAction)"),
    "ADMIN can open Edit User for every row while Reset Password remains hidden only for self",
  );
}

try {
  testRouteBoundary();
  testNavigationBoundary();
  testPresentationSurface();
  testNoMutationOrSensitivePersistence();
  testActionMenuBoundary();

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
