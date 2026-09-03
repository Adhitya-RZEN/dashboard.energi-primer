# PHASE 6E-C — PRODUCTION SYNC FAILURE INVESTIGATION

Project: Energi Primer PLN Jeranjang  
Date: 2026-09-03  
Scope: read-only investigation after the single authorized Phase 6E-B Production sync attempt

## Overall Status

ROOT CAUSE NOT YET IDENTIFIED

Root-cause classification: I. UNKNOWN — INSUFFICIENT EVIDENCE

Confidence:

- High confidence that no committed sync result is visible in the audited runtime database.
- High confidence that the sanitized server category is insufficient to identify the failing subsystem.
- Low confidence for the exact internal failure point because the available evidence does not contain a safe Prisma error code, Google response status, stack trace, or stage-level timing.

## Guardrails Applied

This phase was investigation-only. No new Production sync request, retry, authorized Cron invocation, migration, database write, environment change, Google Sheets change, deploy, commit, or push was performed.

The previous Phase 6E-B approval was consumed by exactly one authorized sync attempt. It is not reused.

## 1. Incident Timeline

| Time | Event | Evidence / result |
|---|---|---|
| 2026-09-03 20:37:41.320 WITA | Authorized Production sync request started | Equivalent to 2026-09-03 12:37:41.320 UTC. One request only. |
| During the request | Google OAuth token endpoint and Google Sheets metadata endpoint were contacted | The incident evidence records one POST to the OAuth token endpoint and one GET to the Sheets metadata endpoint. Response statuses are not available in the sanitized evidence. |
| 2026-09-03 12:38:54.114 UTC | Sanitized application log observed | Equivalent to 2026-09-03 20:38:54.114 WITA. The recorded elapsed correlation is approximately 72.794 seconds, or 72.8 seconds. |
| Same request | HTTP response returned | HTTP 500 with the safe body { status: "FAILED", message: "Synchronization failed." }. No internal error message was returned. |
| After failure | Execution stopped | 0 retry and 0 second sync. No further Production request was issued. |
| Post-failure verification | Runtime database inspected with SELECT-only queries | Latest visible run remains the prior SUCCESS run. No new committed sync run, active lease, row decrease, duplicate natural key, or open schema change was observed. |

Execution summary: 1 request, 0 operator retry, 0 second sync.

Production data impact: No committed change observed in the audited runtime database. This observation cannot prove whether a transient database transaction began and rolled back; it proves that no resulting committed state was visible in the post-failure checks.

## 2. Source Code Trace

The relevant execution order is:

1. The route checks the deployment environment and permits the write-capable path only for Production or local development.
2. The route checks CRON_SECRET and the Authorization header.
3. The route invokes runGoogleSheetsIncrementalSync with triggerType cron, scope automatic, and allowNonLocalDatabase true.
4. The engine calls discoverGoogleSheetsWorksheets inside the Google retry wrapper.
5. Discovery validates Google configuration and calls the Google Sheets metadata API.
6. Only after the metadata response is accepted does discovery open a Prisma transaction. That transaction upserts the sync source and worksheet registry.
7. After discovery returns, the engine acquires the source lease.
8. Only after the lease is acquired does the engine call syncRun.create with status RUNNING.
9. Worksheet reads, validation, import commits, row-state persistence, and final sync-run update happen after syncRun.create.
10. The route catches an uncaught error and returns the generic HTTP 500 response.

Relevant source locations:

- src/app/api/sync/google-sheets/route.ts:30-67 — environment gate, Cron authentication, engine invocation, and generic error response.
- src/services/google-sheets/sync/engine.ts:444-585 — discovery, lease, syncRun creation, worksheet processing, error handling, and lease release.
- src/services/google-sheets/sync/discovery.ts:115-203 — Google metadata read followed by the discovery database transaction.
- src/lib/google-sheets.ts:224-246 and 249-319 — bounded Google fetch and OAuth token exchange.
- src/services/google-sheets/sync/retry.ts:44-85 — Google and database retry policies.

The absence of a new sync_runs row narrows the evidence to the initialization path through syncRun.create. It does not by itself distinguish:

- failure in Google configuration, OAuth, or metadata retrieval;
- failure in the discovery database transaction;
- failure acquiring the lease;
- failure creating syncRun; or
- a transaction that began but did not commit.

## 3. Vercel Evidence

The audited Production deployment was:

- canonical host: dashboard-energi-primer.vercel.app
- deployment state: READY / Production
- branch: NextJs
- deployment commit: 09363e739d5dc4ca5931724bd63d1c21ca293ca6
- local current commit and Production commit matched during the earlier provenance audit

