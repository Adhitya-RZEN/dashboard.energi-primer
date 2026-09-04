# PHASE 6E-G — ONE AUTHORIZED PRODUCTION SYNC + DIAGNOSTIC CAPTURE

Project: Energi Primer PLN Jeranjang  
Repository: `energiprimer-next`  
Branch: `NextJs`  
Date: 2026-09-03  
Scope: exactly one authorized Production sync and read-only diagnostic capture

## 1. Explicit Approval

Operator approval received:

> Saya menyetujui satu authorized Production sync Phase 6E-G.

The approval was used for exactly one authorized POST. Two earlier local command-construction attempts stopped before any HTTP request and did not consume the sync allowance. No valid sync request was sent until the final corrected command.

## 2. Production Deployment Identity

- Canonical URL: `https://dashboard-energi-primer.vercel.app`
- Deployment URL: `https://dashboard-energi-primer-drlt5eh6p-projek-rzen.vercel.app`
- Deployment ID: `dpl_Hg43oUhhgMfGCpZD8nmUMMzy4DEc`
- Target/state: `production` / `READY`
- Source commit: `da5d9914d6e3e7741ed76cb9ad3bc9ca41646344`
- Source branch: `NextJs`
- The deployment metadata source SHA exactly matched the local HEAD before execution.

## 3. Pre-Sync State

- `authorized_sync_count` before execution: `0`
- `CRON_SECRET`: configured; value was never printed or exposed
- Deployment: READY
- Diagnostic instrumentation: present in the verified source commit and deployed sync function
- `sync:verify-state`: PASS
- Registered worksheets: `199`
- Active worksheets: `7`
- Persisted row states: `2409`
- Latest run before execution: `SUCCESS`
- Active leases before execution: `0`
- Open schema changes before execution: `0`
- No source, environment, credential, database schema, or deployment change was made before the request.

## 4. Sync Start/End Time

| Event | WITA / UTC+08:00 | UTC |
|---|---|---|
| Request start | `2026-09-03 22:26:26.362 +08:00` | `2026-09-03T14:26:26.362Z` |
| Request end | `2026-09-03 22:27:39.269 +08:00` | `2026-09-03T14:27:39.269Z` |

Client-observed duration: `72,938 ms`.

## 5. HTTP Result

- Request: exactly one `POST /api/sync/google-sheets`
- HTTP status: `500`
- Response status field: `FAILED`
- Sanitized response message: `Synchronization failed.`
- Response keys: `message`, `status`
- Authorization header and response body contents were not recorded.

Per the Phase 6E-G stop rule, no retry, second sync, Cron trigger, or confirmation request was sent.

## 6. request_id

`d5a5672c-b1c1-4818-8cd1-157dfabd52d1`

This UUID correlated the single Production invocation to the diagnostic log entries.

## 7. Stage Execution Timeline

The Vercel runtime log timestamp for this invocation was approximately `2026-09-03 22:26:25.456 +08:00`. The duplicate `sync_request` line emitted by the Vercel request record and nested log view is represented once below.

Observed execution order:

1. `sync_request` — PASS
2. `environment_gate` — PASS
3. `google_config` — PASS
4. `google_oauth` — PASS, `191 ms`
5. `google_metadata` — PASS, `9,488 ms`
6. `discovery_transaction` — **FAIL**, `61,599 ms`, safe code `P2028`
7. `sync_complete` — **FAIL**, `71,281 ms`, safe code `P2028`

The request did not reach the lease, sync run, worksheet, import, row-state, or finalization stages.

## 8. Stage-by-Stage Diagnostic Table

| Stage | Status | Duration ms | Category | Safe Code | Attempt | Google HTTP |
|---|---|---:|---|---|---:|---:|
| `sync_request` | PASS | 0 | NONE | NONE | — | — |
| `environment_gate` | PASS | 0 | NONE | NONE | — | — |
| `google_config` | PASS | 0 | NONE | NONE | 1 | — |
| `google_oauth` | PASS | 191 | NONE | NONE | 1 | — |
| `google_metadata` | PASS | 9488 | NONE | NONE | 1 | — |
| `discovery_transaction` | FAIL | 61599 | NONE | P2028 | 1 | — |
| `source_lease` | NOT REACHED | — | — | — | — | — |
| `sync_run_create` | NOT REACHED | — | — | — | — | — |
| `worksheet_processing` | NOT REACHED | — | — | — | — | — |
| `import_transaction` | NOT REACHED | — | — | — | — | — |
| `row_state_transaction` | NOT REACHED | — | — | — | — | — |
| `sync_run_finalize` | NOT REACHED | — | — | — | — | — |
| `sync_complete` | FAIL | 71281 | NONE | P2028 | — | — |

`NONE` is the literal emitted `error_category` field. The safe code was captured, but the current spread mapping from the diagnostic error object does not populate the emitter's `errorCategory` field; this is a diagnostic instrumentation finding and was not remediated in this phase.

## 9. Google Diagnostic Evidence

- `google_config`: PASS, attempt 1
- `google_oauth`: PASS, `191 ms`, attempt 1
- `google_metadata`: PASS, `9,488 ms`, attempt 1
- `google_http_status`: not emitted for these successful stages
- No OAuth token, private key, or Google response body was captured

Google configuration, OAuth, and metadata retrieval completed before the first failure. They are not the first failing boundary for this invocation.

## 10. Prisma/Database Diagnostic Evidence

