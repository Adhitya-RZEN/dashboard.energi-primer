import "server-only";

import { UserRole, UserStatus } from "@prisma/client";

import { requireAdminUser } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import type { UserManagementUser } from "@/components/user-management/types";

const userListSelect = {
  id: true,
  username: true,
  name: true,
  email: true,
  role: true,
  status: true,
} as const;

/**
 * Read the allowlisted user-management fields only after the ADMIN boundary
 * has passed. Passwords, remember tokens, sessions, and audit metadata are
 * intentionally not selected.
 */
export async function listUsersForAdmin(): Promise<UserManagementUser[]> {
  const current = await requireAdminUser();
  return listUsersAfterAdminGuard(current.user.id);
}

export async function listUsersAfterAdminGuard(
  currentUserId: bigint,
): Promise<UserManagementUser[]> {
  const [users, activeAdminCount] = await Promise.all([
    prisma.user.findMany({
      select: userListSelect,
      orderBy: { username: "asc" },
    }),
    prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    }),
  ]);

  return users.map((user) => ({
    id: user.id.toString(),
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role === UserRole.ADMIN ? "ADMIN" : "USER",
    status: user.status === UserStatus.ACTIVE ? "ACTIVE" : "DISABLED",
    isCurrentUser: user.id === currentUserId,
    isProtectedAdministrator:
      user.role === UserRole.ADMIN &&
      user.status === UserStatus.ACTIVE &&
      activeAdminCount === 1,
  }));
}
