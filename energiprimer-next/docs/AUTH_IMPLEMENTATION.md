# Authentication & Authorization — Current Contract

## Status

- **Status:** Active Auth.js Credentials flow
- **Date:** 2026-09-05
- **Production verification:** Phase 6K deployment/auth/dashboard checks PASS;
  Phase 6L post-checks retained the authenticated dashboard result
- **Reference application:** Laravel remains an immutable reference only
- **Database:** Existing PostgreSQL/Supabase `users` data; no schema change in this remediation

## Active architecture

```text
Login form
    ↓ server action
Auth.js / next-auth Credentials
    ↓ bcryptjs + Prisma
PostgreSQL/Supabase users
    ↓
JWT httpOnly session cookie
    ↓
src/proxy.ts + protected layout + server auth()
```

Auth.js owns credentials callback, CSRF, sign-in/sign-out, redirect handling,
and the JWT session boundary. Prisma reads the existing `users` table and only
authorizes the `admin` role. Passwords are compared with `bcryptjs`; plaintext
passwords are never sent to the client or stored.

## Active files

- `src/auth.ts` — Auth.js configuration, credentials provider, role callback,
  and session-version revalidation.
- `src/types/next-auth.d.ts` — session/user type augmentation.
- `src/proxy.ts` — early guest and role protection for dashboard paths.
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handler.
- `src/app/(protected)/layout.tsx` — repeated server-side authentication and
  admin authorization boundary.
- `src/app/login/*` — login form and action.
- `src/app/password/change/*` — authenticated password-change flow.
- `src/lib/auth-tokens.ts` — non-recovery token used by the existing password
  change compatibility path.
- `src/lib/auth-security.ts` and `src/lib/login-throttle.ts` — redirect,
  email-validation, and persistent login-throttle helpers.

## Laravel behavior mapping

| Laravel behavior | Active Next.js implementation |
|---|---|
| `Auth::attempt` with `role=admin` | Auth.js Credentials `authorize()` + Prisma + bcrypt |
| Web session guard | Auth.js JWT httpOnly cookie, two-hour max age |
| `last_login_at` update | Prisma update after valid credentials |
| Logout/invalidation | Auth.js sign-out and session-version checks |
| `EnsureAdmin` middleware | Proxy `authorized` callback plus protected layout |
| `/login` | `src/app/login/page.tsx` |
| `/password/change` | Authenticated page/action with current-password check |

## Decommissioned flows

Supabase Auth, email delivery, Resend, magic links, OTP, and public account
recovery routes are not part of the active application contract. The former
`/forgot-password` and `/reset-password/[token]` routes, mail adapter, and
Resend verifier were removed during Phase 6C. Do not reintroduce them without
a separate approved design and security review.

The Prisma `PasswordResetToken` model and existing migration artifacts remain
intentionally unchanged. Removing the legacy database object requires a
separate reviewed migration and is outside this zero-write remediation.

## Environment boundary

Required server configuration:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST` for deployment host trust

Optional deployment configuration:

- `AUTH_URL` as the canonical HTTPS Auth.js origin
- `CRON_SECRET` when scheduled sync is enabled

Google Sheets configuration remains server-only. No `NEXT_PUBLIC_*` variable
may contain database, authentication, cron, Google, Supabase, mail, or token
material.

## Verification

Static Auth.js security verification covers email normalization, safe redirects,
cron authorization, protected route checks, session revalidation, login
throttling, and security headers. Live credential E2E is an operator action and
must use an isolated test account/database; it is not run by the Phase 6C
zero-write remediation.

Historical Phase 4/5 reports retain their original findings and must not be
treated as the current authentication contract.
