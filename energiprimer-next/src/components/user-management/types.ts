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
