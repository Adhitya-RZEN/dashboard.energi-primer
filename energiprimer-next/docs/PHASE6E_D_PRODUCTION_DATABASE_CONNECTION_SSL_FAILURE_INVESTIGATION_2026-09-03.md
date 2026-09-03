# PHASE 6E-D — PRODUCTION DATABASE CONNECTION / SSL FAILURE INVESTIGATION

Project: Energi Primer PLN Jeranjang  
Repository: energiprimer-next  
Branch: NextJs  
Production: https://dashboard-energi-primer.vercel.app  
Date: 2026-09-03

## Overall Status

ROOT CAUSE NOT YET IDENTIFIED

Root-cause classification: J. UNKNOWN — INSUFFICIENT EVIDENCE

The PostgreSQL log entries are strong supporting evidence for a connection/SSL
candidate, but they do not contain a shared request or client correlation ID.
The current read-only runtime health checks pass, and the application log
category sync_database is intentionally too broad to distinguish a connection,
SSL, transaction, or query failure.

## Safety and Investigation Counters

This phase was read-only.

| Activity | Count |
|---|---:|
| Production sync requests | 0 |
| Production retries | 0 |
| Database writes | 0 |
| Google Sheet writes | 0 |
| Migrations | 0 |
| Environment changes | 0 |
| Deployments | 0 |
| Commits | 0 |
| Pushes | 0 |

The previous Phase 6E-B authorization was already consumed and was not reused.

## Evidence Quality Convention

- FACT means directly observed in source, verifier output, or the operator-supplied incident evidence.
- INFERENCE means a technically plausible interpretation that is not uniquely established.
- UNKNOWN means the available evidence cannot distinguish the alternatives.

## 1. Incident Summary

The single authorized Phase 6E-B Production sync began at approximately
2026-09-03 20:37:41.320 WITA and returned HTTP 500 after approximately
72.8 seconds. The application response was the safe body
{ status: "FAILED", message: "Synchronization failed." }.

The supplied Vercel evidence recorded:

- one POST request to /api/sync/google-sheets;
- one observed POST to oauth2.googleapis.com/token;
- one observed GET to sheets.googleapis.com/v4/spreadsheets/...;
- application log category [google-sheets-sync] sync_database;
- execution below the configured five-minute Vercel maximum;
- no retry and no second sync.

The supplied Supabase evidence recorded:

- 20:38:23 — 08P01 — could not accept SSL connection: EOF detected;
- 20:41:24 — 08P01 — could not accept SSL connection: EOF detected;
- 20:14:20 — 08006 — could not receive data from client: Connection reset by peer.

The 20:38:23 event is temporally inside the request window, but there is no
shared request/client ID. It is therefore treated as a strong supporting
candidate correlation only, not as proof that the event belongs to this sync.

Post-failure read-only state showed no new committed sync run, no residual
lease, no row decrease, no duplicate natural keys, and no open schema change.
The previous visible run remains id 1 with status SUCCESS and zero scanned
rows/counters.

Major conclusion:

- FACT: the authorized sync failed and the audited committed data state did not
  change.
- FACT: the current DATABASE_URL runtime path can connect and read the
  application database.
- INFERENCE: a transient connection, pooler, or transaction-path event remains
  plausible.
- UNKNOWN: the exact Production failure stage and root cause.

Confidence: high for the observed failure and no committed data impact; low for
the exact subsystem.

## 2. Incident Timeline

The timeline assumes the displayed Supabase timestamps use the same WITA
operator timezone as the incident timestamp. PostgreSQL log timezone/correlation
metadata was not supplied.

| Time | Event | Exact correlation |
|---|---|---|
| 2026-09-03 20:14:20 WITA | Supabase 08006 connection reset by peer | 23 minutes 21.320 seconds before request start; impossible to associate with this invocation by time alone. |
| 2026-09-03 20:37:41.320 WITA | Vercel request started | Incident start; equivalent to 12:37:41.320 UTC. |
| 2026-09-03 20:38:23 WITA | Supabase 08P01 SSL EOF | 41.680 seconds after request start; inside the approximate request window if the timestamps share the same timezone. |
| 2026-09-03 20:38:54.114 WITA | Correlated application log time | 72.794 seconds after request start; equivalent to 12:38:54.114 UTC. |
| Approximately 20:38:54 WITA | Function response completed | The supplied duration is approximately 1 minute 11 seconds; the precise platform end timestamp is not independently available. |
| 2026-09-03 20:41:24 WITA | Supabase 08P01 SSL EOF | Approximately 2 minutes 29.886 seconds after the 20:38:54.114 correlation point; outside the same invocation window. |

