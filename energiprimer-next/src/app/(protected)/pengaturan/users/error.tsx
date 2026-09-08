"use client";

import { UserManagementErrorState } from "@/components/user-management/UserManagementClient";

export default function UserManagementError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <UserManagementErrorState onRetry={reset} />;
}
