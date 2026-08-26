export type NavigationIconName =
  | "overview"
  | "biomassa"
  | "batubara"
  | "solar"
  | "stock"
  | "target"
  | "settings";

export type NavigationItem = {
  href: string | null;
  label: string;
  description: string;
  icon: NavigationIconName;
  available: boolean;
};
