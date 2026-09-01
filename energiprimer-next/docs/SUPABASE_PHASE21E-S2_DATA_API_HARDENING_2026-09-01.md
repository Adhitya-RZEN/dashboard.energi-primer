# PHASE 21E-S2 — SUPABASE DATA API PRIVILEGE HARDENING

Tanggal: 1 September 2026

## Status

**PASS WITH REVIEW**

Security exposure pada application tables sudah ditutup untuk role
`anon` dan `authenticated`. Status tetap **PASS WITH REVIEW** karena project
Data API setting belum diverifikasi melalui Management API/Dashboard,
Security Advisor belum di-refresh melalui dashboard, RLS masih partial, dan
default privilege milik role Supabase-managed sengaja tidak disentuh.

Phase ini berhenti di sini. Tidak ada data migration, import, Google Sheets
sync, cutover, atau deployment yang dijalankan.

## Scope dan safety boundary

Arsitektur yang diverifikasi:

```text
Browser → Next.js → Auth.js → server-only Prisma → PostgreSQL/Supabase
```

Static source audit menghasilkan:

| Check | Result |
| --- | --- |
| `@supabase/supabase-js` / browser client | NOT FOUND |
| Supabase REST `/rest/v1/` | NOT FOUND |
| Supabase GraphQL `/graphql/v1/` | NOT FOUND |
| `NEXT_PUBLIC_SUPABASE_*` | NOT FOUND |
| Prisma pada client component | NOT FOUND |
| `server-only` pada Prisma/service boundary | PASS |
| Direct browser Supabase Data API | NO |

Tidak ada akses ke schema `auth`, `realtime`, `storage`, atau `vault` yang
diubah. Tidak ada RLS massal, policy baru, schema/column/table change, atau
business data mutation.

## Preflight sebelum remediation

Preflight read-only dijalankan dengan Direct Connection dan menghasilkan:

| Check | Result |
| --- | --- |
| Direct Connection | PASS |
| SSL Direct | PASS (`verify-full` in-memory probe) |
| PostgreSQL | 17.6 |
| Database / role / schema | `postgres` / `postgres` / `public` |
| Application tables | 30/30 |
| `_prisma_migrations` | PRESENT; 1 metadata row |
| Public table baseline | 31/31 exact |
| Public sequence baseline | 25/25 exact |
| Public views | 0 |
| Non-baseline public functions | 0 |
| Business rows | 0 |
| Table owners | `postgres` only |
| `anon`/`authenticated` table access before | ALL on 31/31 |
| `postgres`/`service_role` table access before | ALL on 31/31 |

Satu fungsi publik yang ditemukan adalah `public.rls_auto_enable()` dengan
return type `event_trigger`, owner `postgres`, dan event trigger `ensure_rls`.
Fungsi ini diklasifikasikan sebagai baseline helper; event trigger dan body
fungsi tidak diubah.

## Remediation yang dijalankan

Satu transaksi permission-only berhasil dengan **6 permission changes**:

1. `REVOKE ALL PRIVILEGES` dari `anon` dan `authenticated` pada 30 application
   tables serta `_prisma_migrations`.
2. `REVOKE ALL PRIVILEGES` dari `anon` dan `authenticated` pada 25 application
   sequences.
3. `REVOKE EXECUTE` pada `public.rls_auto_enable()` dari `PUBLIC`, `anon`, dan
   `authenticated`. Hak `postgres` dan `service_role` tetap tersedia.
4. Menutup default table privileges role `postgres` untuk `anon` dan
   `authenticated`.
5. Menutup default sequence privileges role `postgres` untuk `anon` dan
   `authenticated`.
6. Menutup default function privileges role `postgres` untuk `anon` dan
   `authenticated`.

Tidak dilakukan revoke terhadap `postgres`, `service_role`, database owner,
atau schema internal Supabase. Schema `public` tetap memiliki `USAGE` untuk
role public, tetapi tanpa table/function privilege application surface tidak
dapat diakses oleh role tersebut.

## Verifikasi sesudah remediation

### Effective privileges

| Role | Table privileges | Sequence privileges | Function helper EXECUTE |
| --- | --- | --- | --- |
| `anon` | 0/31 | 0/25 | DENIED |
| `authenticated` | 0/31 | 0/25 | DENIED |
| `postgres` | 31/31 | 25/25 | ALLOWED |
| `service_role` | 31/31 | 25/25 | ALLOWED |

### Read-only permission probes

Tidak ada statement INSERT/UPDATE/DELETE yang dieksekusi. Probe SELECT
menggunakan `LIMIT 0`; hasil efektif privilege DML diverifikasi melalui
`has_table_privilege`.

