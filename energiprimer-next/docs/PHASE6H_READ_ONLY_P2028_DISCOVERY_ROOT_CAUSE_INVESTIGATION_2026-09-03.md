# PHASE 6H — READ-ONLY P2028 DISCOVERY TRANSACTION ROOT-CAUSE INVESTIGATION

> **HISTORICAL / SUPERSEDED FOR IMPLEMENTATION:** This read-only investigation
> records the pre-Phase 6J sequential discovery transaction and its 60-second
> P2028 observation. Phase 6J implements the approved remediation; consult its
> implementation report for current behavior and gate status.

Project: Energi Primer PLN Jeranjang  
Repository: `energiprimer-next`  
Branch: `NextJs`  
Date: 2026-09-03  
Mode: read-only investigation only

## 1. Executive Summary

**READ-ONLY INVESTIGATION COMPLETE — INFRASTRUCTURE ROOT CAUSE NOT IDENTIFIED**

The Phase 6E-G request failed at the first operational database boundary:

`discovery_transaction` → safe Prisma code `P2028` → `sync_complete` FAIL → HTTP 500

The strongest supported conclusion is that an interactive Prisma transaction reached its configured 60-second transaction boundary and returned P2028. This identifies the immediate application failure boundary with high confidence, and the transaction-expiry/closed-transaction mechanism with medium confidence. It does not establish whether the underlying cause was query execution, connection acquisition, lock wait, Supavisor/pooler behavior, PostgreSQL, SSL, or network instability.

No sync, retry, Cron trigger, write, migration, deployment, source modification, environment modification, commit, or push was performed in Phase 6H.

## 2. Phase 6E-G Evidence

- Production deployment: `dpl_Hg43oUhhgMfGCpZD8nmUMMzy4DEc`
- Source commit: `da5d9914d6e3e7741ed76cb9ad3bc9ca41646344`
- Request ID: `d5a5672c-b1c1-4818-8cd1-157dfabd52d1`
- HTTP response: `500`
- Application response status: `FAILED`
- `google_metadata`: PASS, `9,488 ms`
- `discovery_transaction`: FAIL, `61,599 ms`, `P2028`
- `sync_complete`: FAIL, `71,281 ms`, `P2028`
- `source_lease`, `sync_run_create`, worksheet processing, import, row-state, and finalization: not reached
- Post-sync: new sync runs `0`, active leases `0`, persistent application writes `0`

The runtime diagnostic records contained the same request ID. The observed `error_category` was `NONE`; the safe error code `P2028` was present.

## 3. Source Provenance

Current repository verification:

- Branch: `NextJs`
- HEAD: `da5d9914d6e3e7741ed76cb9ad3bc9ca41646344`
- HEAD message: `SAFE DIAGNOSTIC INSTRUMENTATION FOR PRODUCTION SYNC FAILURE`
- No tracked working-tree modification was present before or during this investigation.
- Existing untracked reports and `../graphify-out/` were preserved.
- Relevant runtime versions: Next.js `16.3.3`, Prisma Client `6.19.3`, deployed Node runtime `24.x`.

The active Vercel deployment metadata matched the local HEAD and branch. No Vercel source or environment mutation was performed.

## 4. Exact discovery_transaction Source Trace

Source: `src/services/google-sheets/sync/discovery.ts`.

1. `getGoogleSheetsConfig()` runs before the transaction and emits `google_config`.
2. `listGoogleSheetsWorksheets({ config, diagnostic: context })` runs before the transaction and emits `google_oauth`/`google_metadata` as applicable.
3. `const now = new Date()` and the source key are prepared before the transaction.
4. `prisma.$transaction(async (tx) => { ... })` begins at line 160.
5. Inside the callback, `tx.syncSource.upsert` resolves or creates the source by unique `sourceKey`.
6. `tx.syncWorksheet.findMany` loads the previous worksheet registry for the source.
7. `classifyWorksheetDiscovery(previous, current)` performs in-memory map/set/diff work.
8. A sequential loop performs `tx.syncWorksheet.upsert` for every current Google worksheet.
9. Each worksheet title is normalized in memory with `normalizeWorksheetName`.
10. A second sequential loop performs `tx.syncWorksheet.update` for every previously registered worksheet missing from the current metadata.
11. The callback returns discovery metadata; the transaction is configured with `maxWait: 10_000` and `timeout: 60_000`.

The callback contains database reads and writes, sequential awaits, and bounded in-memory computation. It contains no Google API call, network fetch, filesystem operation, nested transaction, or external service call. The Google metadata call is explicitly outside the transaction.

