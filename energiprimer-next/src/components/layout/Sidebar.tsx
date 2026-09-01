import { NavigationMenu } from "./NavigationMenu";

export function Sidebar() {
  return (
    <aside
      className="hidden border-r border-slate-200 bg-white lg:block"
      aria-label="Sidebar dashboard"
    >
      <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto p-5">
        <NavigationMenu />
        <p className="mt-6 border-t border-slate-200 pt-4 text-center text-[11px] text-slate-400">
          Dashboard v1.0 · Admin
        </p>
      </div>
    </aside>
  );
}