The first failing stage emitted safe error code `P2028` at `discovery_transaction`. The discovery transaction in the verified source is configured with `maxWait: 10,000 ms` and `timeout: 60,000 ms`; the observed failure duration was `61,599 ms`, which is consistent with the transaction deadline/closed-transaction boundary.

This evidence identifies the failing application stage and Prisma safe code. It does **not** establish an underlying PostgreSQL/SSL cause. Historical `08P01` and `08006` events remain candidate evidence only and were not correlated to this request.

## 11. syncRun.create Result

**NOT REACHED**

The stage timeline contains no `sync_run_create` entry. Post-sync read-only inspection found `runCountSinceSyncStart: 0`; the latest run remained the earlier run with ID `1`, status `SUCCESS`, and trigger type `cron`.

## 12. Worksheet Processing Result

**NOT REACHED**

No worksheet was selected or processed by this invocation. The pre-existing registered worksheet state remained available for inspection, but it was not modified by a committed sync transaction.

## 13. Import Transaction Result

**NOT REACHED**

No import transaction began. No application data rows were inserted or updated by the failed invocation.

## 14. Row-State Result

**NOT REACHED**

The row-state transaction did not execute. Post-sync read-only inspection reported `2409` existing row states and `0` duplicate natural-key groups.

## 15. Finalization Result

**NOT REACHED**

Neither `sync_run_finalize` nor a new `SyncRun` finalization occurred. The failure propagated to the route's terminal `sync_complete` diagnostic and produced HTTP 500.

## 16. Post-Sync Read-Only Verification

The authorized sync's failed discovery transaction left no committed sync-run or lease state:

| Check | Result |
|---|---|
| Read-only DB query | PASS |
| Source status | ACTIVE |
| Active lease | 0 / false |
| Latest run | ID `1`, `SUCCESS`, trigger `cron` |
| Latest run started/finished | `2026-09-02T13:38:46Z` / `2026-09-02T13:38:55Z` |
| Latest run rows/inserted/updated/skipped/failed | `0 / 0 / 0 / 0 / 0` |
| Worksheet count / active | `199 / 7` |
| Row-state count | `2409` |
| Open schema changes | `0` |
| Duplicate natural-key groups | `0` |
| New sync runs since request start | `0` |
| Last discovered timestamp | `2026-09-02T13:37:57Z` |
| Production migration status | READ_ONLY PASS; up to date or no pending migrations |
| Writes outside the authorized sync | `0` |

The discovery transaction's database changes were not persisted after the P2028 failure. No manual database verification write was performed.

## 17. Source Data Freshness Interpretation

Source freshness was not evaluated because worksheet processing and import never began. The known Google Sheet COPY boundary through July 2026 remains applicable; July data must not be classified as stale solely on that basis.

## 18. Root Cause Classification

**FAILED — ROOT CAUSE IDENTIFIED**

The immediate causal failure boundary is identified as:

`discovery_transaction` → safe Prisma code `P2028` → terminal `sync_complete` failure → HTTP 500.

This is a root-cause classification at the application execution-stage level. The ultimate infrastructure reason behind P2028 is still unknown; this report does not claim PostgreSQL SSL, pooler, or network causality.

## 19. Evidence Supporting Classification

- The same `request_id` correlates all observed diagnostic entries.
- Configuration, environment, OAuth, and Google metadata stages passed first.
- `discovery_transaction` is the first and only failing operational stage.
- Its safe code is `P2028`, with duration `61,599 ms` against the configured `60,000 ms` transaction timeout.
- No `source_lease`, `sync_run_create`, worksheet, import, row-state, or finalization stage was reached.
- HTTP 500 and response status `FAILED` agree with the terminal diagnostic.
- Post-sync DB state shows no new run, no active lease, no new discovery timestamp, and no persistent row/data changes.
- The diagnostic category field emitted `NONE`, so the underlying category is intentionally not inferred from the missing field.

## 20. Remaining Unknowns

1. The underlying cause of the discovery transaction's P2028 remains unproven beyond the transaction-stage/deadline evidence.
2. No correlated PostgreSQL/Supabase server event was captured for this request.
3. Historical `08P01`/`08006` events cannot be attributed to this invocation.
4. The diagnostic `error_category` mapping emitted `NONE` instead of a populated category and requires a separate remediation phase.
5. No successful worksheet/import execution occurred, so data freshness and normal import counters were not tested.

## 21. Safety Counters

| Counter | Expected | Actual |
|---|---:|---:|
| Authorized Production sync | 1 | 1 |
| Production retry | 0 | 0 |
| Additional Production sync | 0 | 0 |
| Database writes outside sync | 0 | 0 |
| Google Sheet writes outside sync | 0 | 0 |
| Migration | 0 | 0 |
| db push | 0 | 0 |
| migration resolve | 0 | 0 |
| Environment change | 0 | 0 |
| Credential change | 0 | 0 |
| Deployment | 0 | 0 |
| Commit | 0 | 0 |
| Push | 0 | 0 |

Normal writes attributable to the one authorized sync: **0 persisted**; the discovery transaction failed/rolled back before `sync_run.create`. The two local command-construction failures and all log/DB checks did not issue additional sync requests.

## 22. Recommended Next Step

**STOP.** Do not retry, trigger Cron, send another sync, deploy, modify source, modify environment, modify the database manually, commit, or push.

Treat `discovery_transaction` / `P2028` as the evidence boundary for a separate remediation/investigation phase. Wait for further explicit operator instruction.

