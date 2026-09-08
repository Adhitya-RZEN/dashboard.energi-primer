export const USER_MANAGEMENT_FIXTURE_SOURCE =
  "UI DEVELOPMENT FIXTURE — NOT PRODUCTION DATA" as const;

export type UserManagementRole = "ADMIN" | "USER";
export type UserManagementStatus = "ACTIVE" | "DISABLED";

export type UserManagementUser = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserManagementRole;
  status: UserManagementStatus;
  isCurrentUser?: boolean;
  isProtectedAdministrator?: boolean;
};

type CurrentAdminDisplay = {
  name: string | null | undefined;
  email: string | null | undefined;
};

/**
 * Phase 4 intentionally has no user read API yet. These rows exist only to
 * exercise the presentation layer until a later phase supplies a safe query.
 * The current administrator's already-authorized display identity is included
 * so the self-target UI can be exercised without exposing credential fields.
 */
export function createUserManagementFixture(
  currentAdmin: CurrentAdminDisplay,
): UserManagementUser[] {
  return [
    {
      id: "fixture-current-admin",
      username: "admin01",
      name: currentAdmin.name?.trim() || "Current Administrator",
      email: currentAdmin.email?.trim() || "admin01@example.invalid",
      role: "ADMIN",
      status: "ACTIVE",
      isCurrentUser: true,
      isProtectedAdministrator: true,
    },
    {
      id: "fixture-operator-01",
      username: "operator01",
      name: "Budi Santoso",
      email: "operator01@example.invalid",
      role: "USER",
      status: "ACTIVE",
    },
    {
      id: "fixture-operator-02",
      username: "operator02",
      name: "Andi Pratama",
      email: "operator02@example.invalid",
      role: "USER",
      status: "ACTIVE",
    },
    {
      id: "fixture-operator-03",
      username: "operator03",
      name: "Citra Lestari",
      email: "operator03@example.invalid",
      role: "USER",
      status: "DISABLED",
    },
  ];
}
