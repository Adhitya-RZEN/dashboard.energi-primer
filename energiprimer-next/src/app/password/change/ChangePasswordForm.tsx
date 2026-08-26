"use client";

import { useActionState } from "react";

import { changePassword, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-slate-700" htmlFor="current_password">Password saat ini</label>
        <input autoComplete="current-password" className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100" id="current_password" name="current_password" required type="password" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700" htmlFor="password">Password baru</label>
        <input autoComplete="new-password" className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100" id="password" minLength={12} name="password" required type="password" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700" htmlFor="password_confirmation">Konfirmasi password baru</label>
        <input autoComplete="new-password" className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100" id="password_confirmation" minLength={12} name="password_confirmation" required type="password" />
      </div>
      {state.error ? <p aria-live="polite" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">{state.error}</p> : null}
      <button className="w-full rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Menyimpan..." : "Ubah password"}
      </button>
    </form>
  );
}