## 5. Discovery Query Inventory

| Operation | Prisma Model | Query Type | Expected Cost | Inside Transaction |
|---|---|---|---|---|
| `tx.syncSource.upsert` by `sourceKey` | `SyncSource` / `sync_sources` | Upsert, one source row | One unique-key lookup plus insert/update path | YES |
| `tx.syncWorksheet.findMany` by `sourceId` | `SyncWorksheet` / `sync_worksheets` | SELECT | Up to the registered worksheet count; current count 199 | YES |
| `classifyWorksheetDiscovery` | In-memory snapshot | Map/Set/filter comparison | O(current + previous), no DB wait | YES, CPU only |
| `tx.syncWorksheet.upsert` by `(sourceId, worksheetKey)` | `SyncWorksheet` / `sync_worksheets` | Sequential upsert loop | Up to current Google worksheet count; exact current count was not emitted | YES |
| `normalizeWorksheetName` per current worksheet | In-memory string normalization | CPU-only | Small bounded string operation | YES, CPU only |
| `tx.syncWorksheet.update` for missing worksheets | `SyncWorksheet` / `sync_worksheets` | Sequential update loop | At most previous worksheet count; current registry count 199 | YES |
| Return discovery result | None | In-memory return | Constant-size result | YES |

The exact SQL statement count was not captured. Prisma upsert operations may contain internal conflict-check/insert/update work in addition to the logical operation count shown here.

The source structure therefore holds one database transaction open across all sequential worksheet upserts/updates. That is a plausible duration contributor, but no per-operation timing proves that any particular query consumed 60 seconds.

## 6. Transaction Configuration

| Setting | Value | Evidence |
|---|---:|---|
| Prisma transaction type | Interactive callback transaction | `prisma.$transaction(async (tx) => ...)` |
| `maxWait` | `10,000 ms` | `discovery.ts` line 239 |
| `timeout` | `60,000 ms` | `discovery.ts` line 239 |
| `isolationLevel` | Not specified | Source inspection |
| Route `maxDuration` | `300 s` | `src/app/api/sync/google-sheets/route.ts` |
| Google request timeout | `15,000 ms` | `src/lib/google-sheets.ts` |
| Live PostgreSQL `statement_timeout` | `2min` | Read-only `current_setting` query |
| Live PostgreSQL `lock_timeout` | `0` | Read-only `current_setting` query |

The observed failure at `61,599 ms` is near the Prisma transaction timeout, not near the `10,000 ms` connection-acquisition `maxWait` or the Vercel `300 s` route limit.

## 7. Transaction Timing Analysis

Known Phase 6E-G timing:

| Stage | Duration |
|---|---:|
| `google_metadata` | `9,488 ms` |
| `discovery_transaction` | `61,599 ms` |
| `sync_complete` total server diagnostic duration | `71,281 ms` |
| Client request duration | `72,938 ms` |

`google_metadata` is outside `discovery_transaction` in source order. The discovery transaction itself consumed approximately the full configured 60-second timeout and then emitted P2028. No finer transaction-start, individual-query, or transaction-close timestamps were emitted, so those timestamps are not invented here.

The evidence is consistent with an interactive transaction expiring or being closed at its deadline. It is not sufficient to prove which operation caused the transaction to remain open for that period.

## 8. Prisma P2028 Analysis

The application safely extracts a Prisma `P####` code, and the Phase 6E-G runtime record reported `P2028` at `discovery_transaction` and again at `sync_complete`.

Evidence-based interpretation:

- The failure occurred in an interactive Prisma transaction callback.
- The callback duration was `61,599 ms` against a `60,000 ms` configured timeout.
- P2028 identifies a Prisma transaction API failure boundary; the raw exception message was intentionally not captured.
- The timing supports a transaction expiry/closed-transaction mechanism with **MEDIUM** confidence.
- P2028 alone does not distinguish slow query, lock wait, pooler behavior, connection failure, or another transaction lifecycle condition.
- `maxWait` is a separate acquisition setting. The observed duration does not resemble a failure at the 10-second acquisition limit.

No source change or timeout change was made.

## 9. Database Connection Architecture

Sanitized `.env.local` inspection found:

| Variable | Classification | Port | SSL parameter | PgBouncer parameter |
|---|---|---:|---|---|
| `DATABASE_URL` | Supabase transaction pooler | `6543` | `sslmode=require` | `pgbouncer=true` |
| `SUPABASE_POOLER_URL` | Supabase pooler | `6543` | `sslmode=require` | absent in URL |
| `SUPABASE_DIRECT_URL` | Supabase direct connection | `5432` | `sslmode=require` | absent |