Correlation assessment:

- FACT: 20:38:23 falls inside the observed request-to-log interval.
- FACT: 20:41:24 falls outside the observed invocation interval.
- FACT: 20:14:20 predates the invocation and cannot be the same connection event
  by timestamp.
- UNKNOWN: whether the 20:38:23 connection was opened by the failed Vercel
  function, the pooler, a health checker, or another client.
- UNKNOWN: whether the 20:38:23 event caused the HTTP 500.

## 3. Source Code Trace

The route and sync engine were inspected without modification.

| Stage | Function / file | Database interaction | External interaction | Possible exception | Relative to syncRun.create |
|---|---|---|---|---|---|
| Environment gate | isSyncAllowedEnvironment in src/lib/deployment-environment.ts:20-54 | None | None | Preview, unknown, or missing deployment identity is denied | Before |
| Cron configuration/auth | handle in src/app/api/sync/google-sheets/route.ts:30-38 | None | Reads request headers | Missing CRON_SECRET returns 503; invalid bearer returns 401 | Before |
| Engine entry | runGoogleSheetsIncrementalSync in src/services/google-sheets/sync/engine.ts:444-451 | No query before discovery returns | Calls discovery wrapper | Google/config/database failure from discovery | Before |
| Google configuration | getGoogleSheetsConfig in src/lib/google-sheets.ts:85-127 | None | Reads process environment | Configuration or credential-mode error | Before |
| Credential preparation | readServiceAccount and getAccessToken in src/lib/google-sheets.ts:190-319 | None | RSA signing and OAuth token POST | Credential parse/sign/auth/network/timeout error | Before |
| Metadata read | listGoogleSheetsWorksheets in src/lib/google-sheets.ts:409-499 | None | Sheets metadata GET | Permission, API, malformed response, or timeout error | Before |
| Discovery transaction | discoverGoogleSheetsWorksheets in src/services/google-sheets/sync/discovery.ts:115-203 | syncSource upsert; syncWorksheet findMany; worksheet upserts; missing updates | None after metadata read | Connection, pool, transaction, constraint, or query error | Before |
| Source lease | acquireSyncSourceLease in src/services/google-sheets/sync/lease.ts:9-24 | syncSource.updateMany | None | Connection/query error or zero-row lock result | Before |
| Run creation | engine.ts:466-478 | syncRun.create with RUNNING | None | Connection, query, constraint, or server-closed-connection error | First operation after lease |
| Worksheet selection/reads | engine.ts:479-508 and 257-430 | Reads and later metadata writes | Sheets range GETs | Read, parser, schema, validation, or database error | After |
| Import transaction | commitGoogleSheetsImportPlan in src/services/google-sheets/import/commit.ts:324-457 | Staging and normalized upserts in a 30-second transaction | None | Import transaction/database error | After |
| Row-state persistence | engine.ts:88-136 | Row-state upserts and worksheet update in a 30-second transaction | None | Database connection/transaction/query error | After |
| Final run update | engine.ts:512-581 | syncRun.update | None | Database error while finalizing | After |
| Error handling | route.ts:59-67 and engine.ts:566-581 | May update a run if its ID exists | None | Safe category only is logged | Catch / final |

The application uses Node.js runtime and the route declares dynamic mode and
maxDuration 300. The route returns the generic HTTP 500 after its catch block.

Source evidence and confidence:

- Source files/functions: route.ts:30-67, engine.ts:444-585,
  discovery.ts:115-203, google-sheets.ts:224-319 and 409-499.
- Vercel evidence: the returned safe JSON matches the route's HTTP 500 path.
- Supabase evidence: one in-window 08P01 candidate, without request ID.
- Confidence: high for the ordering; low for the exact failed operation.

## 4. sync_database Stage Trace

The exact category is produced in two related places:

1. route.ts:60-63:
   non-Google errors become sync_ plus
   classifySyncError(error).toLocaleLowerCase("en-US"), which yields
   sync_database for DATABASE.
