# PHASE 6I — REMEDIATION DESIGN REPORT

> **DESIGN CHECKPOINT / SUPERSEDED FOR IMPLEMENTATION STATUS:** This report
> preserves the approved Phase 6I design. Phase 6J is the implementation and
> verification checkpoint; consult `PHASE6J_IMPLEMENTATION_REPORT_2026-09-04.md`
> for the actual code, gate results, and remaining blockers.

Project: Energi Primer PLN Jeranjang  
Repository: energiprimer-next  
Branch: NextJs  
HEAD reviewed: da5d9914d6e3e7741ed76cb9ad3bc9ca41646344  
Incident date: 2026-09-03  
Report date: 2026-09-04  
Mode: remediation design only; no implementation, deployment, or Production sync

## 1. Status

**PASS WITH FINDINGS**

The remediation direction is sufficiently defined for a separately approved
Phase 6J implementation. The Production infrastructure root cause remains
unidentified. The design therefore does not attribute the incident to SSL,
Supavisor, PostgreSQL locks, or one particular slow query.

The design is conditional on a disposable PostgreSQL test target and a
representative fixture before any Production approval. The exact Prisma
implementation of the set-oriented persistence must pass that test; if it
cannot preserve the invariants below, Phase 6J is not ready for deployment.

No source code, schema, environment value, Vercel setting, credential, Cron
schedule, database row, deployment, commit, or push was changed in Phase 6I.

## 2. Incident Boundary

| Item | Observed evidence |
|---|---|
| Authorized request | Exactly one Phase 6E-G Production sync; authorization consumed |
| request_id | d5a5672c-b1c1-4818-8cd1-157dfabd52d1 |
| HTTP response | 500 |
| First failing stage | discovery_transaction |
| Safe error code | P2028 |
| discovery_transaction duration | 61,599 ms |
| sync_complete duration | 71,281 ms |
| Google metadata | PASS, 9,488 ms, outside the transaction |
| syncRun.create | Not reached |
| worksheet processing | Not reached |
| import transaction | Not reached |
| row-state transaction | Not reached |
| sync finalization | Not reached |
| Production retry | 0 |
| Persisted application write from this request | 0 |

The post-incident read-only state showed zero new sync runs, zero active leases,
and no persisted discovery change attributable to the failed request.

## 3. Confirmed Facts

- The active Vercel Production deployment source SHA matched the reviewed HEAD
  and branch.
- Google configuration, OAuth, and worksheet metadata retrieval passed before
  the first failing database boundary.
- discovery.ts uses an interactive Prisma callback transaction with
  maxWait = 10,000 ms and timeout = 60,000 ms.
- The transaction callback performs a source upsert, a worksheet registry read,
  in-memory classification, sequential current-worksheet upserts, and
  sequential missing-worksheet updates.
- The Google metadata request is outside that transaction.
- The current Production registry snapshot used for investigation contained
  199 registered worksheets, 7 active worksheets, and 2,409 row states.
- The source has a composite unique key on source_id and worksheet_key, and
  the registry has a source_id/status index.
- Read-only EXPLAIN showed low-cost plans for the source lookup and composite
  worksheet lookup. The source_id registry read used a sequential scan over
  the small 199-row table.
- The source lease is acquired only after discovery persistence succeeds.
  Therefore the current lease is not the concurrency boundary for discovery.
- syncRun creation is performed only after discovery and lease acquisition.
- P2028 is not in the database retryable-code set. The incident had no retry.
- SafeDiagnosticError exposes category, while the diagnostic emitter consumes
  errorCategory. This explains error_category=NONE while error_code=P2028
  survives.
- Historical PostgreSQL 08P01 and 08006 records do not correlate to the
  incident request ID, backend PID, timestamp, or connection identifier.
- Runtime DATABASE_URL uses the Supabase Transaction Pooler on port 6543 with
  SSL required and pgbouncer=true. SUPABASE_DIRECT_URL is reserved for
  operator/migration use and was not substituted.

## 4. Unconfirmed Hypotheses

The following remain candidates, not established causes:

- The interactive transaction expired or was closed at its 60-second deadline.
- Sequential network round-trips through the transaction pooler accumulated
  enough latency to reach that deadline.
- A query or write was delayed by a transient database, pooler, or network
  event.
- A lock wait existed during the historical request.
- Connection acquisition or backend assignment contributed to the delay.
- The historical SSL EOF or connection-reset events were related to a broader
  provider event.

There is no evidence that identifies one of these candidates as the
Production infrastructure root cause. Raising the timeout would hide that
uncertainty and could increase connection occupancy.

## 5. Code-Level Findings

### Route and execution order

src/app/api/sync/google-sheets/route.ts:

- Enforces the deployment environment gate before Cron authentication and
  before the sync engine.
- Uses a Node.js runtime and a 300-second route maxDuration.
- Calls the sync engine with triggerType=cron, scope=automatic, and
  allowNonLocalDatabase=true after authentication.
- Both GET and POST are wired to the same write-capable handler. This is an
  existing surface and is outside the Phase 6I change scope.
- A caught failure returns only the bounded browser message
  Synchronization failed. and HTTP 500.

### Sync engine and lease order

src/services/google-sheets/sync/engine.ts:

