import Link from "next/link";

import { AuthShell } from "@/components/layout/AuthShell";

import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-7 space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Password recovery</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Reset password</h1>
          <p className="text-sm leading-6 text-slate-600">Masukkan email akun admin untuk menerima instruksi reset.</p>
        </div>
        <ForgotPasswordForm />
        <Link className="mt-5 block text-center text-sm font-semibold text-sky-700 hover:text-sky-900" href="/login">Kembali ke login</Link>
      </section>
    </AuthShell>
  );
}
