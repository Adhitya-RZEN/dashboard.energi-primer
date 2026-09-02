# Auth Migration Schema Plan (Design Only)

> PHASE 6C UPDATE (2026-09-02): This design is not an active recovery/mail
> contract. The legacy token model remains unchanged and any database cleanup
> requires a separately approved migration.

> **SUPERSEDED.** This design assumed an identity bridge for migrating
> existing users. The approved strategy creates new Supabase Auth users and
> performs no user migration; no schema change is required for that strategy.

Tanggal: 2026-09-02  
Status: **REQUIRES MANUAL APPROVAL**  
Execution status: **NOT EXECUTED**

Dokumen ini dibuat karena audit migrasi Supabase Auth menemukan perbedaan
identity type antara application user dan Supabase Auth. Dokumen ini bukan
migration SQL dan tidak memberi izin untuk mengubah database.

## Required change

Diperlukan identity bridge yang menyimpan hubungan satu-ke-satu antara:

```text
public.users.id       BIGINT
        |
        | 1:1
        v
Supabase auth.users.id UUID
```

Rekomendasi awal adalah dedicated table, bukan mengubah primary key
`public.users`:

```text
auth_user_links
----------------
local_user_id    BIGINT  NOT NULL, UNIQUE
supabase_user_id UUID    NOT NULL, UNIQUE
created_at       TIMESTAMP NOT NULL
updated_at       TIMESTAMP NOT NULL
```

Constraint yang harus divalidasi dan disetujui sebelum implementasi:

- `local_user_id` foreign key ke `public.users(id)` dengan perilaku delete
  restrictive;
- `supabase_user_id` unique;
- satu application user hanya boleh memiliki satu Supabase identity;
- satu Supabase identity hanya boleh dipetakan ke satu application user;
- tabel tidak boleh dibuka untuk operasi `anon` atau `authenticated`;
- akses mapping hanya melalui server-side Prisma atau jalur admin yang telah
  disetujui.

Alternatif yang perlu dibandingkan oleh owner adalah kolom nullable
`auth_user_id UUID UNIQUE` pada `public.users`. Alternatif tersebut menyentuh
tabel existing secara langsung dan tetap membutuhkan schema/data migration.

## Reason

Schema saat ini memakai `users.id BIGINT` sebagai primary key dan
`sessions.user_id BIGINT`. Supabase Auth memakai UUID. Menggunakan email sebagai
satu-satunya mapping tidak menyediakan foreign-key identity dan dapat salah
ketika email berubah atau terjadi duplikasi/case normalization.

Primary key `public.users.id`, foreign key business, `sessions.user_id`, dan
seluruh business data tidak boleh diubah hanya untuk menyesuaikan Supabase
Auth.

## Affected tables and columns

### Existing tables

| Object | Affected field | Change |
|---|---|---|
| `public.users` | `id`, `email`, `role` | Read-only identity/profile source; no change in this plan |
| `public.sessions` | `user_id` | Remains `BIGINT`; legacy/Auth.js session table is not rewritten |
| `public.password_reset_tokens` | all fields | Retained until Supabase recovery E2E and cutover pass |

### Proposed new table

| Object | Fields | Purpose |
|---|---|---|
| `public.auth_user_links` | `local_user_id`, `supabase_user_id`, timestamps | Explicit one-to-one identity bridge |

`auth.users` is Supabase-managed. No direct password-hash update, primary-key
rewrite, or destructive change is proposed.

## Foreign keys and indexes

Proposed design, subject to platform/owner validation:

- foreign key `auth_user_links.local_user_id -> public.users.id`;
- restrictive delete behavior so an application user cannot silently lose its
  mapping;
- unique index on `local_user_id`;
- unique index on `supabase_user_id`;
- optional index for server lookup by the Supabase UUID if the unique index is
  not already used for that access pattern.

Do not create these objects until the owner approves the schema and a backup /
restore rehearsal is recorded.

## Data migration plan (not executed)

1. Prepare an isolated Supabase Auth project and isolated application database.
2. Provision test identities through the official Supabase Auth admin flow; do
   not import existing bcrypt hashes manually.
3. Resolve each eligible application account through a controlled, audited
   mapping process. Do not print user lists, emails, hashes, or tokens.
4. Insert bridge records only in the isolated environment and verify one-to-one
   uniqueness, role lookup, and account disable/revocation behavior.
5. Use user-driven Supabase recovery/password setup for accounts whose existing
   bcrypt hash cannot be safely migrated.
6. Run login, logout, role, session invalidation, recovery, and password-update
   E2E tests against the isolated environment.
7. Obtain a separate production change approval before provisioning production
   identities or writing bridge records.

No production application row, business row, password hash, or reset token is
changed by this plan.

## Application impact

The eventual implementation would need to update, in a controlled branch:

- browser Supabase client for sign-in/sign-out/recovery;
- server Supabase client and cookie handling;
- `src/proxy.ts` and protected layouts;
- role resolution from Supabase UUID to `public.users` through the bridge;
- password change and recovery actions;
- Auth.js route and type declarations, only after the replacement passes;
- E2E and client bundle secret scans.

Prisma remains the business-data access layer. Business queries continue to use
the existing numeric application identity and are not converted to UUIDs.

## RLS and privilege impact

The existing Supabase Data API hardening must remain intact. The bridge must not
become publicly writable or readable by default. If a future browser data path
needs RLS, that is a separate security design requiring `auth.uid()` policies,
least privilege, and policy tests. No grants or policies are changed here.

## Rollback plan

Before production cutover:

- retain Auth.js and the current reset flow as the known-good application;
- keep the bridge migration reversible through the approved backup/restore or
  reviewed forward-migration procedure;
- do not delete existing users, passwords, sessions, reset tokens, or business
  rows during rollback;
- if isolated tests fail, discard the isolated application/database change only;
- if production provisioning is later approved and fails, stop cutover, restore
  the last known-good application, preserve audit records, and use an approved
  forward/restore operation.

No rollback operation was executed.

## Risks

| Risk | Mitigation |
|---|---|
| Wrong UUID-to-user mapping | Explicit unique bridge, controlled matching, review, and isolated rehearsal |
| Account email changes | Resolve authorization by immutable bridge identity, not email alone |
| Password hash incompatibility | User-driven Supabase recovery/password setup; no manual hash writes |
| Role escalation | Keep role server-controlled in application data; never trust browser metadata |
| Session remains valid after role/password change | Test revoke/reauthentication and retain application-side security checks |
| Auth.js and Supabase sessions overlap | Use staged isolated testing; remove Auth.js only after acceptance |
| RLS/Data API exposure | Preserve least-privilege hardening; separate policy review |
| Production outage during cutover | Backup, rollback owner, change window, and last-known-good deployment |

## Approval gate

The following approvals are required before implementation:

- identity bridge design selection;
- schema change and migration window;
- user provisioning and password recovery strategy;
- session invalidation behavior;
- Supabase Auth environment and service-role handling;
- isolated E2E acceptance criteria;
- production cutover and rollback owner.

**Current decision: REQUIRES MANUAL APPROVAL.**