1. Calls discovery before acquiring the source lease.
2. Acquires the lease with a conditional update after discovery.
3. Creates syncRun only after the lease is acquired.
4. Reads and selects worksheets after syncRun creation.
5. Renews the lease before each selected worksheet.
6. Runs worksheet reads and import/row-state transactions sequentially.
7. Finalizes syncRun and releases the lease in the normal path.

The current ordering leaves discovery persistence outside the lease boundary.
The Phase 6J design must make the lease cover the discovery snapshot and its
atomic persistence, while preserving the existing lease for the remainder of
the sync run.

### Discovery implementation

src/services/google-sheets/sync/discovery.ts:

- Gets Google metadata before the database transaction.
- Uses prisma.$transaction(async (tx) => ...) for the registry persistence.
- Reads the previous worksheet snapshot with findMany by sourceId.
- Computes the diff using Map and Set in memory.
- Normalizes titles in memory.
- Awaits each current worksheet upsert before starting the next one.
- Awaits each missing worksheet update before starting the next one.
- Does not issue a Google request, filesystem operation, nested transaction,
  or external service call inside the callback.

### Import and row-state paths

The later worksheet path has separate transactions:

- commitGoogleSheetsImportPlan uses a 30-second interactive transaction for
  staging and normalized-domain upserts.
- persistRowStates uses a 30-second interactive transaction for row-state
  upserts and worksheet summary update.

Those paths were not reached in the incident and should not be changed as part
of the discovery remediation unless a separate profile proves a need.

### Retry and error handling

The database retry list includes P1001, P1008, P1017, P2024, and P2034. P2028
is intentionally not automatically retried. Phase 6J must not add P2028 to the
retry list without a separately validated transaction-replay design.

## 6. Transaction Analysis

### Logical round-trip count

Let N be the number of current Google worksheets and M be the number of
previously registered worksheets absent from the current metadata. The
discovery callback contains the following logical Prisma operations:

    1 source upsert
    1 previous worksheet findMany
    N current worksheet upserts
    M missing worksheet updates

Therefore the logical operation count is 2 + N + M. The exact N for the failed
Google invocation was not emitted. With a 199-row registry, M can be no
greater than 199. The logical count is not an exact wire-level SQL count:
Prisma may translate one upsert into more than one SQL statement.

Each operation in the two loops is awaited sequentially. The next operation
does not begin until the preceding database promise resolves. Through a
pooler, each awaited operation can require another transaction-context
round-trip or backend interaction. The source cannot be assumed to have
exactly one network packet per logical call, but the sequential structure
clearly creates linear latency exposure.

### CPU and query work

classifyWorksheetDiscovery is in-memory Map/Set/filter work. Title
normalization is a bounded string operation. The missing loop also calls
current.some for each previous row, which is O(N x M) CPU work, but at the
observed registry size it is not a credible 60-second explanation by itself.
The dominant design risk is the number of awaited database operations held
inside the transaction.

### Lock and dependency behavior

- The transaction does not request an explicit table lock or SELECT FOR UPDATE.
- Writes can hold row and unique-key locks until transaction completion.
- source.id depends on syncSource.upsert.
- Existing worksheet status depends on the previous snapshot.
- Missing classification depends on the current worksheet key set.
- After those values are prepared, registry rows do not require one-at-a-time
  application dependencies.
- The source and worksheet registry changes should commit atomically as one
  discovery snapshot.

### What can move outside the transaction

Safe candidates:

- Map/Set classification.
- Previous/current key sets.
- Normalized titles.
- Per-row desired status derived from the previous snapshot.
- Missing key list.
- Validation that worksheet keys are bounded and unique.

The Google metadata read already occurs outside the transaction. The previous
database snapshot may be read outside the persistence transaction after the
source lease is acquired. Reading it outside the lease or using it with no
concurrency boundary would introduce stale-snapshot races.

### Atomic boundary

The minimum atomic persistence unit is:

- source identity/status/lastDiscoveredAt update;
- all current worksheet registry changes for one metadata snapshot;
- all missing worksheet status changes for that same snapshot.

Keeping this unit atomic prevents a failed discovery from exposing a partially
applied current/missing classification. The transaction can remain interactive
for the dependent source ID, but its callback should contain a small bounded
number of set-oriented operations and no per-worksheet await loop.

### Stale-state risk

Moving the read and diff outside the transaction is safe only if the source
lease is acquired before the snapshot and all writers honor that lease. The
current code does not protect discovery with the lease, so merely moving
findMany outside the transaction would be unsafe. Phase 6J must reorder the
lease boundary or retain a transaction snapshot until persistence.

## 7. Pooler Analysis

| Dimension | Current runtime | Design consequence |
|---|---|---|
| Endpoint | DATABASE_URL, Supabase pooler, port 6543 | Do not change in Phase 6I |
| SSL URL setting | sslmode=require | Keep unchanged; historical SSL errors are not correlated |
| Pooler marker | pgbouncer=true | Treat transaction pooling as a candidate context, not root cause |
| Session application | Supavisor | Backend metadata may describe the pooler leg |
| Interactive transaction | Prisma callback transaction | Long callback retains transaction context across awaits |
| maxWait | 10 seconds | Distinct from the 60-second transaction timeout |
| transaction timeout | 60 seconds | The observed 61,599 ms boundary is the immediate risk |
| statement_timeout | About 2 minutes | Does not explain or replace Prisma's 60-second callback limit |
| lock_timeout | 0 | No positive PostgreSQL lock deadline was configured in the inspected session |
| idle transaction timeout | 0 | No server-side idle-in-transaction cutoff was observed |
| direct endpoint | SUPABASE_DIRECT_URL, port 5432 | Migration/operator endpoint; no runtime substitution |

