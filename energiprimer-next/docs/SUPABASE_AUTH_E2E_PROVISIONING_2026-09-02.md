# Supabase Auth E2E Provisioning — 2026-09-02

> HISTORICAL / NON-ACTIVE (Phase 6C, 2026-09-02): Provisioning notes below are
> retained for audit history and are not an active credential instruction.

## Status

`READY_FOR_PROVISIONING`

Provisioning has been made idempotent. The implementation was validated
statically, but it was not executed in this phase. No Supabase write occurred.

## Changed file

- `scripts/provision-supabase-auth-e2e-admin.mjs`

No authentication runtime, business logic, database schema, business data,
environment file, or Production configuration was changed.

## Behavior

1. Validate that the target is explicitly non-production:
   `SUPABASE_AUTH_E2E_ENVIRONMENT=non-production`.
2. Require the explicit confirmation marker:
   `SUPABASE_AUTH_E2E_CONFIRMATION=NON_PRODUCTION_ONLY`.
3. Validate the Supabase E2E URL shape and required E2E provisioning variables.
4. Perform an Admin API `listUsers()` lookup by the configured E2E email before
   any write.
5. If the user does not exist, call `createUser()` with:
   - the configured email;
   - the configured password;
   - `email_confirm: true`;
   - `app_metadata.role: admin`.
6. If the user exists and is not an admin, call `updateUserById()` using the
   existing user ID and only the merged `app_metadata` with `role: admin`.
   Existing app metadata fields are preserved.
7. If the user already has the admin role, perform no write and return
   `USER_ALREADY_ADMIN`.
8. After `createUser()` or `updateUserById()`, perform a new read-only lookup
   and verify user existence, email confirmation, and admin role.

The existing-user update does not send a password, email, or `user_metadata`.
It does not access `public.users` or business tables.

## Safe output

Successful outcomes are limited to:

- `USER_CREATED`
- `USER_UPDATED`
- `USER_ALREADY_ADMIN`

Failures return `FAILURE` with non-secret reason, HTTP status, and sanitized
error code/message. Passwords, service-role keys, tokens, email addresses, and
user IDs are never printed.

## Environment boundary

The script reads only explicitly named `SUPABASE_AUTH_E2E_*` values from its
process environment. The package command supplies those values through
`scripts/run-e2e-with-env.mjs`, which reads only `.env.e2e.local` and rejects
unsupported names. There is no `.env.local` or Production fallback.

The service-role key is used only by this server-side provisioning process. It
is not passed to the browser or Next.js runtime.

## Validation

- `npm.cmd run lint`: PASS
- `npx.cmd tsc --noEmit`: PASS
- `node --check scripts/provision-supabase-auth-e2e-admin.mjs`: PASS
- Static API/security check: PASS
- Provisioning execution: NOT RUN
- E2E execution: NOT RUN
- Supabase writes in this phase: `0`

## Expected next result for the current E2E user

The previously verified E2E user exists but does not currently have
`app_metadata.role=admin`. Therefore, after separate approval to execute
provisioning, the expected idempotent path is `USER_UPDATED`, followed by
read-only verification. This phase did not perform that update.
