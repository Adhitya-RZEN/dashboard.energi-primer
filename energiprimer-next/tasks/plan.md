# Local Google Sheets to Supabase Production Ingestion Plan

## Objective

Provide one repeatable local operator workflow for an explicitly selected
Google Sheets worksheet that can dry-run, positively identify the Supabase
Production runtime target, reuse the existing parser/mapping/sync/import
architecture, and perform an idempotent transactional write only after all
gates pass.

## Scope

- Extend the existing `sheets:sync` command; do not add a parallel importer.
- Add a read-only production-target verifier and a local-execution guard.
- Add an explicit worksheet dry-run with discovery, schema, validation, and
  INSERT/UPDATE/SKIP/duplicate classification.
- Gate non-local writes on positive Supabase Production identity, not on a
  caller-controlled boolean alone.
- Add post-write read-only verification and safe operator output.
- Update the existing Google Sheets sync documentation.
- Do not change Prisma schema, migrations, secrets, Vercel configuration, or
  the scheduled route contract.

## Acceptance criteria

1. A production-targeted command fails closed unless it is running locally,
   has an explicit worksheet, uses the approved Supabase transaction pooler,
   and verifies `current_database()`, `current_schema()`, and required sync
   tables before any write.
2. `--dry-run` performs no database mutation, prints only safe target identity,
   and reports discovery, mapping, structural/data/business validation,
   invalid reasons, and existing/new/duplicate counts.
3. A production write reuses the current sync lease, stable source keys,
   row-state classification, import transaction, and no-delete policy.
4. A repeated run produces SKIP for unchanged source keys and no duplicate
   normalized records.
5. Target mismatch, ambiguous worksheet/mapping, parser/business-rule failure,
   duplicate stable keys, or verification mismatch returns a conservative
   non-success status and never claims VERIFIED.
6. Existing static verification, lint, type-check/build checks, and focused
   new safety checks pass where the environment permits. Live Production
   verification is reported separately if network or approval prevents it.

## Implementation slices

### Slice 1 — target and execution safety

- Add pure URL/CLI/environment safety helpers.
- Add read-only Supabase Production identity verification using the approved
  pooler endpoint.
- Add focused static checks for local-only and wrong-target rejection.

### Slice 2 — read-only worksheet preflight

- Require an explicit worksheet for this operator flow.
- Reuse metadata listing, exact worksheet reads, dynamic parser, import plan,
  schema policy, registry reads, and `classifySyncRows`.
- Produce a safe dry-run report with row-level validation diagnostics where
  available and no registry/lease/sync-run writes.

### Slice 3 — gated write and verification

- Make the production path invoke the same preflight before the existing
  incremental engine.
- Replace the unbounded non-local boolean with a verified target requirement
  for the local Production CLI, while retaining the protected route’s existing
  deployment gate.
- Add post-write read-only consistency checks and conservative status output.

### Slice 4 — documentation and full validation

- Re-inspect `energiprimer-next/docs` as the repository’s documented equivalent
  of the requested `/docx` source.
- Update the existing sync scheduler/incremental-sync documentation with the
  command, target contract, dry-run output, and known live-verification limits.
- Run lint, type-check/build, focused checks, and relevant existing checks.

## Files expected to change

- `scripts/run-google-sheets-sync.ts`
- `src/services/google-sheets/sync/engine.ts` or a small adjacent preflight
  module, only where reuse requires it
- `src/services/google-sheets/import/commit.ts` target gate, if required
- one or more existing files under `docs/` (no duplicate documentation)
- focused verification script(s) and `package.json` script entries

## Explicit non-goals

- No production write during implementation without an explicit worksheet and
  a separate operator approval.
- No direct SQL data import, schema migration, delete/truncate, new mapping
  policy, or new traceability column.
- No output of passwords, connection strings, service-account material, or
  private identifiers.

---

# Phase 5 — Canonical target state, durable batch ledger, and production canary

## Objective

Extend the Phase 2–4 canonical pipeline with an authoritative read-only target
state, an immutable approved-plan snapshot, a durable per-batch ledger, and
restart-safe recovery. Keep Production writes disabled unless the canary has a
separate explicit authorization and all Phase 5 gates are proven.

## Constraints and assumptions

- The existing compatibility import writer remains an adapter until the
  canonical batch repository and reconciliation evidence are complete.
- The application Prisma history receives one additive ledger migration. The
  separately governed `prisma/production` baseline is not changed or applied
  during this phase.
- Target state is read on demand from canonical normalized tables; it is not
  inferred from UI state, worksheet position, display labels, or `sync_row_states`.
- An absent explicit canary authorization means zero Production writes and a
  `NOT EXECUTED` canary result.

## Implementation slices and acceptance checkpoints

### Slice 0 — Baseline and contract

- [x] Re-read Phase 2–4 results, migration policy, production verifier, and
  current normalized target models.
- [x] Record the production schema/migration boundary and no-write canary
  assumption.

### Slice 1 — Target-state integrity

- [x] Define target-state value, existence, provenance, version-marker, and
  deterministic `INSERT`/`UPDATE`/`NO-OP`/`SKIP`/`BLOCK` contracts.
- [x] Add set-based target lookup for all canonical entities.
- [x] Add identity, duplicate, missing-target, conflict, and value-diff tests.

### Slice 2 — Durable ledger

- [x] Add additive application Prisma models and migration for immutable plan
  snapshots and ordered batch records.
- [x] Implement explicit run/batch state transitions, retryability, execution
  correlation, and bounded transaction boundaries.
- [x] Add create/transition/immutability/idempotency/failure-injection tests.

### Slice 3 — Restart-safe execution

- [x] Resume from durable batch state; skip committed batches; retry only
  known-rollback failures; reconcile unknown or stale-running outcomes first.
- [x] Adapt the existing bounded writer behind the canonical batch repository.
- [x] Keep canonical target diff authoritative over legacy row-state change
  classification.

### Slice 4 — Reconciliation and canary gate

- [x] Add actual target reconciliation for every planned identity/value and
  explicit `RECONCILIATION_MISMATCH` evidence without autofix.
- [x] Add canary preflight and authorization gate with zero-write default.
- [x] Record before/after read-only scope evidence and planned/actual counts.

### Slice 5 — Evidence and handoff

- [x] Run the focused Phase 5 matrix plus prior Phase 2–4 checks.
- [x] Run a fresh Production read-only probe; do not apply the pending ledger
  migration or execute a Production canary absent explicit authorization.
- [x] Create `docs/PHASE5_CANONICAL_TARGET_STATE_DURABLE_LEDGER_RESULT.md` with
  conservative gates, limitations, and the next recommended phase.

## Verification checkpoints

- TypeScript, lint, build, Prisma validation, and migration SQL inspection.
- Pure target-state/diff and ledger/recovery tests with timing breakdowns.
- Existing Phase 2, Phase 3, and Phase 4 verification scripts.
- Production metadata, target-scope, and schema-history reads only.