| Role | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `anon` | DENIED | DENIED | DENIED | DENIED |
| `authenticated` | DENIED | DENIED | DENIED | DENIED |

### Connection, Prisma, schema, dan data

| Check | Result |
| --- | --- |
| Supabase Direct Connection | PASS |
| Supabase Transaction Pooler | PASS |
| Direct SSL | PASS |
| Pooler SSL | PASS via `sslmode=verify-full`; backend SSL flag tidak dilaporkan oleh pooler |
| PostgreSQL target | 17.6 |
| Exact public schema baseline | PASS; 31 tables |
| Prisma schema parity | PASS; 30 tables, 270 columns, 30 PK, 19 FK, 40 indexes |
| Prisma migration history | PASS; baseline finished, checksum match, up to date |
| Supabase business rows | 0 |
| Supabase schema changes in this phase | 0 |
| Supabase business data changes | 0 |
| `DATABASE_URL` local | UNCHANGED |
| Local database writes | 0 |
| Local `db:verify` | PASS |

Extensions yang terlihat pada target tetap merupakan extension existing:
`pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, dan
`uuid-ossp`. Tidak ada extension yang dibuat atau diubah.

## Default privileges dan RLS review

Default privileges milik `postgres` sudah tidak memberikan table, sequence,
atau function privileges kepada `anon`/`authenticated`.

Default privileges milik `supabase_admin` masih memberikan privileges tersebut
dan sengaja tidak diubah karena merupakan role platform-managed. Ini bukan
perubahan business data, tetapi perlu ditinjau manual bila ada kemungkinan
application object dibuat oleh `supabase_admin` di masa depan.

RLS saat ini **PARTIAL**: hanya `sessions` yang terdeteksi enabled dan tidak
ada public policy. Phase ini tidak mengaktifkan RLS massal dan tidak membuat
policy `auth.uid()`, karena identity/authorization aplikasi dikelola Auth.js,
bukan Supabase Auth.

## Data API decision

Konfigurasi project Data API/exposed schema tidak dapat dipastikan hanya dari
catalog SQL ini; `pgrst.db_schemas` tidak dilaporkan oleh koneksi database.
Tidak ada Supabase Management API key yang digunakan dan tidak ada perubahan
Dashboard/API configuration dilakukan.

Keputusan phase:

```text
DATA_API_KEEP_ENABLED_WITH_NO_APP_TABLE_GRANTS
```

Semua application table dan migration metadata tidak lagi memiliki effective
table access untuk `anon`/`authenticated`. Jika Data API tidak diperlukan sama
sekali, disable Data API tetap menjadi keputusan manual terpisah.

## Security Advisor

**Belum di-refresh melalui Supabase Dashboard.** Warning RLS disabled/partial
mungkin tetap muncul dan harus diklasifikasikan sebagai architecture-specific
selama Data API tidak menjadi jalur aplikasi. Advisor rule tidak dinonaktifkan
hanya untuk menghilangkan warning.

## Files changed in Phase 21E-S2

- `scripts/harden-supabase-data-api-privileges.mjs` — guarded preflight,
  one-transaction privilege hardening, and post-verification.
- `scripts/verify-supabase-phase21es2.mjs` — read-only Direct/Pooler/local
  verification and permission probes.
- `scripts/verify-supabase-production-migrate-status.mjs` — guarded read-only
  Prisma migration status check.
- `package.json` — reproducible command aliases for preflight, hardening,
  verification, and migration status.
- `docs/SUPABASE_PHASE21E-S2_DATA_API_HARDENING_2026-09-01.md` — this report.

`.env.local`, credentials, Prisma schema, migrations, application business
logic, Auth.js, Google Sheets integration, and local database were not
modified by this phase.

## Requires manual approval

1. Confirm the Supabase Dashboard Data API exposed schemas/project setting.
2. Decide whether Data API should remain enabled or be disabled entirely.
3. Review whether future application tables can ever be created by
   `supabase_admin`; if yes, design a platform-safe default-privilege policy.
4. Select a dedicated least-privilege production runtime role instead of
   using the administrative/bypass-RLS `postgres` role. This is an architecture
   and deployment decision, not performed here.
5. Decide whether a future Auth.js-compatible RLS design is required.
6. Refresh and classify Supabase Security Advisor findings.

## Stop condition

The following were **not** run:

- Gate B1;
- schema migration or `prisma db push`;
- data migration/import;
- Google Sheets synchronization;
- application `DATABASE_URL` cutover;
- Vercel deployment.

**Final: PASS WITH REVIEW — wait for manual approval before data migration.**
