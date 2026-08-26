import type { ReactNode } from "react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { auth } from "@/auth";
import { AppShell } from "@/components/layout/AppShell";
import { getDashboardTheme } from "@/components/dashboard/dashboard-themes";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session) {
    redirect("/login?callbackUrl=/dashboard" as Route);
  }

  if (session.user.role !== "admin") {
    redirect("/login?error=unauthorized" as Route);
  }

  const pathname = (await headers()).get("x-dashboard-pathname") ?? "/dashboard";

  return <AppShell user={session.user} theme={getDashboardTheme(pathname)}>{children}</AppShell>;
}
