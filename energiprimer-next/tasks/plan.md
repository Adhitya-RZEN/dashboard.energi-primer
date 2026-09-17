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

---

# Phase 7 — Deterministic sync and production automation

## Objective

Turn the existing Phase 2–6 synchronization pipeline into an unattended,
bounded, deterministic scheduler while preserving the exact Phase 6 canary
boundary. The scheduled path must be independently admitted, fail closed, use
the existing durable ledger and lease, and isolate unknown or ambiguous
worksheets from the business writer.

## Phase 7 assumptions and safety boundary

- The Phase 6/6R Juli evidence is historical and must not be rerun or edited.
- Agustus is not a Phase 7 source or canary. No live Phase 7 business write is
  authorized in this implementation turn.
- Automatic mode is disabled by default and requires an explicit production
  configuration, a valid authenticated cron request, a verified Production
  target, and the durable ledger.
- The existing Phase 6 explicit POST/CLI canary path remains unchanged in
  meaning and continues to require its exact worksheet, plan, approval, and
  ledger gates.
- No Prisma schema or migration is added unless an existing contract proves
  insufficient; registry, lease, sync-run, row-state, schema-review, and
  canonical ledger records are the Phase 7 persistence boundary.
- The no-delete-by-absence rule remains absolute. Missing source rows are
  observable and reconcilable, never delete instructions.

## Architecture decisions

1. Add a typed automatic-mode contract with safe defaults, a kill switch,
   bounded worksheet/record settings, and a cron-trigger predicate. The
   route remains read-only discovery when automatic mode is not fully admitted.
2. Extend worksheet discovery with deterministic `CHANGED` classification from
   stable metadata, while preserving sheet ID as identity and title as mutable
   display metadata.
3. Keep unverified worksheets on a minimal probe path. Only an approved
   profile with a canonical schema may proceed to the bounded full read and
   canonical plan; unknown, malformed, ambiguous, future, or schema-changed
   worksheets are persisted as review evidence and never reach the writer.
4. Add an explicit automatic admission helper and invoke the existing engine
   with `triggerType: "cron"`, `scope: "automatic"`, verified Production,
   `durableLedger: "REQUIRED"`, and `automatic: true`. The engine must reject
   any other Production mode at its deepest boundary.
5. Reuse canonical target-state diff, durable batches, retry/reconciliation,
   leases, and row-state hashes. No new writer or parallel importer is added.
6. Expose bounded, secret-free automation status in structured diagnostics and
   the existing monitoring snapshot. Alerts are derived from failed,
   reconciliation-required, locked, schema-review, and kill-switch states;
   no external alert service or schema migration is introduced here.

## Implementation slices and acceptance checkpoints

### Slice 0 — Contract and plan

- [x] Add the automatic configuration/kill-switch/cron-admission contract and
  document production environment names with fail-closed defaults.
- [x] Add typed automatic execution mode without weakening Phase 6 guards.
- [x] Add pure tests for configuration, trigger authentication, bounds, and
  invalid combinations.

### Slice 1 — Deterministic source admission

- [x] Classify discovery metadata as NEW, CHANGED, RENAMED, UNCHANGED, or
  MISSING using stable sheet identity and deterministic metadata comparison.
- [x] Add minimal unverified worksheet probing and an admission result that
  sends unknown/ambiguous/schema-review sources to isolation.
- [x] Ensure only ACTIVE, approved-profile worksheets can be selected by
  automatic execution; preserve the registry and no-business-write behavior
  for all others.

### Slice 2 — Automatic engine and cron route

- [x] Add the authenticated Vercel cron GET execution branch, guarded by
  deployment environment, automatic mode, kill switch, verified Production,
  durable ledger, lease, and bounded scope.
- [x] Reuse the existing canonical target plan and ledger executor for INSERT /
  UPDATE / SKIP; preserve row identity and no-delete semantics.
- [x] Isolate worksheet failures so one review/error/reconciliation outcome does
  not cause unrelated approved worksheets to be blindly replayed.

### Slice 3 — Recovery, observability, and operator controls

- [x] Verify retry, restart, stale-batch reconciliation, lock contention, and
  idempotent rerun through existing ledger contracts and automatic fixtures.
- [x] Emit structured, secret-free automation events with request/run/source
  correlation and bounded counters.
- [x] Extend monitoring output with automation mode, kill-switch state, last
  automatic run, review/reconciliation/lock signals, and conservative health.

### Slice 4 — Verification and handoff

- [x] Add a Phase 7 disposable verification matrix for unknown/new/changed/new
  approved-profile worksheets, schema isolation, changed rows, retry,
  restart, concurrency, failure isolation, route gating, and no-write mode.
- [x] Run TypeScript, lint, build, Prisma validation, Phase 2–6 checks, and the
  Phase 7 disposable checks.
- [x] Update the existing scheduler/incremental-sync documentation and add a
  Phase 7 result document recording live-canary status as NOT EXECUTED unless
  separately authorized.

## Verification evidence required before any readiness claim

- Static: TypeScript, lint, Next build, Prisma validation.
- Pure/disposable: contract, discovery, admission, schema, change detection,
  ledger recovery/idempotency, route gating, and monitoring tests.
- Existing: Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, and Phase 6R checks.
- Live read-only: target identity and registry/ledger state only, with no
  Agustus or Phase 7 business source promotion.
- Production automation canary: `NOT EXECUTED` in this turn; do not claim
  unattended readiness 4/4 without a separately authorized live lifecycle.