Runtime route configuration:

- runtime: Node.js
- dynamic mode: force-dynamic
- Vercel function maxDuration: 300 seconds

Incident evidence:

- HTTP status: 500
- safe response: Synchronization failed
- sanitized server category: [google-sheets-sync] sync_database
- no raw exception message, Prisma code, stack, stage, request correlation ID, or upstream response status was retained in the safe evidence

The label sync_database is an operational category, not a complete diagnosis. The route calls classifySyncError for non-Google errors, and the classifier maps Prisma errors to DATABASE and also maps an otherwise unrecognized error to DATABASE. Therefore the label supports a database-related candidate but does not prove a connection failure, transaction failure, or query failure.

The public response and timing are consistent with the route handler reaching its catch path. The incident did not show a Vercel platform timeout at the 300-second limit.

## 4. Google API Stage

Existing read-only evidence from the prior audit:

- local canonical Google configuration check: PASS
- local effective credential mode: environment service-account pair
- direct read-only metadata inspection: 199 worksheets returned
- the seven active registry worksheets were readable and all produced READY_FOR_IMPORT plans
- Google client scope: spreadsheets.readonly

Production incident evidence confirms that the runtime attempted:

1. POST to the Google OAuth token endpoint.
2. GET to the Google Sheets metadata endpoint.

What cannot be concluded:

- The OAuth response status is unknown.
- The metadata response status is unknown.
- It is unknown whether the metadata JSON was accepted.
- It is unknown whether the runtime used the same credential values and spreadsheet ID as the local operator environment.

The Google client applies a 15-second AbortController timeout to each fetch. Google authentication and metadata failures are mapped to bounded categories such as authentication, permission, rate_limit, timeout, or api. No such specific Google category appears in the supplied sanitized log; only sync_database appears.

Assessment for this stage: observed invocation, result UNKNOWN. Category D. GOOGLE API FAILURE is not selected because the response outcome is not evidenced.

## 5. Database Stage

Database configuration and behavior:

- Prisma runtime datasource uses DATABASE_URL.
- DATABASE_URL is the application runtime endpoint and was identified in the prior audit as the Supabase transaction pooler.
- SUPABASE_DIRECT_URL is reserved for operator migration and direct-connection verification; it is not the runtime datasource used by the sync engine.
- The earlier migration preflight and migration-status checks passed read-only.

Post-failure SELECT-only state verification:

- worksheetCount: 199
- activeCount: 7
- rowStateCount: 2409
- latestRunStatus: SUCCESS
- latestRunRows: 0
- latestRunSkipped: 0
- openSchemaChanges: 0
- activeLeases: 0

Additional post-failure observations from the controlled-sync report:

- latest visible sync run remains the prior id 1 SUCCESS run;
- source discovery timestamp and registry state remained unchanged;
- normalized row counts and date ranges remained unchanged;
- duplicate natural-key groups remained zero;
- no new sync_run record was visible.

The same state verifier initially could not reach the pooler from the restricted sandbox. The identical verifier then passed when allowed network access for its SELECT-only database check. This is an operator-environment access distinction, not evidence of a Production write or data mutation.

Database-stage assessment: no committed Production data change observed; exact failing database operation UNKNOWN.

## 6. Prisma / Transaction Analysis

| Stage | Database interaction | Write-capable | Position relative to syncRun.create | Failure implication |
|---|---|---:|---|---|
| Google configuration | No Prisma call | No | Before | Configuration or credential-mode failure can stop the request before any database state change. |
| OAuth and metadata retrieval | No Prisma call | No | Before | Google auth, permission, API, malformed response, or timeout can stop discovery. |
| Discovery transaction | syncSource.upsert, syncWorksheet.findMany, worksheet upserts, and missing-worksheet updates | Yes, transactional | Before | A connection, transaction, constraint, or query error can roll back the discovery registry and prevent syncRun creation. |
| Lease acquisition | syncSource.updateMany | Yes | Before | A database operation can fail before syncRun creation. If acquired, later cleanup attempts to release it. |
| syncRun creation | syncRun.create with RUNNING | Yes | First operation after lease | A failure here explains no new row and no persisted run. |
| Registered source and worksheet reads | findUnique and findMany | No | After | Not reached if initialization failed earlier. |
| Worksheet read and validation | Google range read plus pure planning; possible schema-review writes | Mixed | After | Not consistent with a failure proven before syncRun, but cannot be tested against the failed request retrospectively. |
| Import commit | spreadsheetImportRun and normalized entity writes in a 30-second Prisma transaction | Yes, transactional | After | No evidence indicates this stage was reached. |
| Row-state persistence | syncRowState upserts and worksheet update in a 30-second Prisma transaction | Yes, transactional | After | No evidence indicates this stage was reached. |
| Final sync-run update | syncRun.update | Yes | Last | No new run exists to update in the post-failure state. |