The transaction pooler can affect backend assignment and connection lifetime,
but the available evidence does not prove that it caused this P2028. A
direct-vs-pooler comparison of read-only metadata is useful for context; it
does not test a write-capable interactive transaction. A controlled
transaction-lifecycle comparison requires a disposable PostgreSQL target and,
for provider-specific behavior, an authorized non-Production pooler target.

The reported pg_stat_ssl.ssl=false must not be interpreted as client TLS being
disabled. The current backend application is Supavisor, so the field may
describe the pooler's backend leg rather than the client-to-pooler leg.

No DATABASE_URL, SUPABASE_DIRECT_URL, pool setting, SSL setting, or Vercel
environment value will be changed by Phase 6I or assumed in Phase 6J.

## 8. Database Profiling

Read-only profiling already available from Phase 6H:

| Logical query | Observed plan | Interpretation |
|---|---|---|
| sync_sources by source_key | Index Scan; total cost about 2.36; one planned row | Unique-key lookup is indexed |
| sync_worksheets by source_id | Seq Scan; total cost about 6.49; about 199 planned rows | Reasonable for a small table; not proof of whole-transaction speed |
| sync_worksheets by source_id and worksheet_key | Index Scan; total cost about 2.49; one planned row | Composite unique lookup is indexed |

Current read-only PostgreSQL observations:

- PostgreSQL server version 17.6.
- Current session application_name is Supavisor.
- No current wait event was observed.
- Waiting lock count was zero at investigation time.
- pg_stat_database showed zero deadlocks in the inspected aggregate snapshot.
- The inspected Production state had 199 worksheets, 2,409 row states, zero
  open schema changes, zero active leases, and zero duplicate natural keys.

No write-capable EXPLAIN, EXPLAIN ANALYZE of a write, migration, or profiling
operation that changes database state was performed. No current observation
can prove the absence of a historical lock, disconnect, or pooler event.

No index addition is recommended now. The existing unique constraints support
the conflict key, and the source_id/status index is available. H remains
conditional on timing evidence from the refactored operation or a disposable
representative dataset.

## 9. Diagnostic Mapping Finding

The current diagnostic path has a confirmed field-name mismatch:

1. SafeDiagnosticError declares category and errorCode.
2. safeSyncErrorDetails returns category and errorCode.
3. emitSyncDiagnostic accepts errorCategory and errorCode.
4. Callers spread safeSyncErrorDetails into the emitter.
5. category is therefore ignored by the emitter and error_category falls back
   to NONE.
6. errorCode has the same name at both boundaries and remains P2028.

The minimal safe remediation is to establish one canonical emitter-facing
field name. The preferred Phase 6J design is to rename the
SafeDiagnosticError property to errorCategory and update the bounded helper
constructors/return types so every spread into emitSyncDiagnostic maps
directly. No raw exception, stack, SQL, URL, credential, response body, or
private key is added.

An equivalent boundary adapter is acceptable only if it is covered by a test
that verifies a database P2028 produces error_category=DATABASE and
error_code=P2028. This mapping fix is observability-only and does not change
business logic or transaction semantics. It was not implemented in Phase 6I.

## 10. Remediation Options Matrix

| Option | Evidence | Benefit | Risk | Complexity | Testability | Rollback | Recommendation |
|---|---|---|---|---|---|---|---|
| A. Optimize transaction scope | The callback holds reads, CPU, and all loops until commit | Shorter lock/connection lifetime; lower P2028 exposure | Stale snapshot if lease/order is wrong; accidental non-atomic writes | Medium | Local static plus disposable DB | Source-only | NOW, as part of main architecture |
| B. Reduce sequential DB operations | Count is 2 + N + M and loops await serially | Directly removes cumulative round-trips | Incorrect grouping could miss title/status/rowCount updates; parallelism can exhaust connections | Medium | Disposable fixture with query/timing assertions | Source-only | NOW |
| C. Bulk/set-based operation | Existing unique constraints support conflict-based persistence | Largest likely reduction in transaction duration | Raw SQL/API mistakes; per-row status semantics can be lost | Medium/High | Requires disposable representative DB | Source-only if no schema change | NEXT/CONDITIONAL |
| D. Split discovery read from persistence | Google read is already outside; pure diff can move out; current lease is late | Keeps external/read work out of tx and enables short atomic persistence | Stale data/race without lease-first order | Medium | Disposable concurrent test | Source-only | NOW, with A/B/C |
| E. Evaluate pooler + interactive transaction | Runtime uses Supavisor/6543; no causal provider evidence | Can separate application-shape issue from endpoint behavior | Production endpoint change is risky and not authorized; provider evidence absent | High | Non-Production/disposable only | Revert endpoint manually | CONDITIONAL, not now |
| F. Transaction timeout adjustment | P2028 was near 60s | May increase deadline | Masks slow work, extends locks/connections, competes with Vercel/serverless limits | Low code / High operational risk | Can be measured locally but not validated by timeout increase alone | Config/source revert | DEFER; reject as first response |
| G. Fix diagnostic category mapping | Confirmed category/errorCategory mismatch | Restores safe classification with no business effect | Low; regression only if type mapping is incomplete | Low | Static unit/script test | Source-only | NOW, first |
| H. Query/index optimization | Existing plans/indexes are low-cost at 199 rows | Could help only if timing identifies a query/index bottleneck | Unnecessary index/storage/write overhead; no incident proof | Medium | EXPLAIN and disposable profile | Schema rollback would need migration | CONDITIONAL/DEFER |

