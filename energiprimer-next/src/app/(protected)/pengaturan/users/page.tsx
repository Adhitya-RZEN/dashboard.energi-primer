import type { Route } from "next";
import { redirect } from "next/navigation";

import {
  isAuthorizationPolicyError,
  requireAdminUser,
} from "@/lib/authorization";
import { UserManagementClient } from "@/components/user-management/UserManagementClient";
import { createUserManagementFixture } from "@/components/user-management/fixture";

export default async function UserManagementPage() {
  let current: Awaited<ReturnType<typeof requireAdminUser>>;
  try {
    current = await requireAdminUser();
  } catch (error) {
    if (isAuthorizationPolicyError(error)) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login?callbackUrl=/pengaturan/users" as Route);
      }
      redirect("/dashboard?error=unauthorized" as Route);
    }
    throw error;
  }

  return (
    <UserManagementClient
      users={createUserManagementFixture({
        name: current.user.name,
        email: current.user.email,
      })}
    />
  );
}