No URL parameter was present for `connection_limit`, `connect_timeout`, `pool_timeout`, `socket_timeout`, `statement_timeout`, or `application_name` in the sanitized inspection. This reports URL metadata only, not every effective driver default.

The runtime `DATABASE_URL` remained the pooler endpoint. `SUPABASE_DIRECT_URL` was not substituted into the application runtime and no environment value was modified.

## 10. Pooler Analysis

Evidence for pooler architecture:

- Runtime `DATABASE_URL` is classified as Supabase pooler on port `6543` with `pgbouncer=true`.
- The live PostgreSQL session reported `application_name: Supavisor`.
- The discovery transaction is an interactive Prisma transaction, which keeps its transaction context/connection active across the callback, including the sequential worksheet loop.

This architecture is a plausible candidate for transaction lifecycle or connection behavior under a long callback. However, no provider-side pooler event, backend connection identifier, or incident-time pooler log was available. Pooler behavior is therefore **not proven as the infrastructure root cause**.

The live session reported `pg_stat_ssl.ssl=false` while the client URL requests `sslmode=require`. Because the observed backend application is `Supavisor`, this may represent the pooler's backend leg rather than the client-to-pooler TLS leg. It is evidence requiring provider-level interpretation, not proof that client TLS was disabled.

## 11. Query/Index Analysis

Repository schema and production migration history define:

- unique index `sync_sources_source_key_key` on `sync_sources(source_key)`;
- unique index `sync_sources_provider_external_id_key` on `(provider, external_id)`;
- index `sync_worksheets_source_id_status_idx` on `(source_id, status)`;
- unique index `sync_worksheets_source_id_worksheet_key_key` on `(source_id, worksheet_key)`;
- foreign key `sync_worksheets.source_id` → `sync_sources.id`.

Read-only `EXPLAIN (FORMAT JSON)` results, without `ANALYZE`:

| Logical lookup | Plan | Index/cost |
|---|---|---|
| `sync_sources` by `source_key` | Index Scan | `sync_sources_source_key_key`, total cost `2.36`, 1 planned row |
| `sync_worksheets` by `source_id` | Seq Scan | table estimate 199 rows, total cost `6.49` |
| `sync_worksheets` by `(source_id, worksheet_key)` | Index Scan | `sync_worksheets_source_id_worksheet_key_key`, total cost `2.49`, 1 planned row |

The source-id worksheet read has a low-cost sequential plan because the table is small. It has an index whose leftmost column is `source_id`, but the planner currently prefers a sequential scan for approximately 199 rows. The composite conflict/update lookup is indexed. Write-capable upserts/updates were not EXPLAINed on Production; their index support was assessed statically.

No plan evidence supports a single simple SELECT taking more than 60 seconds at the observed volume. The sequential write loop remains a possible cumulative contributor, but it was not individually timed.

## 12. Data Volume Analysis

Read-only Production inspection reported:

- source status: `ACTIVE`;
- registered worksheets: `199`;
- active worksheets: `7`;
- persisted row states: `2409`;
- open schema changes: `0`;
- duplicate natural-key groups: `0`;
- active leases: `0`;
- new sync runs since the Phase 6E-G request: `0`.

The exact Google metadata length for the failed invocation was not emitted because discovery failed after metadata retrieval and before returning a discovery result. The existing registry volume demonstrates that the transaction can process a non-trivial sequential worksheet set, but it does not by itself explain a 60-second duration.

## 13. Lock Analysis

Read-only `pg_locks` inspection at investigation time returned:

- waiting lock rows: `0`;
- no blocked relation/PID pair observed;
- no current wait event in the inspected session.

The source transaction performs upserts and updates, so row/unique-key locks are structurally possible. `lock_timeout=0` means no positive lock timeout was configured in the inspected session. There is no lock evidence at the later inspection time, and this cannot prove that no lock wait existed during the historical Phase 6E-G request.

Classification: **NO LOCK EVIDENCE OBSERVED at investigation time; incident-time lock cause UNKNOWN.**

## 14. PostgreSQL Evidence

Safe read-only PostgreSQL metadata:

- database: `postgres`;
- schema: `public`;
- server version: `17.6`;
- current session application: `Supavisor`;
- current session state during inspection: `active`;
- current session wait event: none;
- `statement_timeout`: `2min`;
- `lock_timeout`: `0`;
- `idle_in_transaction_session_timeout`: `0`;
- current database `numbackends`: `11`;
- aggregate `deadlocks`: `0` at inspection;
- aggregate transaction rollback count: `53` at inspection.

