import type { Metadata } from "next";
import type { ReactNode } from "react";

import { publicEnv } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: publicEnv.appName,
    template: `%s | ${publicEnv.appName}`,
  },
  description: "Foundation aplikasi dashboard Energi Primer.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
