# Authentication & Authorization — Phase 4

## Status

- **Status:** PASS untuk authentication foundation dan protected dashboard
- **Tanggal:** 2026-08-26
- **Laravel:** tetap sebagai reference dan tidak dimodifikasi
- **Database:** tidak ada migration/schema change; tidak ada password/role yang diubah

## Architecture

```text
Login form
    ↓ Server Action
Auth.js / next-auth 5.0.0-beta.32
    ↓ Credentials provider
Prisma → existing PostgreSQL.users
    ↓
JWT httpOnly session cookie
    ↓
src/proxy.ts + protected dashboard layout + server auth()
```

Auth.js dipilih karena menangani session cookie, CSRF, sign-in/sign-out,
callback, dan error boundary authentication. Prisma adapter tidak dipakai:
schema Laravel tidak memiliki tabel Auth.js `accounts`/`verification_tokens`,
sedangkan kebutuhan saat ini hanya akun credentials existing. JWT strategy
memungkinkan migrasi tanpa mengubah tabel `sessions` Laravel.

Credentials provider tetap membaca tabel `users` existing dan hanya menerima
`role = admin`. Password existing diverifikasi dengan `bcryptjs`, yang
kompatibel dengan hash bcrypt Laravel. Password tidak pernah dikirim ke client
atau disimpan plaintext.

## Files changed

- `src/auth.ts` — Auth.js config, credentials provider, role callback, session callback, dan session-version revocation.
- `src/types/next-auth.d.ts` — type augmentation untuk `session.user.id` dan `role`.
- `src/proxy.ts` — proteksi `/dashboard/:path*` sesuai file convention Next.js 16.
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handler.
- `src/app/(protected)/dashboard/layout.tsx` — server-side session dan admin guard.
- `src/app/(protected)/dashboard/page.tsx` — protected foundation page, bukan dashboard penuh.
- `src/app/login/*` — login form dan server action.
- `src/components/auth/SignOutButton.tsx` — server-side logout action.
- `src/app/forgot-password/*` — request reset flow.
- `src/app/reset-password/[token]/*` — reset form dan token validation.
- `src/app/password/change/*` — authenticated change-password page, form, dan server action.
- `src/lib/password-reset.ts` — token generation, expiry, throttle, dan development mail behavior.
- `src/lib/login-throttle.ts` — persistent `6/1 menit` login throttle menggunakan tabel `cache` existing.
- `scripts/verify-auth.mjs` — HTTP auth verification tanpa perubahan user/password.

## Laravel mapping