2. engine.ts:82-85 and 566-568:
   errors caught after the lease/try boundary are similarly converted to the
   safe category before being logged.

Important boundary detail:

- Discovery, BigInt conversion, and lease acquisition occur before the engine's
  try block.
- A failure there is caught by the route and logged only as its bounded
  category.
- syncRun.create and later stages are inside the engine try block.
- If a run ID exists, the engine attempts to mark that run FAILED; if no run ID
  exists, no failure row is created.
- The route never returns the exception message or database URL.

FACT: sync_database is the category observed by the operator.  
FACT: the current classifier maps Prisma error classes to DATABASE.  
FACT: the classifier also maps an unrecognized error to DATABASE.  
INFERENCE: the error may have been a Prisma/database error.  
UNKNOWN: whether it was a database connection, SSL, transaction, query, or
non-Prisma error that fell through to the default category.

## 5. Prisma Client Analysis

Prisma client construction is in src/lib/prisma.ts:1-21:

- PrismaClient is instantiated at module scope.
- globalThis is used as a development hot-reload cache.
- the client is not assigned to the global cache when NODE_ENV is production.
- log is set to an empty list so Prisma's default error event does not expose
  provider/endpoint details at the client boundary.
- there is no explicit $connect or $disconnect in the application source path.

Serverless lifecycle assessment:

- FACT: a loaded route bundle has one module-level client instance rather than
  constructing a client inside the HTTP handler.
- FACT: production serverless isolates can each create their own module-level
  client on cold start; the code does not provide a cross-isolate singleton.
- FACT: the application does not explicitly disconnect the runtime client.
- FACT: the read-only verifier scripts disconnect their own CLI clients.
- UNKNOWN: the number of Vercel isolates or concurrent clients at the incident
  time.
- UNKNOWN: whether any pool exhaustion occurred.

This structure is generally aligned with Prisma's serverless guidance to
instantiate PrismaClient outside the handler and avoid explicit disconnects in
the request lifecycle. The external reference is
[Prisma database connections documentation](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections).

There is no source-level custom pool size, socket timeout, or connection
shutdown handler. The URL metadata shows no connection_limit, connect_timeout,
pool_timeout, or socket_timeout parameter. This makes a connection-capacity or
pool-wait issue possible in theory, but there is no direct incident evidence of
pool exhaustion.

Confidence: high for source behavior; low for lifecycle causality.

## 6. DATABASE_URL Runtime Analysis

Values were not printed. Only sanitized metadata was inspected.

| Variable | Present | URL valid | Port | SSL parameter | pgbouncer parameter | Pooler endpoint | Safe query parameter names |
|---|---|---|---:|---|---|---|---|
| DATABASE_URL | YES | YES | 6543 | PRESENT | PRESENT | YES | pgbouncer, sslmode |
| SUPABASE_POOLER_URL | YES | YES | 6543 | PRESENT | ABSENT | YES | sslmode |
| SUPABASE_DIRECT_URL | YES | YES | 5432 | PRESENT | ABSENT | NO | sslmode |

Additional sanitized facts:

- protocol/scheme: present but intentionally redacted;
- host: redacted;
- username and password: not printed;
- DATABASE_URL uses the Supabase pooler port class 6543;
- DATABASE_URL includes sslmode and pgbouncer parameter names;
- no connection_limit, connect_timeout, pool_timeout, or socket_timeout
  parameter name was present in DATABASE_URL;
- the value of sslmode was not printed;
- URL syntax parsing succeeded.

Source evidence:

- prisma/production/schema.prisma:6-9 declares datasource URL env("DATABASE_URL").
- src/services/google-sheets/import/commit.ts:59-75 reads DATABASE_URL for the
  runtime target guard.
- src/lib/prisma.ts:8-16 constructs the runtime client without substituting a
  direct URL.

FACT: DATABASE_URL is the runtime variable and is syntactically valid with
pooler/SSL-related parameter names.  
UNKNOWN: the secret value, exact sslmode value, connection capacity, and
Production value-level equivalence.

## 7. Supabase Pooler / SSL Analysis

Runtime architecture confirmed by source:

Application runtime:

DATABASE_URL → Supabase transaction pooler shape on port 6543

Migration/operator path:

