"use client";

import { useActionState } from "react";

import { resetPassword, type ResetPasswordState } from "@/app/forgot-password/actions";

type ResetPasswordFormProps = {
  token: string;
  email: string;
};

const initialState: ResetPasswordState = {};

export function ResetPasswordForm({ token, email }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input name="token" type="hidden" value={token} />
      <input name="email" type="hidden" value={email} />
      <div>
        <label className="block text-sm font-semibold text-slate-700" htmlFor="password">Password baru</label>
        <input autoComplete="new-password" className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100" id="password" minLength={12} name="password" required type="password" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700" htmlFor="password_confirmation">Konfirmasi password</label>
        <input autoComplete="new-password" className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100" id="password_confirmation" minLength={12} name="password_confirmation" required type="password" />
      </div>
      {state.error ? <p aria-live="polite" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">{state.error}</p> : null}
      {state.message ? <p aria-live="polite" className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{state.message}</p> : null}
      <button className="w-full rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending || Boolean(state.message)} type="submit">
        {pending ? "Menyimpan..." : "Simpan password baru"}
      </button>
    </form>
  );
}