These are current/aggregate observations, not a historical incident trace. No backend was terminated, canceled, altered, or otherwise modified.

## 15. Historical Error Correlation

Previously observed PostgreSQL evidence:

- `08P01`: SSL EOF;
- `08006`: connection failure / connection reset;
- known historical times: approximately `20:38:23`, `20:41:24`, and `20:14:20` WITA.

The Phase 6E-G request began at approximately `22:26:26` WITA and is correlated by application request ID `d5a5672c-b1c1-4818-8cd1-157dfabd52d1`. No matching timestamp, backend PID, connection identifier, or request/database linkage exists between those historical events and this request.

Classification: **HISTORICAL CANDIDATE ONLY**. No causal SSL/PostgreSQL claim is made.

## 16. Environment Comparison

| Dimension | Local/source evidence | Production evidence | Assessment |
|---|---|---|---|
| Source | HEAD `da5d991...`, branch `NextJs` | Vercel Git SHA exact match | Provenance aligned |
| Node | local Node 24.x family | Vercel Node `24.x` | Aligned at major runtime family |
| Next.js | `16.3.3` | deployed build from same source | Aligned |
| Prisma | `6.19.3` | deployed build from same source | Aligned |
| Runtime DB endpoint | `DATABASE_URL`: pooler, port `6543`, SSL required, pgbouncer true | Vercel env values not retrieved | Runtime architecture expected; exact Production env values not independently printed |
| Migration DB endpoint | `SUPABASE_DIRECT_URL`: direct, port `5432`, SSL required | migration status previously read-only PASS | No runtime substitution |
| Effective DB session | — | `Supavisor`, statement timeout `2min` | Consistent with pooler runtime |

No secret value was retrieved, printed, or changed. No Vercel environment inspection requiring secret exposure was performed.

## 17. Diagnostic Mapping Finding

The missing `error_category` is explained by a field-name mismatch:

1. `SafeDiagnosticError` in `diagnostic-core.ts` defines `category` and `errorCode`.
2. `safeSyncErrorDetails` in `diagnostics.ts` returns `{ category, errorCode }`.
3. The emitter accepts `errorCategory`, not `category`.
4. Callers spread `...safeSyncErrorDetails(error)` into `emitSyncDiagnostic`.
5. Therefore `errorCategory` remains undefined and `emitSyncDiagnostic` falls back to `error_category=NONE`.
6. `errorCode` uses the matching property name and survives as `P2028`.

This is a confirmed instrumentation mapping omission/field-name mismatch. It was documented only; no source fix was implemented in Phase 6H.

## 18. Root Cause Candidate Matrix

| Candidate | Evidence For | Evidence Against | Confidence |
|---|---|---|---|
| Transaction timeout | P2028 at `61,599 ms` against `60,000 ms` | Raw Prisma message/deadline event unavailable | MEDIUM |
| Slow discovery query | Sequential DB operations and a worksheet scan | Low-cost plan, 199 rows, no per-query timing | LOW |
| Connection acquisition | Runtime pooler and `maxWait: 10s` | Failure occurred near 60s, not 10s; no wait event observed later | LOW |
| Pooler behavior | `DATABASE_URL` uses Supavisor/6543; interactive transaction holds context | No incident-time pooler/backend evidence | MEDIUM |
| PostgreSQL lock | Upsert/update operations can wait on row/unique locks; `lock_timeout=0` | No waiting locks at inspection; no historical lock trace | LOW |
| SSL/network instability | Historical 08P01/08006; pooler backend reports `ssl=false` | No request/timestamp/backend correlation; Google stages passed | LOW |
| Prisma transaction lifecycle | Interactive transaction plus P2028 at configured deadline | Exact lifecycle sub-cause not exposed | MEDIUM |
| Application logic inside transaction | Sequential loops and in-memory comparison occur while transaction is open | Work is bounded and no external call is inside callback | LOW |
| Other | P2028 remains a bounded but broad code | No additional evidence | UNKNOWN |

## 19. Confidence Assessment

| Evidence level | Conclusion | Confidence |
|---|---|---|
| Level 1 — observed failure boundary | `discovery_transaction` failed with P2028 before lease/run creation | HIGH |
| Level 2 — immediate mechanism | Interactive transaction expiry/closed transaction at the 60-second boundary | MEDIUM |
| Level 3 — underlying infrastructure cause | PostgreSQL, pooler, SSL, network, lock, or query-performance cause | UNKNOWN |