Important retry detail:

- Discovery is wrapped by withSyncRetry, but that wrapper retries only GoogleSheetsIntegrationError values classified as transient Google failures.
- The discovery Prisma transaction itself is not wrapped by withDatabaseRetry.
- Database retry is applied later to import commits and row-state persistence.
- The supplied incident activity shows one OAuth POST and one metadata GET, so there is no evidence that an internal Google retry occurred.

The database checks cannot expose a rolled-back transaction after the fact. They establish the committed state that remained visible, not every transient operation performed inside the failed invocation.

## 7. Timeout Analysis

| Control | Configured value | Scope |
|---|---:|---|
| Google fetch AbortController | 15 seconds | OAuth token, metadata, and range requests |
| Google retry attempts | Up to 3 | Only transient rate-limit, timeout, or eligible API errors |
| Google retry backoff | 500 ms, then 1,000 ms, capped at 4,000 ms | Between eligible attempts |
| Discovery transaction maxWait | 10 seconds | Waiting to start the Prisma interactive transaction |
| Discovery transaction timeout | 60 seconds | Interactive discovery transaction |
| Import transaction timeout | 30 seconds | Normalized import transaction |
| Row-state transaction timeout | 30 seconds | Row-state and worksheet metadata persistence |
| Source lease duration | 300 seconds | Concurrency lease, not an execution timeout |
| Vercel function maxDuration | 300 seconds | Serverless function ceiling |

The observed request-to-log correlation of approximately 72.794 seconds does not match a 70-, 72-, or 73-second constant in the inspected source. No Promise.race-based 70-second application timeout was found.

The duration can overlap combinations of upstream latency, database connection acquisition, the discovery transaction envelope, and logging timestamp correlation. It is not enough to prove:

- a Google 15-second timeout;
- a Prisma 60-second transaction timeout;
- a pooler connection timeout;
- a Vercel platform timeout; or
- a serverless runtime failure.

Category H. TIMEOUT FAILURE is therefore not selected.

## 8. Environment Analysis

Presence-only and source-level checks passed for the local operator environment:

- DATABASE_URL: present
- CRON_SECRET: present
- GOOGLE_SERVICE_ACCOUNT_EMAIL: present
- GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: present
- GOOGLE_SHEETS_SPREADSHEET_ID: present
- effective local Google credential mode: environment service-account pair

Vercel Production and Preview environment metadata showed the required variable names and scopes. Secret values were not printed or compared in this investigation.

The runtime environment gate depends on VERCEL_ENV. Production permits the route; Preview and unknown deployment identities are denied before authentication and before the sync engine. The static preview write-safety verifier passed.

Remaining unknowns:

- whether Production values exactly match the locally validated values;
- whether the Production service-account email has access to the configured spreadsheet;
- whether the Production private key is valid and paired with that email;
- whether Production DATABASE_URL has the expected pooler parameters and TLS behavior; and
- whether deployment-level environment values differ by scope.

These are valid investigation candidates, but no value-level mismatch is proven. Category G. ENVIRONMENT CONFIGURATION FAILURE is not selected.

## 9. Root Cause

Root-cause classification: I. UNKNOWN — INSUFFICIENT EVIDENCE

The most defensible conclusion is:

The authorized sync request failed during the initialization path before a committed sync_runs result became visible. The available Vercel label sync_database is too broad to distinguish a Google-stage failure from a Supabase/Prisma discovery, lease, or syncRun initialization failure. The observed duration has no unique source-code timeout match. The exact root cause is not identified.

Supported conclusions:

1. The request passed the externally observed authorization boundary and reached the sync handler.
2. The handler returned its generic failure response.
3. Google OAuth and metadata calls were attempted, but their response outcomes are unknown.
4. No new committed sync run or data mutation is visible in the audited runtime database.
5. No active synchronization lease remained.

Unsupported conclusions:

- That the pooler was definitely unreachable.
- That the discovery transaction definitely timed out.
- That Google definitely rejected the service account.
- That the failure occurred in normalized data import.
- That the 72.8-second duration itself proves a timeout.

Candidate ranking, without selecting a root cause:

1. Discovery/initialization database interaction — plausible because the safe category is sync_database and no registry/run state committed; exact operation and error code are absent.
2. Google OAuth or metadata response — plausible because those calls were observed; response statuses are absent.
3. Runtime environment value mismatch — plausible because Vercel variable values were not compared; local checks do not prove Production values.
4. Vercel platform/runtime timeout — less supported because the response was the route's JSON 500 and the duration was below maxDuration, but not independently disproven without full platform evidence.

