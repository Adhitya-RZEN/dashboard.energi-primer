"use client";

import { useActionState } from "react";

import { authenticate, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(authenticate, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-slate-700" htmlFor="email">
          Email admin
        </label>
        <input
          autoComplete="email"
          className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
          id="email"
          name="email"
          placeholder="admin@example.com"
          required
          type="email"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="current-password"
          className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>

      {state.error ? (
        <p aria-live="polite" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <button
        className="w-full rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Memeriksa..." : "Login"}
      </button>
    </form>
  );
}
