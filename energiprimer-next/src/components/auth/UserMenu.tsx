import { SignOutButton } from "./SignOutButton";
import type { DashboardTheme } from "@/components/dashboard/dashboard-themes";

export type AuthenticatedUser = {
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

type UserMenuProps = {
  user: AuthenticatedUser;
  theme?: DashboardTheme;
};

function getInitials(user: AuthenticatedUser) {
  const source = user.name?.trim() || user.email?.trim() || "AD";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatRole(role: string | null | undefined) {
  if (!role) return "Admin";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function UserMenu({ user, theme }: UserMenuProps) {
  const displayName = user.name?.trim() || user.email || "Administrator";
  const role = formatRole(user.role);

  return (
    <details className="group relative">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 rounded-xl border border-transparent p-1.5 transition hover:border-slate-200 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 ${theme?.ring ?? "focus-visible:ring-blue-600"}`}
      >
        <span
          aria-hidden="true"
          className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold tracking-wide text-white ${theme?.solid ?? "bg-blue-600"} ${theme?.border ?? "border-blue-100"}`}
        >
          {getInitials(user)}
        </span>
        <span className="hidden min-w-0 text-left md:block">
          <span className="block max-w-32 truncate text-xs font-semibold text-slate-900">
            {displayName}
          </span>
          <span className="block text-[11px] text-slate-500">{role}</span>
        </span>
        <svg
          aria-hidden="true"
          className="hidden size-4 text-slate-400 sm:block"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.2 7.4a.75.75 0 0 1 1.06.1L10 11.7l3.74-4.2a.75.75 0 1 1 1.12 1l-4.3 4.85a.75.75 0 0 1-1.12 0l-4.3-4.85a.75.75 0 0 1 .06-1.1Z"
            clipRule="evenodd"
          />
        </svg>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
        <div className="border-b border-slate-100 px-2 pb-3">
          <p className="truncate text-sm font-semibold text-slate-900">
            {displayName}
          </p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            {role}
          </span>
        </div>
        <div className="pt-3">
          <SignOutButton />
        </div>
      </div>
    </details>
  );
}