SUPABASE_DIRECT_URL → Supabase direct connection shape on port 5432

The route and Prisma datasource use DATABASE_URL. No route or sync helper
substitutes SUPABASE_DIRECT_URL.

Compatibility review:

- Supabase documents port 6543 transaction-pooling mode as the mode intended
  for serverless or temporary clients.
- Supabase documents that transaction mode does not support prepared
  statements and recommends the pgbouncer=true connection parameter for Prisma
  transaction-mode use.
- The inspected DATABASE_URL contains pgbouncer and sslmode parameter names.
- The application uses Prisma interactive transactions for discovery and import.
  A transaction-pooler path can support a transaction when the backend
  connection is retained for that transaction, but session state must not be
  assumed to persist across transaction boundaries.
- No source code relies on a persistent session setting in the sync discovery
  transaction.

The reference is
[Supabase PostgreSQL connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres).

Read-only SSL observation through the current DATABASE_URL:

- SELECT 1 succeeded.
- current database was postgres.
- current schema was public.
- a simple sync_sources table read succeeded.
- pg_stat_ssl for the observed backend session returned false.

Interpretation:

- FACT: the observed PostgreSQL backend session reported ssl=false.
- FACT: the client URL contains an sslmode parameter, but its value was not
  exposed.
- INFERENCE: because the application connects through a transaction pooler,
  pg_stat_ssl may describe the pooler's backend hop rather than the original
  client-to-pooler TLS session. The false value therefore does not prove that
  the client-to-pooler connection was unencrypted.
- UNKNOWN: whether the client-to-pooler TLS handshake was successful during the
  failed Vercel invocation.
- UNKNOWN: whether the 20:38:23 SSL EOF event was this function's connection.

No direct URL was used as a substitute for runtime health verification, and no
TLS was disabled or changed.

Confidence: medium for intended pooler shape; low for incident SSL causality.

## 8. PostgreSQL Error Analysis

The official PostgreSQL error-code table identifies:

- 08P01 as protocol_violation;
- 08006 as connection_failure.

