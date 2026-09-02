# Vercel Preview Database Provisioning Audit - 2026-09-02

## Status

**BLOCKED - PREVIEW_DATABASE_NOT_AVAILABLE**

Phase 22G.3 berhenti pada audit kandidat. Tidak ada dedicated PostgreSQL remote non-production yang dapat dipastikan dan diverifikasi aman untuk Vercel Preview pada tahap ini.

Related status: `PREVIEW_DATABASE_TARGET_UNVERIFIED` untuk entry `DATABASE_URL` yang sudah tercatat pada konfigurasi Vercel Preview tetapi nilainya tidak dibaca atau ditampilkan.

## Objective

Menentukan target PostgreSQL non-production yang persistent dan dapat dijangkau Vercel Preview tanpa menyentuh database Production, tanpa mengubah source, dan tanpa melakukan database write.

## Existing Candidates

| Candidate | Availability | Vercel-reachable | Verification | Decision |
| --- | --- | --- | --- | --- |
| Local PostgreSQL `dashboard_pln` | Available locally | No | Existing local baseline only | Not a Preview candidate |
| Supabase E2E project database | Auth E2E project exists | Not verified for business runtime | Current E2E runtime points to local PostgreSQL; remote business schema/data not verified | Not selected |
| Vercel Preview `DATABASE_URL` entry | Entry exists | Unknown | Value intentionally not read; provider, host, database, and environment cannot be confirmed | Target unverified |
| Dedicated hosted PostgreSQL non-production | No confirmed resource found | Unknown | No provider/resource is documented or available for safe verification | Manual provisioning required |

## Vercel Preview DATABASE_URL Audit

The Vercel project has a `DATABASE_URL` entry for Preview, but this audit did not retrieve its value. Therefore the following facts remain unverified:

- whether it points to a non-production database;
- whether it points to Supabase E2E or another dedicated Preview database;
- whether the host is persistent and reachable from Vercel;
- whether SSL is required and enabled;
- whether the connection uses a suitable pooler or connection limit;
- whether the target schema and business data match the application contract.

The local E2E environment was classified without exposing values:

- environment marker: non-production;
- database class: local;
- explicit `sslmode=require`: not confirmed;
- therefore it must not be reused as the Vercel Preview database target.

Production `DATABASE_URL` was not read, used, changed, or selected.

## Safety Verification

| Check | Result |
| --- | --- |
| Production database access | 0 |
| Production Supabase access | 0 |
| Database writes | 0 |
| Schema migration | Not run |
| Seed/import/data copy | Not run |
| Google Sheets sync | Not run |
| Vercel deployment | Not run |
| `.env.local` read | Not performed |
| Secret values displayed | None |

No remote Preview database was verified because no safe, confirmed target was available. Consequently, no read-only database query was run against a Preview target.

The existing local baseline remains unchanged and is referenced only as source context:

- PostgreSQL 18.4;
- local database `dashboard_pln`;
- 30 Prisma models;
- 32 public tables;
- 2,409 verified application/import rows from the prior baseline;
- duplicate rows: 0;
- orphan rows: 0;
- units: Unit 1-3;
- Biomass target: 70,020 tons.

## Database Target Decision

No target was selected automatically.

The recommended target is a dedicated remote non-production PostgreSQL database isolated from Production. It may be:

1. a separately provisioned hosted PostgreSQL database; or
2. an explicitly approved business-data database in the isolated Supabase E2E project.

The target must be persistent, reachable from Vercel Preview, protected by SSL, and configured with connection limits suitable for serverless runtime. If Supabase Transaction Pooler is chosen, the operator should use the provider's documented pooler settings and port 6543 where applicable; migration/admin connectivity must be evaluated separately.

The local database and the current E2E local `DATABASE_URL` are not valid substitutes for a Vercel Preview datasource.

## Manual Action Required

An operator must manually perform the following outside this phase:

- provision or designate a dedicated remote non-production PostgreSQL target;
- confirm that it is isolated from Production and contains no unexpected data;
- apply the approved schema through a separate migration gate;
- decide whether Preview needs an empty schema or an approved sanitized business-data fixture;
- configure the target connection only in Vercel Preview;
- keep Production environment variables unchanged;
- record the provider, database identity, SSL/pooling characteristics, and ownership in the project documentation without recording secrets.

Do not send credentials through chat. Do not reuse the local or Production `DATABASE_URL`.

Before any future data copy, use an explicit allowlist of dashboard business tables. Legacy authentication-sensitive fields and tables, including password, reset-token, and session data, must not be copied as part of Preview fixture preparation unless separately approved.

## Next Gate

`BLOCKED - PREVIEW_DATABASE_TARGET_UNVERIFIED`

Phase 22G.4 may begin only after an operator has configured a dedicated remote non-production target and provided a safe verification path. The next gate must be read-only target verification before any schema migration or data copy.

Phase 22G.4 and Phase 22G.5 were not run.

## Validation

| Validation | Result |
| --- | --- |
| ESLint | PASS (existing Phase 22F validation) |
| TypeScript | PASS (existing Phase 22F validation) |
| Local source/build baseline | PASS (existing Phase 22F validation) |
| Read-only database checks against Preview target | NOT RUN - no safe target confirmed |
| Production access | 0 |
| Database writes | 0 |
| Migration/seed/import/sync | Not run |
| Deployment | Not run |

## Final Recommendation

Keep the project blocked for Preview database readiness. First obtain a dedicated remote non-production PostgreSQL target, configure it only for the Preview environment, and then run a separate read-only verification gate. Do not proceed to schema migration, fixture import, or deployment until that verification passes.
