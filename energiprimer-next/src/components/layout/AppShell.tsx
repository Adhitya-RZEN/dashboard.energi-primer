import type { ReactNode } from "react";

import type { AuthenticatedUser } from "@/components/auth/UserMenu";
import type { DashboardTheme } from "@/components/dashboard/dashboard-themes";

import { SiteHeader } from "./SiteHeader";
import { Sidebar } from "./Sidebar";

type AppShellProps = {
  children: ReactNode;
  user: AuthenticatedUser;
  theme: DashboardTheme;
};

export function AppShell({ children, user, theme }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-sky-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        href="#main-content"
      >
        Skip to content
      </a>
      <SiteHeader user={user} theme={theme} />
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Sidebar />
        <main id="main-content" className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
      <footer className="border-t border-slate-200 bg-white" role="contentinfo">
        <div className="mx-auto flex min-h-14 w-full max-w-[1600px] flex-col items-start justify-center gap-1 px-4 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>⚡ © {new Date().getFullYear()} Energi Primer</span>
          <span>Dashboard Monitoring Efisiensi Batu Bara · v1.0 — Phase 1</span>
        </div>
      </footer>
    </div>
  );
}
