export type DashboardThemeKey =
  | "overview"
  | "biomassa"
  | "batubara"
  | "solar"
  | "stok"
  | "target";

export type DashboardTheme = {
  key: DashboardThemeKey;
  label: string;
  eyebrow: string;
  solid: string;
  solidHover: string;
  text: string;
  soft: string;
  border: string;
  ring: string;
  activeItem: string;
  hoverItem: string;
  header: string;
};

const themes: Record<DashboardThemeKey, DashboardTheme> = {
  overview: { key: "overview", label: "Overview", eyebrow: "Biru PLN", solid: "bg-blue-600", solidHover: "hover:bg-blue-700", text: "text-blue-700", soft: "bg-blue-50", border: "border-blue-100", ring: "focus-visible:ring-blue-600", activeItem: "bg-blue-50 text-blue-800", hoverItem: "hover:bg-blue-50 hover:text-blue-800", header: "from-blue-700 to-blue-600" },
  biomassa: { key: "biomassa", label: "Biomassa", eyebrow: "Energi terbarukan", solid: "bg-green-600", solidHover: "hover:bg-green-700", text: "text-green-700", soft: "bg-green-50", border: "border-green-100", ring: "focus-visible:ring-green-600", activeItem: "bg-green-50 text-green-800", hoverItem: "hover:bg-green-50 hover:text-green-800", header: "from-green-700 to-green-600" },
  batubara: { key: "batubara", label: "Batubara", eyebrow: "Operasional", solid: "bg-slate-600", solidHover: "hover:bg-slate-700", text: "text-slate-700", soft: "bg-slate-100", border: "border-slate-200", ring: "focus-visible:ring-slate-600", activeItem: "bg-slate-100 text-slate-800", hoverItem: "hover:bg-slate-100 hover:text-slate-800", header: "from-slate-700 to-slate-600" },
  solar: { key: "solar", label: "Solar", eyebrow: "Bahan bakar pendukung", solid: "bg-amber-500", solidHover: "hover:bg-amber-600", text: "text-amber-700", soft: "bg-amber-50", border: "border-amber-100", ring: "focus-visible:ring-amber-500", activeItem: "bg-amber-50 text-amber-800", hoverItem: "hover:bg-amber-50 hover:text-amber-800", header: "from-amber-600 to-amber-500" },
  stok: { key: "stok", label: "Stok Batubara", eyebrow: "Inventori", solid: "bg-indigo-600", solidHover: "hover:bg-indigo-700", text: "text-indigo-700", soft: "bg-indigo-50", border: "border-indigo-100", ring: "focus-visible:ring-indigo-600", activeItem: "bg-indigo-50 text-indigo-800", hoverItem: "hover:bg-indigo-50 hover:text-indigo-800", header: "from-indigo-700 to-indigo-600" },
  target: { key: "target", label: "Target & Kinerja", eyebrow: "Kinerja", solid: "bg-violet-600", solidHover: "hover:bg-violet-700", text: "text-violet-700", soft: "bg-violet-50", border: "border-violet-100", ring: "focus-visible:ring-violet-600", activeItem: "bg-violet-50 text-violet-800", hoverItem: "hover:bg-violet-50 hover:text-violet-800", header: "from-violet-700 to-violet-600" },
};

export function getDashboardTheme(pathname: string): DashboardTheme {
  const key: DashboardThemeKey = pathname.startsWith("/dashboard/biomassa")
    ? "biomassa"
    : pathname.startsWith("/dashboard/batubara")
      ? "batubara"
      : pathname.startsWith("/dashboard/solar")
        ? "solar"
        : pathname.startsWith("/dashboard/stok")
          ? "stok"
          : pathname.startsWith("/dashboard/target")
            ? "target"
            : "overview";

  return themes[key];
}