### Option profiles

#### A - Optimize transaction scope

- Mechanism: prepare all pure diff data before opening the persistence
  transaction and keep the callback to bounded source plus registry operations.
- Code: discovery.ts and engine.ts; lease order must be updated together.
- Business logic: no intended change.
- Transaction semantics: preserves one atomic registry snapshot.
- Consistency: preserves source/worksheet atomicity if all persistence remains in
  the short transaction.
- Data corruption: low when the invariant and unique-key tests pass.
- Partial update: low inside the transaction; higher if persistence is split
  into independent writes, which is not recommended.
- Concurrency: improves only when the lease is acquired before the snapshot.
- Connection exhaustion: lower transaction occupancy; do not add Promise.all
  against the database.
- Vercel/serverless: favorable because less time is held on a pooled backend.
- Local test: yes for pure preparation; disposable DB for persistence.
- Read-only verification: timing and registry invariants can be checked
  read-only after a separately authorized run.
- Evidence confidence: MEDIUM for reducing risk; not proof of the historical
  sub-cause.
- Complexity: MEDIUM.
- Rollback: source-only if no schema change.
- Decision: NOW in Phase 6J.

#### B - Reduce sequential database operations

- Mechanism: replace missing updates with one homogeneous updateMany and avoid
  unnecessary per-row operations where semantics allow; the preferred final
  form is one set-oriented current persistence operation.
- Code: discovery.ts.
- Business logic: must retain lastSeenAt, rowCount, normalizedTitle, and the
  existing statusForExistingWorksheet rule.
- Transaction semantics: retain atomic commit.
- Consistency: unique composite key remains the natural-key guard.
- Data corruption: medium until tests prove per-row values and statuses.
- Partial update: low inside a transaction; high if operations are issued
  outside it.
- Concurrency: must run under the source lease.
- Connection exhaustion: do not replace serial work with unbounded parallel
  Prisma promises.
- Vercel/serverless: favorable if statement count is materially reduced.
- Local test: static logic yes; representative write test needs disposable DB.
- Read-only verification: counts, duplicate-key query, statuses, and timestamps.
- Evidence confidence: MEDIUM to HIGH for cumulative-latency reduction.
- Complexity: MEDIUM.
- Rollback: source-only.
- Decision: NOW for the safe missing update; NEXT for full set-based current
  persistence.

#### C - Bulk/set-based database operation

- Mechanism: use a parameterized set-oriented INSERT ... ON CONFLICT DO UPDATE
  equivalent, or a Prisma-supported createMany plus bounded updates, and one
  missing-key update.
- Code: discovery.ts; possibly a small SQL-builder helper without changing
  schema.
- Business logic: unchanged only if desired status is computed per current row
  before persistence.
- Transaction semantics: one atomic transaction remains.
- Consistency: existing unique(sourceId, worksheetKey) constraint remains the
  conflict boundary.
- Data corruption: medium until SQL parameterization and fixture tests pass.
- Partial update: low if all statements remain in one transaction.
- Concurrency: lease-first order is required; unique constraint remains a
  second line of defense.
- Connection exhaustion: strongly favorable compared with 199 sequential
  awaits.
- Vercel/serverless: favorable, but statement size and parameter limits must be
  bounded.
- Local test: possible with Prisma mocks for construction; real semantics need
  disposable PostgreSQL.
- Read-only verification: possible after a test or authorized run.
- Evidence confidence: MEDIUM; it addresses the strongest application-level
  candidate but does not prove pooler cause.
- Complexity: MEDIUM/HIGH.
- Rollback: source-only if no schema change; successful bad data would require
  a separately authorized data-recovery procedure.
- Decision: NEXT/CONDITIONAL on disposable DB acceptance.

#### D - Split discovery read from discovery persistence

- Mechanism: Google metadata, previous registry read, diff, normalization, and
  target status preparation occur outside the short write transaction, after
  the lease is acquired.
- Code: discovery.ts and engine.ts.
- Business logic: unchanged.
- Transaction semantics: persistence remains atomic; preparation is not
  transactional but is deterministic from the lease-protected snapshot.
- Consistency: preserved only if all registry writers honor the lease.
- Data corruption: low after concurrency tests; high if lease order is omitted.
- Partial update: low when the final persistence transaction is atomic.
- Concurrency: improves the current design because discovery is no longer
  persisted before the lease.
