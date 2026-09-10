export type NavigationIconName =
  | "overview"
  | "biomassa"
  | "batubara"
  | "solar"
  | "stock"
  | "target"
  | "settings"
  | "users"
  | "audit";

export type NavigationItem = {
  href: string | null;
  label: string;
  icon: NavigationIconName;
  available: boolean;
  adminOnly?: boolean;
};
