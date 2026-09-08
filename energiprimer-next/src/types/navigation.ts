export type NavigationIconName =
  | "overview"
  | "biomassa"
  | "batubara"
  | "solar"
  | "stock"
  | "target"
  | "settings"
  | "users";

export type NavigationItem = {
  href: string | null;
  label: string;
  description: string;
  icon: NavigationIconName;
  available: boolean;
  adminOnly?: boolean;
};