- Connection exhaustion: lower transaction lifetime; one additional read is
  acceptable.
- Vercel/serverless: favorable.
- Local test: pure preparation yes; disposable concurrent test required.
- Read-only verification: stale-state and lease-release checks after execution.
- Evidence confidence: MEDIUM.
- Complexity: MEDIUM.
- Rollback: source-only.
- Decision: NOW with A.

#### E - Evaluate Supabase pooler and interactive transaction behavior

- Mechanism: compare equivalent safe workloads through pooler and direct
  PostgreSQL endpoints in a non-Production target.
- Code: no application code required for the experiment.
- Business logic: none.
- Transaction semantics: experiment must use the same callback shape; no
  Production writes.
- Consistency: not applicable to read-only experiment; disposable writes must
  be isolated.
- Data corruption: avoidable by using a disposable database.
- Partial update: experiment must be aborted or rolled back on the disposable
  target.
- Concurrency: measure separately; do not infer from a single session.
- Connection exhaustion: monitor only on non-Production.
- Vercel/serverless: Production endpoint behavior remains unresolved until
  provider evidence exists.
- Local test: direct PostgreSQL yes; Supavisor-equivalent only if available.
- Disposable DB: required for transaction-lifecycle reproduction.
- Read-only verification: metadata comparison alone is insufficient.
- Evidence confidence: LOW for current root-cause attribution.
- Complexity: HIGH.
- Rollback: no Production rollback if no endpoint is changed.
- Decision: CONDITIONAL and deferred.

#### F - Transaction timeout adjustment

- Mechanism: increase the Prisma timeout above 60 seconds.
- Code/config: discovery.ts, possibly route budget if made operational.
- Business logic: no direct change.
- Transaction semantics: same atomicity but longer lock/connection lifetime.
- Consistency: unchanged in theory, more exposure to stale or blocked work.
- Data corruption: low direct risk, but prolonged failures can increase
  operational risk.
- Partial update: unchanged if transaction remains atomic.
- Concurrency: worse while transactions remain open longer.
- Connection exhaustion: worse in serverless/pooler conditions.
- Vercel/serverless: route maxDuration is 300 seconds, but that is not a
  database-health guarantee.
- Local test: easy but does not prove the cause.
- Disposable DB: required before any decision to alter the limit.
- Read-only verification: duration alone cannot justify this option.
- Evidence confidence: LOW as a remediation; it treats the symptom.
- Complexity: LOW code, HIGH operational consequence.
- Rollback: source/config revert.
- Decision: DEFER; do not use as first fix.

#### G - Fix diagnostic category mapping

- Mechanism: align SafeDiagnosticError.errorCategory with the emitter's
  errorCategory input, or use an explicit boundary adapter.
- Code: diagnostic-core.ts and diagnostics.ts, plus focused regression test.
- Business logic: none.
- Transaction semantics: none.
- Consistency: none.
- Data corruption/partial update/concurrency/connection risk: negligible.
- Vercel/serverless: negligible runtime overhead.
- Local test: yes.
- Disposable DB: no for the mapping itself.
- Read-only verification: log field inspection with sanitized fixture.
- Evidence confidence: HIGH; mismatch is directly observed in source.
- Complexity: LOW.
- Rollback: source-only.
- Decision: NOW, first Phase 6J change.

#### H - Query/index optimization

- Mechanism: change query shape or add an index only after measured evidence.
- Code: discovery.ts, potentially prisma schema and a separately governed
  migration if an index is actually needed.
- Business logic: no intended change.
- Transaction semantics: no intended change.
- Consistency: generally unchanged, but schema rollout needs governance.
- Data corruption: low direct risk; migration/index risk is operational.
- Partial update: no direct effect if migration is transactional, but no
  migration is authorized in Phase 6I.
- Concurrency/connection risk: unknown until profiled.
- Vercel/serverless: low direct effect.
- Local test: EXPLAIN can be read-only; realistic performance needs disposable
  data.
- Disposable DB: recommended.
- Read-only verification: yes for plan inspection.
- Evidence confidence: LOW at current volume.
- Complexity: MEDIUM/HIGH if schema changes.
- Rollback: difficult if it requires a Production migration.
- Decision: CONDITIONAL/DEFER; no index change now.

## 11. Recommended Architecture

### Decision

Use a **short, lease-guarded, set-oriented discovery persistence** architecture.
It combines G first with A, B, C, and D. It keeps the atomic boundary but
removes the per-worksheet await loop from the transaction.

### Sequence

1. Read and validate Google configuration.
2. Retrieve Google worksheet metadata outside any database transaction.
3. Resolve or bootstrap the source identity in a short bounded operation.
4. Acquire the source lease before reading the registry snapshot that will be
   persisted. The first-source bootstrap and lease claim must be race-safe.
5. Read the previous worksheet registry while the lease is held.
6. Compute the diff, normalized titles, desired existing statuses, and missing
   keys in memory.
7. Run one short atomic persistence transaction:
   - update the source discovery metadata;
   - apply all current worksheet values with a parameterized set-oriented
     operation, or the tested Prisma bulk equivalent;
   - mark the missing-key set as MISSING with one homogeneous update.
8. Emit bounded stage timings and retain the lease for the existing sync-run
   and worksheet-processing flow.