## 10. Evidence

| Evidence ID | Evidence | What it proves | Limitation |
|---|---|---|---|
| E-6E-C-01 | One authorized request returned HTTP 500 with the generic failure body | The sync attempt failed from the operator's perspective | Does not reveal stage or exception. |
| E-6E-C-02 | Sanitized log category sync_database | The bounded classifier reported DATABASE for the caught error | Unknown errors also fall back to DATABASE; no Prisma code is present. |
| E-6E-C-03 | Source order places discovery and lease before syncRun.create | Explains why no run can be visible after an early failure | Does not tell whether Google or database failed. |
| E-6E-C-04 | One OAuth POST and one metadata GET observed | Google integration was attempted | Response statuses and response bodies are unavailable. |
| E-6E-C-05 | Post-failure SELECT-only state: latest SUCCESS, 2409 row states, 0 active leases, 0 open schema changes | No committed sync result or residual lease was observed | Cannot observe a rolled-back transaction. |
| E-6E-C-06 | Local config, schema, Cron-auth, Preview-safety, and state verifiers passed | Local contract and current committed state are healthy under the verifier assumptions | Local success does not prove Production secret-value equivalence. |
| E-6E-C-07 | 72.794-second request/log correlation and maxDuration 300 seconds | Duration is below the Vercel ceiling | No unique application timeout matches the duration. |

Supporting project records:

- docs/PHASE6E_A_PRODUCTION_FUNCTIONAL_READ_ONLY_AUDIT_2026-09-03.md
- docs/PHASE6E_B_CONTROLLED_PRODUCTION_SYNC_REPORT_2026-09-03.md
- docs/PHASE6D_VERCEL_LIVE_VERIFICATION_2026-09-03.md

## 11. Recommended Fix

No fix was implemented in Phase 6E-C.

Recommended order after the operator reviews and approves remediation:

1. Add safe stage-level diagnostics around configuration, Google metadata retrieval, discovery transaction, lease acquisition, and syncRun creation. Record only a correlation ID, stage, bounded category, safe Prisma error code where available, attempt number, and elapsed milliseconds. Do not record URLs with credentials, bearer tokens, private keys, SQL text, or raw exception messages.
2. Recheck Production environment values privately in Vercel. Compare the credential pair, spreadsheet identity, runtime pooler URL shape, TLS/pgbouncer parameters, and VERCEL_ENV behavior without exposing secret material.
3. Run a read-only Production runtime connectivity/health diagnostic through the correct pooler endpoint. Keep migration verification on SUPABASE_DIRECT_URL and do not use migration commands as a sync test.
4. If the new safe evidence identifies a specific Prisma code or Google status, apply the smallest targeted code/configuration change and rerun isolated regression checks before any new Production sync authorization.

The existing generic error response is appropriately safe for the browser, but the current server log does not preserve enough bounded diagnostic context to perform a reliable stage attribution.

## 12. Regression Plan

Only after an explicitly approved remediation:

1. Run static type, lint, schema, configuration, Cron-auth, Preview write-safety, and build checks.
2. Reproduce the identified failure in an isolated local or disposable database target; never use the Production database for a test write.
3. Verify Google configuration and metadata access read-only with the approved credential boundary.
4. Deploy the remediation only through the normal reviewed Production workflow.
5. Confirm the deployed commit and environment scope privately.
6. Obtain a new explicit operator approval for one controlled Production sync. The Phase 6E-B approval cannot be reused.
7. Send exactly one authorized request, record status and safe stage diagnostics, then stop regardless of success or failure.
8. Perform SELECT-only post-checks for sync_runs, source/worksheet registry, leases, row counts, import runs, and duplicate natural keys.

No step 6 or 7 was executed in Phase 6E-C.

## 13. Approval Requirements

Before any next action:

- No code fix, environment change, database change, migration, deploy, Google Sheets change, Cron invocation, or sync retry is authorized by this report.
- Any remediation requires explicit approval after the exact proposed change is presented.
- Any new Production sync requires a separate explicit approval and a fresh one-request limit.
- If a safe diagnostic patch is approved, its output must exclude secret values, tokens, private keys, passwords, full connection URLs, SQL, and raw exception messages.
- If a future authorized sync fails again, stop immediately and preserve the evidence; do not retry automatically from the operator session.

Final data-impact statement: no committed Production data change was observed after the single authorized attempt. The incident remains open as UNKNOWN pending safe stage-level evidence or operator-provided sanitized Vercel/Prisma/Google diagnostics.
