import { NavigationMenu } from "./NavigationMenu";
import type { AuthenticatedUser } from "@/components/auth/UserMenu";

export function Sidebar({ role }: Pick<AuthenticatedUser, "role">) {
  return (
    <aside
      className="hidden border-r border-slate-200 bg-white lg:block"
      aria-label="Sidebar dashboard"
    >
      <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto p-5">
        <NavigationMenu role={role} />
      </div>
    </aside>
  );
}