9. Create syncRun only after discovery persistence and lease acquisition
   succeed, as today.
10. Release the lease on every path, including a discovery failure after lease
    acquisition.

The persistence transaction may remain an interactive Prisma transaction
because source ID dependency and one atomic commit are valuable. Its callback
must contain no Google call, no filesystem operation, no in-memory loop with
database awaits, and no unbounded parameter list. The timeout is not increased
as part of this architecture.

### Smallest change likely to remove P2028 exposure

The observability-only G change cannot remove P2028. The smallest material
performance change likely to remove the observed boundary is to shorten the
discovery transaction and replace the N plus M sequential writes with a
parameterized set-oriented current persistence plus one missing update. A
missing-only updateMany is a safe intermediate improvement, but it may not be
enough if the current worksheet set is large.

### Answers to the required design questions

1. Discovery persistence should remain atomic, but the callback should be
   short. It need not be removed as an interactive transaction immediately.
2. Persistence can be set-oriented. Prisma createMany alone is not a full
   replacement because existing rows need per-row title, normalized title,
   status, lastSeenAt, and rowCount updates.
3. Discovery read and pure preparation should be separate from persistence.
4. The pooler should not be changed now. Direct-vs-pooler is an unresolved
   non-Production experiment.
5. The 60-second timeout should not be changed without evidence.
6. Before the next Production sync, measure source bootstrap, lease, registry
   read, preparation, persistence, total discovery duration, current count,
   missing count, and safe error category/code.
7. Roll back on any P2028 recurrence, transaction duration without 25 percent
   headroom, partial registry state, unexpected missing active worksheet,
   duplicate-key violation, lease leak, or diagnostic secret exposure.

### Invariant preservation

| Invariant | Design protection |
|---|---|
| sync_sources remains consistent | Source metadata and registry persistence commit atomically |
| Active worksheets are not lost | Current metadata is applied by stable worksheet key; no delete is introduced |
| Missing source worksheets are marked | Missing key set is prepared from the same leased snapshot and updated atomically |
| No duplicate natural key | Existing unique(source_id, worksheet_key) constraint remains |
| Discovery is idempotent | Same metadata and stable keys produce same values; repeated run has no duplicate rows |
| Concurrent syncs are safe | Lease is acquired before registry snapshot/persistence; unique constraints remain a backstop |
| Source lease remains boundary | Lease covers discovery persistence and continues through sync processing |
| syncRun is accurate | syncRun is still created after successful discovery; failed discovery leaves it absent |

## 12. Why This Architecture

- It addresses the strongest application-level evidence: a 60-second
  interactive transaction containing a linear number of sequential database
  awaits.
- It does not rely on an unproven SSL or pooler diagnosis.
- It preserves the all-or-nothing registry snapshot, unlike independent writes.
- It avoids unbounded Promise.all concurrency and therefore avoids trading
  transaction latency for connection exhaustion.
- It leaves import and row-state transactions unchanged because they were not
  reached in the incident.
- It makes the source lease a real concurrency boundary for discovery, which
  the current order does not do.
- It can be implemented without a schema or migration change if the
  parameterized SQL/bulk API is validated.
- It provides instrumentation that can distinguish preparation, persistence,
  lease, and transaction duration before any timeout decision.

The architecture is a risk reduction design, not a claim that the underlying
Supavisor or PostgreSQL root cause has been identified.

## 13. Rejected / Deferred Options

- Do not increase the 60-second transaction timeout as the first response.
- Do not add P2028 to automatic retry. Replaying an uncertain transaction
  against Production can create more contention and would not explain the
  original delay.
- Do not run a second Production sync to reproduce the issue.
- Do not switch Production from the pooler to the direct endpoint.
- Do not treat current pg_stat_ssl=false as proof of disabled client TLS.
- Do not add an index based only on the low-cost plan or on the elapsed
  transaction duration.
- Do not parallelize all worksheet upserts with Promise.all.
- Do not split current/missing persistence into independent transactions.
- Do not use createMany(skipDuplicates) as a substitute without handling
  updates to existing worksheet metadata and status semantics.
- Do not modify vercel.json, Cron schedule, credentials, or environment values.

## 14. Phase 6J Implementation Plan

Phase 6J is a future implementation phase. The following is a plan only; none
of these changes was made in Phase 6I.

### 14.1 Files expected to change

1. src/services/google-sheets/sync/discovery.ts
   - Extract a pure preparation step for current/previous metadata, normalized
     titles, desired statuses, and missing keys.
   - Keep Google metadata retrieval outside the persistence transaction.
   - Implement the tested set-oriented current persistence path and one missing
     update.
   - Keep the existing unique-key and status behavior.
   - Keep the transaction timeout at 60,000 ms initially; measure the new
     duration rather than masking it.
2. src/services/google-sheets/sync/engine.ts
   - Move or coordinate source lease acquisition so discovery persistence is
     lease-guarded.
   - Ensure a lease acquired before discovery is released on every failure path.
   - Preserve syncRun creation after discovery and existing worksheet order.
3. src/services/google-sheets/sync/lease.ts
   - Add only the smallest helper needed for race-safe source bootstrap/lease
     acquisition, if the existing functions cannot express that order.
   - Do not change lease duration without evidence.