Reference:
[PostgreSQL Appendix A — Error Codes](https://www.postgresql.org/docs/current/errcodes-appendix.html).

### 08P01: could not accept SSL connection: EOF detected

FACT:

- The operator supplied this exact message at 20:38:23 and again at 20:41:24.
- PostgreSQL classifies 08P01 as protocol_violation.
- The message says the server observed EOF while accepting an SSL connection.

INFERENCE:

- The peer may have closed the socket during SSL negotiation.
- A pooler, client, network path, process termination, or TLS mismatch could
  produce that observable pattern.
- The event is consistent with an aborted handshake or session startup.

UNKNOWN:

- whether the peer was the Vercel function, Supabase pooler, another client, or
  a health-check process;
- whether a malformed protocol message was involved;
- whether certificate validation, TLS version, or server configuration played a
  role;
- whether the event caused the sync's 500.

The code and message alone do not identify the failing layer.

### 08006: could not receive data from client: Connection reset by peer

FACT:

- The operator supplied this exact message at 20:14:20.
- PostgreSQL classifies 08006 as connection_failure.
- The message states that the server's client connection was reset by its peer.

INFERENCE:

- The client or an intermediary closed/reset the connection, or a network
  device terminated it.
- A pooler/client lifecycle interruption is consistent with the message.

UNKNOWN:

- which peer reset the connection;
- whether it was related to the sync;
- whether the reset occurred during a query, transaction, idle period, or
  connection teardown.

The 08006 event predates the incident by more than 23 minutes and is not
temporally assignable to the failed invocation.

### Relation to Prisma and pooler behavior

Any PostgreSQL connection operation in discovery, lease acquisition, or
syncRun.create could surface a connection failure. A protocol/SSL event can
occur before a SQL statement is identifiable. The supplied logs contain no
Prisma error code, query name, request ID, or transaction ID.

Therefore:

- 08P01/08006 are consistent with connection-layer instability;
- they do not prove a Prisma bug, pool exhaustion, malformed application query,
  or Supabase misconfiguration;
- they do not prove that the failed sync reached a database transaction.

Confidence: high for the code meanings; low for attribution and root cause.

## 9. Google Stage Analysis

Source order:

1. getGoogleSheetsConfig validates the environment.
2. readServiceAccount prepares the service-account credential.
3. getAccessToken may POST to the OAuth token endpoint.
4. listGoogleSheetsWorksheets GETs spreadsheet metadata.
5. only then does discovery begin its Prisma transaction.

The Google client uses:

- spreadsheets.readonly scope;
- a 15-second AbortController timeout per fetch;
- bounded error codes for authentication, permission, rate limit, timeout, API,
  and malformed response.

Production evidence confirms the OAuth POST and metadata GET were observed.
It does not contain their response statuses or response bodies.

FACT: Google calls were attempted.  
FACT: local configuration and read-only Google metadata checks previously passed.  
UNKNOWN: whether Production OAuth succeeded.  
UNKNOWN: whether Production metadata retrieval succeeded.  
UNKNOWN: whether the failure occurred before or after the metadata response.  

No Google API was called during Phase 6E-D, and no Google Sheet was modified.

Category H. GOOGLE API FAILURE is not selected.

Confidence: high for source ordering; low for Production response outcome.

## 10. Timeout Analysis

| Control | Configured value | Relevance |
|---|---:|---|
| Google fetch AbortController | 15 seconds | Applies to OAuth, metadata, and range requests |
| Google retry attempts | Up to 3 | Only transient Google integration errors |
| Google retry backoff | 500 ms, then 1,000 ms, capped at 4,000 ms | Between retryable Google attempts |
| Discovery transaction maxWait | 10 seconds | Waiting for an interactive transaction connection |
| Discovery transaction timeout | 60 seconds | Interactive discovery transaction |
| Import transaction timeout | 30 seconds | Normalized import transaction |
| Row-state transaction timeout | 30 seconds | Row-state persistence transaction |
| Source lease | 300 seconds | Concurrency lease, not a function timeout |
| Vercel maxDuration | 300 seconds | Serverless execution ceiling |

Search results in the inspected source:

- no 70-, 72-, or 73-second application timeout constant;
- no Promise.race timeout for this route;
- no explicit socket timeout;
- no explicit connection timeout in DATABASE_URL metadata;
- retry code includes database candidates P1001, P1008, P1017, P2024, and P2034;
- discovery is not wrapped in withDatabaseRetry.

The approximately 72.794-second correlation can overlap a combination of
connection acquisition, the discovery transaction envelope, upstream latency,
or timestamp/logging gaps. It does not uniquely match the 60-second discovery
transaction timeout, and it is below the 300-second Vercel ceiling.

FACT: the observed duration is below maxDuration.  
FACT: no matching 72-second source timeout was found.  
INFERENCE: a transient connection acquisition or database transaction wait
remains possible.  
UNKNOWN: whether any configured timeout actually fired.

Category G. TIMEOUT / CONNECTION ACQUISITION FAILURE is not selected.

Confidence: medium for configured values; low for attribution.

## 11. Vercel Runtime Analysis

Earlier provenance evidence identified the active Production deployment as:

- canonical host: dashboard-energi-primer.vercel.app;
- state: READY / Production;
- branch: NextJs;
- commit: 09363e739d5dc4ca5931724bd63d1c21ca293ca6;
- route: /api/sync/google-sheets;
- runtime: Node.js;
- maxDuration: 300 seconds.

The HTTP response body matches the route's application-generated safe 500
response. This supports application-generated failure over a Vercel platform
timeout.

FACT:

- the function ran for approximately 1 minute 11 seconds;
- the configured maximum is 5 minutes;
- the returned body matches route.ts:64-67.

UNKNOWN:

- the complete raw Vercel function record;
- the Vercel request ID;
- whether the platform recorded a lower-level connection warning;
- the exact response/end timestamp independent of the supplied evidence.

Category F. SERVERLESS / PRISMA CONNECTION LIFECYCLE FAILURE is not selected,
and no Vercel maxDuration timeout is claimed.

Confidence: high that a 300-second maxDuration timeout is not supported; medium
that the 500 was generated by the route catch path.

## 12. Production Read-Only Health Check

Existing SELECT-only verifiers were run through DATABASE_URL:

### db:verify

Result: PASS.

- database: postgres;
- schema: public;
- Prisma connection/read succeeded;
- units: 3;
- coal consumption: 636;
- coal stock: 212;
- no tested orphan relationships;
- no DML.

### supabase:production:runtime:local

The verifier's local endpoint mode intentionally consumes the unchanged
DATABASE_URL from .env.local. It does not substitute SUPABASE_DIRECT_URL.

Result: PASS.

- database: postgres;
- schema: public;
- PostgreSQL: 17.6;
- application rows: 8952;
- stable data rows: 2406;
- July 2026 overview and monthly coverage checks: PASS;
- localDatabaseUrlChangedByThisChildProcess: false;
- localDatabaseWrites: 0;
- supabaseWrites: 0.

### Explicit SELECT-only probe

Result: PASS.

- SELECT 1: true;
- current database: postgres;
- current schema: public;
- one sync_sources table read: count 1;
- pg_stat_ssl backend-session value: false;
- databaseWrites: 0.

The restricted sandbox initially could not reach the remote pooler. The same
read-only verifier succeeded when network access was allowed for the check.
This is an execution-environment distinction and is not treated as a
Production outage or a write.

Health-check conclusion:

- FACT: DATABASE_URL is currently reachable and supports application reads.
- FACT: the current read-only database checks did not write.
- INFERENCE: the incident was not a persistent, currently reproducible
  connection outage.
- UNKNOWN: whether a transient connection/pooler/SSL event occurred during the
  original invocation.

Confidence: high for current health; low for historical causality.

## 13. Environment Comparison

| Property | Runtime DATABASE_URL | Operator direct variable | Operator pooler variable | Assessment |
|---|---|---|---|---|
| Application use | Used by Prisma datasource and sync route | Not used by sync route | Not used by sync route | Confirmed by source |
| Endpoint class | Pooler | Direct | Pooler | Sanitized URL metadata |
| Port | 6543 | 5432 | 6543 | Observed, values hidden |
| sslmode parameter name | Present | Present | Present | Value not exposed |
| pgbouncer parameter name | Present | Absent | Absent | Runtime URL includes it |
| URL syntax | Valid | Valid | Valid | Local operator inspection |
| Value equality with Vercel Production | Unknown | N/A | N/A | Vercel values were not printed/comparison unavailable |

Environment checks:

- ops:verify-env: PASS;
- sync:verify-config: PASS;
- required local values were present without printing secret material;
- Vercel environment metadata previously showed required variable names/scopes,
  but not their values.

Potential but unproven mismatches:

- Production service account and spreadsheet pairing;
- Production private key validity;
- Production DATABASE_URL exact parameter values;
- Production environment scope;
- VERCEL_ENV runtime identity.

Category E. ENVIRONMENT CONFIGURATION FAILURE is not selected.

Confidence: high for local shape/presence; low for Vercel value equivalence.

## 14. Error Classifier Analysis

classifySyncError in src/services/google-sheets/sync/error-classification.ts:28-58
behaves as follows:

- GoogleSheetsIntegrationError authentication/credentials → AUTHENTICATION;
- permission → PERMISSION;
- rate_limit → RATE_LIMIT;
- timeout → TIMEOUT;
- API with no status → NETWORK;
- other Google API → API;
- Prisma initialization, known request, unknown request, or Rust panic → DATABASE;
- recognized message patterns → bounded categories;
- all remaining errors → DATABASE.

Consequences:

- PostgreSQL SQLSTATE 08P01 or 08006 is not preserved by this classifier.
- Prisma P1001/P1008/P1017/P2024/P2034 would all collapse to DATABASE.
- An arbitrary Error without a recognized message also collapses to DATABASE.
- The route logs only sync_database and returns the generic safe response.

FACT: sync_database is not proof of a database connection failure.  
FACT: the classifier intentionally prevents raw exception details from reaching
the browser.  
INFERENCE: the category may reflect a Prisma exception.  
UNKNOWN: the original error class, safe Prisma code, and exact operation.

The static retry/classifier verifier passed:

- transient Google retry behavior;
- permission fail-fast behavior;
- transient database retry behavior;
- operational error classification without exposing exception details.

The fact that the verifier passes validates the classifier contract, not the
historical Production exception.

## 15. Observability Gap

The current route/engine logging can distinguish only a bounded category.

| Diagnostic field | Current availability | Safe future behavior |
|---|---|---|
| Stage | No | Add bounded stage such as google_metadata, discovery_transaction, lease, or sync_run_create |
| Error category | Yes, broad | Keep bounded category |
| Prisma code | No | Add safe code only, for example P1001 or P2024 |
| Google status | No | Add numeric HTTP status only |
| Elapsed time | No | Add duration_ms |
| Attempt number | No | Add bounded attempt number |
| Correlation ID | No | Add non-secret request correlation ID |

Recommended safe log shape after approval:

request_id, stage, status, duration_ms, bounded_error_category,
safe_prisma_code, google_http_status, attempt

Never log:

- CRON_SECRET;
- AUTH_SECRET;
- DATABASE_URL;
- SUPABASE_DIRECT_URL;
- private key;
- OAuth access token;
- password;
- cookie;
- Authorization header;
- raw SQL containing sensitive data;
- an unbounded raw exception if it may contain secrets.

No instrumentation was implemented in this phase.

Evidence:

- route.ts:59-67;
- engine.ts:82-85 and 566-581;
- error-classification.ts:28-58.

Confidence: high that the current fields cannot distinguish the required
stages.

## 16. Root Cause Decision Matrix

| Candidate | Evidence For | Evidence Against | Confidence |
|---|---|---|---|
| Database connection failure | sync_database category; 08P01/08006 connection-layer evidence; no new run | 08P01 has no request ID; current DATABASE_URL SELECT health passes; no Prisma code | LOW |
| SSL connection failure | In-window operator log says SSL EOF; current pooler path reports backend ssl=false | Backend pooler SSL view may not describe client TLS; sslmode is present; no request correlation; current read succeeds | LOW |
| Database transaction failure | Discovery interactive transaction is before syncRun.create; 60-second transaction timeout exists; no discovery state committed | No transaction error/code; timing is not a unique match; no proof transaction was reached | LOW |
| Query failure | syncSource/worksheet queries can fail before syncRun.create | No query name, SQLSTATE attribution, or constraint evidence | LOW |
| Environment mismatch | Vercel values were not compared; local success does not prove Production values | Required Vercel variable names/scopes were present; local configuration is valid; no value mismatch shown | LOW |
| Prisma lifecycle | Serverless isolates can create clients and pooler lifecycle events are possible | Client is module-scoped outside handler; no disconnect misuse; no concurrency/pool evidence | LOW |
| Timeout / connection acquisition | 10-second transaction maxWait and 60-second discovery timeout could contribute to a roughly 72.8-second run | No 72.8-second timeout; below Vercel maxDuration; no timeout code | LOW |
| Google failure | OAuth and metadata calls were observed before database initialization | Response statuses/bodies unavailable; local Google read checks pass; log was sync_database | LOW |
| Vercel runtime failure | Serverless connection lifecycle is theoretically relevant | Route-shaped JSON 500; duration below 300 seconds; no platform timeout evidence | LOW |
| Application logic failure | Unknown errors fall through to DATABASE and source has multiple validation stages | No logic exception or stage evidence; failure appears before a committed run | LOW |

The matrix records candidates only. It does not establish causality from the
08P01 timestamp.

## 17. Root Cause Classification

Selected exactly one:

J. UNKNOWN — INSUFFICIENT EVIDENCE

Reason:

The evidence proves a failed authorized request, an in-window PostgreSQL SSL
EOF candidate, a generic sync_database log category, and no committed sync
state. It does not prove that the PostgreSQL event belongs to this request, nor
does it reveal whether Google, pooler/SSL, Prisma connection acquisition,
discovery transaction, or syncRun creation failed first.

Overall status remains:

ROOT CAUSE NOT YET IDENTIFIED

## 18. Recommended Remediation

No remediation was implemented. The smallest safe next action is to improve
bounded observability and privately verify Production connection values before
attempting any new sync.

| Area | Recommendation | Why | Risk | Expected effect | Rollback strategy |
|---|---|---|---|---|---|
| A. Code change | After approval, add stage/request ID/duration and safe Prisma or Google code fields around discovery, lease, and syncRun.create | Identifies the failing boundary without exposing secrets or changing sync semantics | Low runtime overhead; logging mistakes could leak data if not reviewed | Converts sync_database into actionable but bounded evidence | Revert the instrumentation change and redeploy the prior reviewed commit |
| B. Vercel configuration | Operator privately compare Production values and scopes for DATABASE_URL, Google credential pair, spreadsheet ID, CRON_SECRET, and VERCEL_ENV; change only a proven mismatch | Local success does not prove Vercel value equivalence | Incorrect secret replacement can break auth, Google access, or DB access | Aligns runtime values with the validated configuration | Restore the prior value in Vercel and redeploy if required |
| C. Supabase configuration | Operator review pooler/SSL logs, connection capacity, and the 20:38:23 event correlation; do not disable TLS or bypass the pooler without evidence | The log is a candidate connection/SSL signal, not a diagnosis | Provider-side changes can affect all application traffic | Confirms or rejects a transient pooler/SSL issue | Revert only a specifically approved provider setting |
| D. Prisma configuration | Do not alter connection_limit, timeouts, URL mode, or transaction behavior until a safe error code/stage identifies the need | Current runtime shape is compatible and health checks pass | Tuning can mask the root cause or increase connection pressure | Targeted mitigation only if pool/timeout evidence appears | Revert the exact parameter or code change |
| E. Observability improvement | Use the same bounded structured fields listed in section 15 | Current category discards the evidence needed for attribution | Small log-volume and implementation cost | Enables one-request diagnosis on the next approved attempt | Remove the added fields or revert the patch |

No recommendation replaces DATABASE_URL with SUPABASE_DIRECT_URL. No
recommendation removes SSL, disables TLS, or bypasses the pooler.

## 19. Safe Regression Plan

Do not execute Stage 6 or Stage 7 during Phase 6E-D.

### Stage 1 — Local static checks

Run lint, TypeScript, Prisma validation/generate, sync configuration,
classifier/retry, schema, and build checks. Confirm no secret output.

### Stage 2 — Isolated local sync

Use a disposable or non-Production database and controlled Google fixture.
Verify discovery, lease cleanup, syncRun creation, transaction rollback
behavior, row-state persistence, and no duplicate natural keys. Never use the
Production database for a test write.

### Stage 3 — Google read-only verification

Validate credential parsing and spreadsheet metadata/range access read-only.
Do not modify a Google Sheet.

### Stage 4 — Preview deployment

Deploy only an approved reviewed change. Confirm Preview returns the fail-closed
environment response before Cron authentication and before the sync engine.
Confirm no database write.

### Stage 5 — Production deployment

Deploy only if the remediation is explicitly approved. Confirm the deployed
commit, runtime, route, and Production environment scope privately.

### Stage 6 — New explicit operator approval

Obtain a new written approval after the proposed fix and deployment evidence are
reviewed. The Phase 6E-B approval cannot be reused.

### Stage 7 — Exactly one authorized Production sync

Send exactly one authorized request, record the safe response and structured
stage evidence, and stop whether it succeeds or fails. Do not retry from the
operator session.

### Stage 8 — Post-sync SELECT-only verification

Inspect sync_runs, source/worksheet registry, leases, import runs, normalized
row counts, row states, schema changes, and duplicate natural keys with
SELECT-only queries.

Phase 6E-D executed only read-only checks corresponding to portions of Stages 1
and 8. Stages 6 and 7 were not executed.

## 20. Approval Requirements

Before any next action:

- no code change is approved by this report;
- no Vercel environment change is approved by this report;
- no Supabase setting change is approved by this report;
- no Prisma timeout/pool change is approved by this report;
- no deploy is approved by this report;
- no sync, retry, or authorized Cron invocation is approved by this report;
- any remediation requires a separate explicit approval describing the exact
  change and rollback;
- any new Production sync requires a NEW explicit operator approval with a
  one-request limit;
- the Phase 6E-B approval is consumed and must not be reused;
- any future diagnostic output must exclude credentials, URLs with secrets,
  tokens, private keys, passwords, cookies, Authorization headers, and
  sensitive SQL.

Final safety statement:

Production sync requests 0; Production retries 0; database writes 0; Google
Sheet writes 0; migrations 0; environment changes 0; deployments 0; commits 0;
pushes 0.

Final data-impact statement: no committed Production data change was observed
after the single Phase 6E-B authorized attempt. Current runtime health is
read-only PASS, but the historical failure remains classified as
J. UNKNOWN — INSUFFICIENT EVIDENCE.
