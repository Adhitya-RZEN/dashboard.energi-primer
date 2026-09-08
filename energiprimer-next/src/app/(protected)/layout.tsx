import type { ReactNode } from "react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  isAuthorizationPolicyError,
  requireDashboardUser,
} from "@/lib/authorization";
import { AppShell } from "@/components/layout/AppShell";
import { getDashboardTheme } from "@/components/dashboard/dashboard-themes";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  type DashboardAuthorization = Awaited<
    ReturnType<typeof requireDashboardUser>
  >;
  let current: DashboardAuthorization;
  try {
    current = await requireDashboardUser();
  } catch (error) {
    if (isAuthorizationPolicyError(error)) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login?callbackUrl=/dashboard" as Route);
      }
      redirect("/login?error=unauthorized" as Route);
    }
    throw error;
  }
  const { session } = current;

  const pathname =
    (await headers()).get("x-dashboard-pathname") ?? "/dashboard";

  return (
    <AppShell user={session.user} theme={getDashboardTheme(pathname)}>
      {children}
    </AppShell>
  );
}
