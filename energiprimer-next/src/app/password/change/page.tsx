import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/layout/AuthShell";
import {
  isAuthorizationPolicyError,
  requireActiveSession,
} from "@/lib/authorization";

import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  try {
    await requireActiveSession();
  } catch (error) {
    if (isAuthorizationPolicyError(error)) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login?callbackUrl=/password/change");
      }
      redirect("/login?error=unauthorized");
    }
    throw error;
  }

  return (
    <AuthShell>
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-7 space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
            Pengaturan akun
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Ubah password
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            Password baru harus terdiri dari minimal 12 karakter.
          </p>
        </div>
        <ChangePasswordForm />
        <Link
          className="mt-5 block text-center text-sm font-semibold text-sky-700 hover:text-sky-900"
          href="/pengaturan"
        >
          Kembali ke pengaturan
        </Link>
      </section>
    </AuthShell>
  );
}
