# Local Google Sheets to Supabase Production Ingestion TODO

- [x] Audit repository docs, `/docx` equivalent, schema, mapping, sync, and env names.
- [x] Confirm existing pooler/direct/local target conventions without printing secrets.
- [x] Implement pure CLI/local/target safety contract.
- [x] Add read-only Supabase Production identity verification.
- [x] Add explicit worksheet dry-run preflight with no database writes.
- [x] Gate Production write on verified target and preflight success.
- [x] Add post-write read-only verification and conservative final status.
- [x] Add focused static safety checks and run existing verification suite.
- [x] Update existing Google Sheets synchronization documentation.
- [x] Re-inspect docs and final git diff; preserve unrelated `graphify-out/`.

## Phase 5 — Canonical target state and durable ledger

- [x] Inspect Phase 2–4 contracts, current production schema boundary, and
  migration policy.
- [x] Implement deterministic canonical target-state lookup and diff.
- [x] Add immutable canonical plan/batch ledger models and migration artifact.
- [x] Implement explicit ledger state machine and restart-safe recovery.
- [x] Adapt the bounded writer behind the canonical batch repository.
- [x] Add target-level reconciliation and mismatch reporting.
- [x] Require explicit Production canary authorization; default to zero writes.
- [x] Run focused and prior validation checks.
- [x] Create the Phase 5 result document and record Production read-only evidence.

Production canary execution remains intentionally `NOT EXECUTED`; its absence
is a Phase 5 gate result, not an incomplete implementation task.