4. src/services/google-sheets/sync/diagnostic-core.ts and
   src/services/google-sheets/sync/diagnostics.ts
   - Canonicalize category to errorCategory at the safe diagnostic boundary.
   - Add bounded discovery preparation/persistence timings if needed.
   - Keep request ID, stage, duration, safe category, safe code, and bounded
     Google status only.
5. scripts/verify-worksheet-discovery.ts or a new focused static verification
   script
   - Add pure classification/status/idempotency cases for new, rename,
     unchanged, missing, empty, and 199-row fixtures.
6. package.json only if a new verification script is added
   - Add a non-Production static/disposable test command.

Expected not-to-change files:

- prisma/schema.prisma and production schema/migrations, unless a separate
  future profile proves a schema requirement and obtains approval.
- vercel.json.
- .env.local and .env.e2e.local.
- Google credentials.
- retry.ts database retry policy, especially P2028 handling.

### 14.2 Exact logical changes

- Preserve the Google metadata contract and worksheet stable key.
- Prepare desired row values before opening the persistence transaction.
- Make the persistence transaction bounded by statement count rather than
  worksheet count.
- Use parameter binding for every value if raw SQL is selected; never
  interpolate worksheet titles, keys, or source IDs into SQL text.
- Use the existing composite unique constraint for conflict handling.
- Make the missing update a no-op when the key set is empty.
- Preserve MISSING -> DISCOVERED recovery and preservation of other valid
  statuses through the current statusForExistingWorksheet rule.
- Do not delete rows, change worksheet IDs, or alter row-state data.
- Do not create syncRun before discovery succeeds.

### 14.3 Instrumentation to retain and add

Retain:

- request_id;
- stage;
- status;
- duration_ms;
- error_category;
- error_code;
- bounded google_http_status.

Add only bounded, non-sensitive timing coverage for:

- source bootstrap;
- lease acquisition;
- previous registry read;
- in-memory preparation;
- current registry persistence;
- missing registry update;
- total discovery transaction.

No raw error message, stack, SQL, URL, database name with secrets, token,
credential, sheet content, response body, or private key may be logged.

### 14.4 Required invariants

The implementation must prove the invariant table in Section 11. It must also
prove that a failure before commit leaves source/worksheet registry state
unchanged, and that a successful repeat is idempotent.

### 14.5 Phase 6J acceptance criteria

- On a representative disposable fixture with approximately 199 worksheets,
  discovery completes without P2028.
- The discovery transaction completes with at least 25 percent headroom under
  the 60-second timeout; the initial hard gate is duration <= 45,000 ms.
- Current, renamed, missing, empty, and repeated discovery cases preserve all
  status semantics.
- No duplicate natural keys exist after repeated or concurrent test runs.
- A forced pre-commit failure leaves no partial registry snapshot.
- Only one concurrent sync holds the source lease.
- The diagnostic mapping reports a non-NONE category for a sanitized P2028
  fixture and never emits sensitive fields.
- No migration or schema change is required for the selected implementation.

## 15. Test Plan

### 15.1 Required local/static gates after implementation

Run only after Phase 6J code exists:

    npm run db:generate
    npm run db:validate
    npm run lint
    npx tsc --noEmit --incremental false
    npm run build
    npm run sync:verify-discovery
    npm run sync:verify-retry
    npm run sync:verify-cron-auth
    npm run sync:verify-preview-write-safety
    npm run sync:verify-auto-admission
    npm run auth:security:verify
    npm run ops:verify-env
    npm run dashboard:verify-cutoff

The static commands must not use a Production --live flag. In particular,
sync:verify-discovery --live and sync:verify-incremental --live are
write-capable and are not Phase 6I tests.

### 15.2 Database and migration regression

Run read-only operator checks after code gates:

    npm run supabase:production:migrate-status
    npm run supabase:production:migration:preflight

Verify that local migration history and Production status remain aligned. No
migration, db push, schema resolve, or Production write is part of this phase.

### 15.3 Diagnostic and static safety regression

- Capture a sanitized database error fixture and verify category mapping.
- Verify P2028 remains non-retryable unless a separately designed replay
  policy is approved.
- Static-audit the route for environment gate before authentication/sync.
- Verify invalid and missing Cron authorization remain rejected.
- Verify Preview remains denied before the sync engine.
- Verify no diagnostic output contains raw exception text, SQL, endpoint URLs,
  credentials, or private-key content.

### 15.4 Disposable PostgreSQL requirement

A disposable PostgreSQL target is **required** for the write-capable parts of
Phase 6J. A Production pooler or the current .env.local target is not a
disposable target.

The fixture must include:

- approximately 199 registered worksheets;
- active, disabled, validated, schema-review, and missing statuses;
- stable keys with renamed titles;
- current metadata containing new, unchanged, renamed, and missing tabs;
- representative rowCount values.

The disposable scenarios must cover:

1. First discovery and source bootstrap.
2. Repeat discovery with zero duplicate rows.
3. Renamed worksheet by stable sheet ID.
4. Missing worksheet marked MISSING without deletion.
5. MISSING worksheet recovery to DISCOVERED.
6. Empty current metadata behavior.
7. Failure before commit and after preparation.
8. Two concurrent sync attempts and lease release.
9. Transaction duration and bounded statement count.
10. Direct PostgreSQL versus any available non-Production pooler comparison.