The confidence labels deliberately separate what the runtime request proves from what remains a hypothesis.

## 20. Immediate Mechanism

The immediate mechanism supported by the evidence is:

> An interactive Prisma discovery transaction remained active until approximately its configured 60-second timeout and surfaced safe error code `P2028`; the error propagated to `sync_complete`, producing HTTP 500.

The source structure can contribute to transaction duration because it holds the transaction across a sequential current-worksheet upsert loop and a missing-worksheet update loop. The source structure alone does not identify the exact slow operation or infrastructure event.

## 21. Infrastructure Root Cause Status

**NOT IDENTIFIED**

There is no incident-time evidence proving:

- a slow query;
- connection acquisition delay;
- lock contention;
- pooler failure;
- PostgreSQL backend failure;
- SSL failure;
- network reset;
- or an exact Prisma connection-lifecycle sub-cause.

Historical 08P01/08006 errors remain candidates only. The current session metadata and EXPLAIN results are useful context, not proof of the historical cause.

## 22. Recommended Remediation Direction

No remediation was implemented in Phase 6H. A separately approved remediation-design phase should, in order:

1. Correct the diagnostic field mapping so `category` is explicitly passed as `errorCategory`, while retaining safe-only output.
2. Add bounded per-operation timing around the source upsert, worksheet read, each loop class, and transaction completion; do not log secrets or raw exceptions.
3. Obtain incident-time/provider-side Supavisor and PostgreSQL correlation before attributing the issue to SSL or pooler behavior.
4. Evaluate the transaction shape and sequential worksheet writes against the actual observed timing before changing timeout or pooler settings.
5. If a controlled reproduction is needed, use a disposable/non-Production database or an explicitly approved safe test environment; do not reproduce by sending another Production sync.

Potential timeout, query, transaction, pooler, SSL, index, or schema changes require a separate operator-approved phase.

## 23. Safety Counters

| Counter | Expected | Actual |
|---|---:|---:|
| Production sync | 0 | 0 |
| Production retry | 0 | 0 |
| Database INSERT | 0 | 0 |
| Database UPDATE | 0 | 0 |
| Database DELETE | 0 | 0 |
| Database DDL | 0 | 0 |
| Migration | 0 | 0 |
| `db push` | 0 | 0 |
| Google Sheet write | 0 | 0 |
| Environment change | 0 | 0 |
| Credential change | 0 | 0 |
| Deployment/rollback | 0 | 0 |
| Commit | 0 | 0 |
| Push | 0 | 0 |

Read-only `SELECT`, metadata, and `EXPLAIN` queries were performed and are excluded from write counters. No transaction write-capable test was opened by the investigation.

## 24. Final Conclusion

Required conclusion answers:

| Question | Answer |
|---|---|
| 1. Exact operations inside `discovery_transaction`? | Source upsert, worksheet registry read, in-memory diff, sequential current worksheet upserts, title normalization, and sequential missing worksheet updates. |
| 2. Configured transaction timeout? | `60,000 ms`; `maxWait` is `10,000 ms`. |
| 3. Actual transaction duration? | `61,599 ms`. |
| 4. Does source structure explain the 60-second duration? | It provides a plausible cumulative mechanism, but does not prove the exact cause. |
| 5. Evidence of a slow query? | No direct evidence; EXPLAIN plans are low-cost and data volume is small. |
| 6. Evidence of connection acquisition delay? | No; current wait is absent and the failure is near 60s rather than 10s, but incident-time evidence is unavailable. |
| 7. Evidence of lock contention? | No current waiting-lock evidence; historical incident state is unknown. |
| 8. Evidence of pooler behavior? | Pooler architecture is confirmed, causal pooler behavior is not. |
| 9. Evidence of SSL/network failure? | No request-correlated evidence; historical errors are candidates only. |
| 10. Is historical PostgreSQL evidence correlated? | No. |
| 11. Strongest supported root cause? | Interactive discovery transaction expiry/closed-transaction boundary, P2028, with MEDIUM confidence. |
| 12. What remains unknown? | The underlying query/connection/lock/pooler/PostgreSQL/SSL/network cause and the missing diagnostic category. |

**Observed failure:** `discovery_transaction → P2028`  
**Immediate mechanism:** interactive Prisma transaction reached the configured 60-second boundary; transaction-expiry/closed-transaction interpretation has MEDIUM confidence.  
**Infrastructure root cause:** `NOT IDENTIFIED`  
**Infrastructure confidence:** `UNKNOWN`

Phase 6H is complete. Stop and wait for explicit operator instruction for a separate remediation-design phase.
