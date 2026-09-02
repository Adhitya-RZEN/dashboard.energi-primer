import { AuthShell } from "@/components/layout/AuthShell";

import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <AuthShell>
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-7 space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
            Admin access
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Login ke Energi Primer
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            Gunakan akun admin yang sudah ada pada database.
          </p>
        </div>

        <LoginForm />
      </section>
    </AuthShell>
  );
}
