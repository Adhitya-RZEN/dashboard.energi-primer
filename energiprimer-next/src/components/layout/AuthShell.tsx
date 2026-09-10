import type { ReactNode } from "react";
import Link from "next/link";

import { publicEnv } from "@/lib/env";

type AuthShellProps = {
  children: ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-md flex-col items-center justify-center">
        <Link
          className="mb-6 flex items-center gap-3"
          href="/"
          aria-label={`Kembali ke ${publicEnv.appName}`}
        >
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
            {/* The local SVG keeps login branding independent from external image hosts. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/Logo_PLN.svg"
              alt="Logo PLN"
              width={48}
              height={48}
              className="size-12 object-contain"
            />
          </span>
          <span>
            <span className="block text-sm font-bold tracking-tight text-slate-900">
              Energi Primer
            </span>
            <span className="block text-xs font-medium text-slate-500">Team</span>
          </span>
        </Link>
        {children}
        <p className="mt-5 text-center text-xs leading-5 text-slate-500">
          Akses hanya tersedia untuk akun yang terdaftar dan aktif.
        </p>
      </div>
    </main>
  );
}