| Laravel behavior                                         | Next.js implementation                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Auth::attempt` dengan `email`, `password`, `role=admin` | Auth.js Credentials `authorize()` + Prisma user query + bcrypt compare           |
| Session guard `web`                                      | Auth.js JWT httpOnly cookie, max age 120 menit                                   |
| Session regenerate saat login                            | Auth.js menerbitkan session cookie baru                                          |
| `last_login_at` diperbarui                               | Prisma update setelah credentials valid                                          |
| `Auth::logout` + invalidate session                      | Auth.js `signOut()` menghapus JWT cookie                                         |
| `EnsureAdmin` middleware                                 | `callbacks.authorized` di Proxy + protected layout server check                  |
| `/login`                                                 | `src/app/login/page.tsx`                                                         |
| `POST /login`                                            | Login Server Action → Auth.js credentials callback                               |
| `/logout`                                                | `SignOutButton` Server Action → Auth.js signOut                                  |
| `/forgot-password`                                       | Request Server Action, admin-only lookup, generic response                       |
| `/reset-password/{token}`                                | Dynamic App Router page + reset Server Action                                    |
| `/password/change`                                       | Authenticated page + Server Action, current-password check, bcrypt, dan sign-out |
| Laravel bcrypt `Hash::check` / `Hash::make`              | `bcryptjs.compare` / `bcryptjs.hash`                                             |
| `password_reset_tokens`, expiry 60 min, throttle 60 sec  | Existing Prisma model, bcrypt token hash, 60/60 policy                           |

## Protected routes

`src/proxy.ts` matches `/dashboard/:path*`. Unauthenticated requests are sent
to `/login`; sessions with a role other than `admin` are also rejected. The
dashboard layout repeats the check server-side because Proxy is not the only
security boundary. Future protected pages should live beneath the same
protected route group or call `auth()` and validate authorization themselves.

The root `/` remains the public foundation landing page. It does not expose
dashboard data.

## Password recovery

The local Laravel environment uses `MAIL_MAILER=log`. The Next.js flow follows
that environment in development:

1. Normalize email and search only an admin user.
2. Return the same generic response for known and unknown addresses.
3. Enforce a 60-second request throttle.
4. Generate a 32-byte random token.
5. Store only a bcrypt hash in `password_reset_tokens`.
6. Log the reset URL server-side in development mode.
7. Accept reset tokens for up to 60 minutes.
8. Hash the new password with bcrypt and update the existing user row only when
   the submitted token/password are valid.

Production refuses `log` mail delivery. An SMTP or transactional mail provider
must be configured and implemented before enabling production reset emails.
No reset request was submitted during verification, so no reset token was
written to the database.

## Environment variables

Required:

- `AUTH_SECRET` — long, unique random secret per deployment. Never expose it to client.
- `AUTH_TRUST_HOST` — set `true` only for the explicitly configured deployment host.
- `DATABASE_URL` — existing PostgreSQL connection. Never expose it to client.

Optional:

- `AUTH_URL` or `NEXT_PUBLIC_APP_URL` — base URL for reset links.
- `AUTH_MAILER` — `log` only for development in the current implementation.
- Existing `MAIL_MAILER` is used as a fallback for local compatibility.

`.env*` files are gitignored. No real credentials or password values were
added to the repository.

## Security considerations

- Passwords are compared/hashed with bcrypt; plaintext is not persisted.
- Password and database credentials never enter session claims or client props.
- Session claims contain only user id, name/email, and role.
- Auth.js handles CSRF for its credential callback and sign-out endpoints.
- Forgot password responses do not reveal whether an email exists.
- Reset tokens are random and stored hashed, never plaintext.
- `AUTH_SECRET` is mandatory in production.
- Login rate limiting equivalent to Laravel `throttle:6,1` uses the existing
  `cache` table and a hashed email/IP key; cache availability should be
  monitored in production.
- Password change and reset update `users.updated_at`; the Auth.js session
  callback rejects JWTs with an older session version.
- A copied JWT remains incompatible with Laravel sessions and remains a
  separate cutover concern until its expiry/revocation policy is approved.

## Verification result

Commands:

```text
npm run lint       PASS
tsc --noEmit       PASS
npm run build      PASS
npm run auth:verify PASS
```

HTTP checks passed against the existing PostgreSQL-backed admin account:

- guest cannot open `/dashboard`;
- invalid credentials are rejected;
- valid admin login creates a session and opens `/dashboard`;
- logout ends access with the session cookie;
- signed `operator` role is rejected by authorization boundary;
- forgot-password and reset-password pages are available.

The valid-login check updates only `users.last_login_at`, matching Laravel's
login behavior. No password, role, session table, reset token, or domain data
was changed by the test harness.

## Known limitations / NEEDS REVIEW

1. `next-auth` is currently `5.0.0-beta.32`; upgrade and regression-test before
   production freeze.
2. Auth.js JWT sessions are not compatible with existing Laravel session
   cookies. A cutover requires users to sign in again, or a separately approved
   shared-session strategy.
3. SMTP/transactional email provider is not available in the inspected
   environment; production forgot-password delivery remains **NEEDS REVIEW**.
4. The existing Laravel `sessions` table remains untouched and is not used by
   the Next.js JWT session strategy.
5. Only the `admin` role is authorized, matching current Laravel behavior;
   operator permissions remain **NEEDS REVIEW**.
6. `AUTH_TRUST_HOST=true` is required for the deployment host configuration;
   it is represented in `.env.example` and must be set deliberately.

Phase 5 tidak dijalankan.