If the disposable target is unavailable, these cases must be marked
**BLOCKED**, not PASS. No Production sync may be used as a substitute.

### 15.5 Sync dry-run strategy

Use the existing read-only/parser dry-run path where applicable. A dry-run
must not call the write-capable discovery or incremental sync live modes and
must not use a Production write endpoint. If a true discovery dry-run does not
exist, add a pure preparation test in Phase 6J rather than treating a live
verification command as dry-run.

## 16. Rollback Plan

The preferred implementation changes application source only and does not
require a schema or migration change. This makes deployment rollback
source/deployment based:

1. Stop further sync approval if any acceptance criterion fails.
2. Preserve sanitized diagnostics and read-only state evidence.
3. The USER manually rolls back the Vercel deployment to the last known-good
   deployment through the operator interface.
4. The USER verifies deployment provenance and Preview/Production gates
   read-only.
5. Do not run a compensating Production sync automatically.

Rollback triggers:

- any discovery P2028 recurrence;
- discovery duration above 45,000 ms on the representative controlled test or
  a comparable Production observation;
- partial current/missing registry state after a failed transaction;
- unexpected active worksheet becoming MISSING;
- duplicate-key or source identity anomaly;
- lease not released or concurrent admission not blocked;
- error_category remains NONE for a classified error;
- any secret/raw error/SQL exposure;
- any auth, Cron, Preview, migration, lint, TypeScript, or build regression.

A source rollback does not undo a successfully committed but semantically
wrong registry update. Such a data correction requires a separately authorized
read/write operator procedure. No automatic DELETE, restore, or compensating
sync is part of this plan.

## 17. Production Deployment Procedure

**USER deploys manually. The agent does not deploy.**

When Phase 6J is implemented and its gates pass:

1. Review the exact diff and confirm no environment, schema, credential,
   vercel.json, or Cron schedule change.
2. Pass all static, build, migration-status, security, and disposable-target
   gates.
3. Confirm there is a controlled window in which an automatic Cron invocation
   cannot start before the new Production sync receives explicit approval.
   The agent must not change the Cron schedule.
4. The USER manually deploys the reviewed commit to Vercel.
5. Perform read-only deployment provenance and READY-state verification.
6. Perform read-only Production database baseline verification:
   active source, worksheet counts, row-state count, duplicate natural keys,
   open schema changes, and active leases.
7. Inspect safe runtime stage diagnostics for the deployment. Do not send a
   valid write-capable Cron request at this step.
8. Obtain a new explicit Production sync approval from the USER before any
   authorized sync.
9. If approved, the USER/operator performs at most the specifically approved
   controlled sync. The agent does not trigger it.
10. Perform post-sync verification read-only and stop on the first unexpected
    stage, duration, state, or security result.

## 18. Production Sync Approval Gate

**NO PRODUCTION SYNC PERFORMED IN PHASE 6I.**

The Phase 6G authorization is consumed. Any future Production sync requires a
new explicit approval from the USER. A deployment is not approval for a sync.
An automatic Cron invocation must be controlled by the USER/operator so that
the approval gate is respected.

No POST or write-capable GET request was sent in Phase 6I. No retry or Cron
trigger was sent.

## 19. Safety Counters

All counters below refer to Phase 6I:

| Counter | Actual |
|---|---:|
| Production sync requests | 0 |
| Production sync retries | 0 |
| Database INSERT/UPDATE/DELETE | 0 |
| Google Sheet writes | 0 |
| Migrations | 0 |
| Schema changes | 0 |
| Environment changes | 0 |
| Secret/credential changes | 0 |
| Vercel deployments by agent | 0 |
| Commits by agent | 0 |
| Pushes by agent | 0 |

Only source inspection, existing report inspection, and design-document
creation were performed in this phase. The Phase 6H read-only SELECT/EXPLAIN
evidence is referenced; no write-capable test was opened.

## 20. Final Decision

**READY FOR PHASE 6J**, subject to these exact prerequisites:

1. User review and approval of this design.
2. Implementation limited to the files and semantics in Section 14.
3. A disposable PostgreSQL target with the representative approximately
   199-worksheet fixture.
4. Passing discovery atomicity, idempotency, missing-state, concurrency,
   timing, and diagnostic-mapping tests. If the disposable target is absent,
   those tests remain BLOCKED and Production readiness is NOT established.
5. Passing lint, TypeScript, build, security, migration-status, and
   Production-preflight gates.
6. No timeout increase, pooler switch, schema change, Cron change, or
   environment change unless a separate evidence-based approval is issued.
7. Manual deployment by the USER only.
8. Read-only post-deployment verification.
9. A new explicit Production sync approval before any future sync.

The selected design is finalized at the architecture level but not at the
unvalidated SQL/API implementation detail. If the disposable test cannot
prove the set-oriented operation preserves all invariants, return to
DESIGN NOT FINALIZED for a smaller experiment; do not test the uncertainty by
running another Production sync.

**Phase 6I stops here. No implementation, deployment, commit, push, migration,
or Production sync is authorized by this report.**
