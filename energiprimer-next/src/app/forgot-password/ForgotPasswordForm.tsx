"use client";

import { useActionState } from "react";

import {
  requestPasswordReset,
  type PasswordResetRequestState,
} from "./actions";

const initialState: PasswordResetRequestState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label
          className="block text-sm font-semibold text-slate-700"
          htmlFor="email"
        >
          Email admin
        </label>
        <input
          autoComplete="email"
          className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
          id="email"
          name="email"
          required
          type="email"
        />
      </div>
      {state.error ? (
        <p
          aria-live="polite"
          className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p
          aria-live="polite"
          className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800"
        >
          {state.message}
        </p>
      ) : null}
      <button
        className="w-full rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Mengirim..." : "Kirim instruksi reset"}
      </button>
    </form>
  );
}
