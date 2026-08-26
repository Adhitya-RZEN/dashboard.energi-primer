import Link from "next/link";

import { UserMenu, type AuthenticatedUser } from "@/components/auth/UserMenu";

import { NavigationMenu } from "./NavigationMenu";

type SiteHeaderProps = {
  user: AuthenticatedUser;
  theme: import("@/components/dashboard/dashboard-themes").DashboardTheme;
};

export function SiteHeader({ user, theme }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div aria-hidden="true" className={`h-1 ${theme.solid}`} />
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <Link className="flex min-w-0 shrink items-center gap-3" href="/dashboard" aria-label="Buka dashboard monitoring">
          <span
            aria-hidden="true"
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm ${theme.solid}`}
          >
            EP
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-sm font-bold tracking-tight text-slate-900 lg:text-base">
              PLN Indonesia Power
            </span>
            <span className="block truncate text-[11px] text-slate-500">UBP Jeranjang</span>
          </span>
        </Link>

        <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
          <span aria-hidden="true" className="h-8 w-px bg-slate-200" />
          <span className="truncate text-sm font-semibold text-slate-700 lg:text-[15px]">
            Monitoring Efisiensi Batu Bara
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <span className={`hidden rounded-full px-3 py-1.5 text-xs font-semibold xl:inline-flex ${theme.soft} ${theme.text}`}>
            {theme.label}
          </span>
          <UserMenu user={user} theme={theme} />
          <details className="relative lg:hidden">
            <summary className={`cursor-pointer list-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 ${theme.ring}`}>
              Menu
            </summary>
            <div className="absolute right-0 z-30 mt-2 max-h-[calc(100vh-5rem)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
              <NavigationMenu />
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
