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
        <Link className="mb-6 flex items-center gap-3" href="/" aria-label={`Kembali ke ${publicEnv.appName}`}>
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-sky-700 text-sm font-bold text-white shadow-sm">
            EP
          </span>
          <span>
            <span className="block text-sm font-bold text-slate-900">PLN Indonesia Power</span>
            <span className="block text-xs text-slate-500">UBP Jeranjang</span>
          </span>
        </Link>
        {children}
        <p className="mt-5 text-center text-xs leading-5 text-slate-500">
          Akun admin digunakan bersama oleh tim yang berwenang.
        </p>
      </div>
    </main>
  );
}
