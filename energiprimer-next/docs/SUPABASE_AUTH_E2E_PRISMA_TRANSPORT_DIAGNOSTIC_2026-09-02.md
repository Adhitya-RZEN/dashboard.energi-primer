# Supabase Auth E2E Prisma Transport Diagnostic — 2026-09-02

> HISTORICAL / NON-ACTIVE (Phase 6C, 2026-09-02): This diagnostic does not
> authorize Supabase Auth or recovery configuration.

## Status

`PASS_WITH_CERTIFICATE_REVIEW`

Root-cause classification for the previous Prisma `P1001`:

`TRANSIENT_CONNECTION_FAILURE`

The current clean transport probe reached the E2E Direct PostgreSQL endpoint,
completed a PostgreSQL TLS transport handshake, and Prisma `$connect()`
succeeded. No application, schema, or credential remediation was performed.

## Environment

| Check | Result |
| --- | --- |
| Environment source | `.env.e2e.local` only |
| Environment marker | `non-production` — PASS |
| E2E confirmation marker | `NON_PRODUCTION_ONLY` — PASS |
| Supabase target | E2E project — PASS |
| Database endpoint classification | Supabase E2E Direct |
| Port | `5432` |
| Database name check | `postgres` — PASS |
| Database user format | PASS |
| SSL mode | `sslmode=require` — PASS |
| Production fallback | DISABLED |
| Production access | 0 |

The probe parsed the E2E environment file internally and did not read
`.env.local`. No connection string, password, key, token, or secret value is
recorded here.

## DNS

| Check | Result |
| --- | --- |
| Node DNS lookup | PASS |
| IPv4 result | NOT_FOUND |
| IPv6 result | FOUND |
| Endpoint identity | Matches the E2E Direct classification |

Node resolved the same E2E Direct endpoint classification used by the Prisma
probe. The IPv6-only result is recorded as a network characteristic, not as a
failure by itself.

## TCP

| Check | Result |
| --- | --- |
| Node TCP socket to Direct PostgreSQL | PASS |
| Port | `5432` |
| Elapsed time | Approximately 43 ms |

The first sandboxed attempt returned `EACCES`, which was identified as the
execution sandbox restriction. The same read-only probe outside the sandbox
completed successfully; therefore the sandbox result is not classified as an
endpoint failure.

## TLS

The probe sent only the PostgreSQL SSL negotiation request and performed no
authentication or SQL query.

| Check | Result |
| --- | --- |
| PostgreSQL TLS transport handshake | PASS |
| TLS transport elapsed time | Approximately 175 ms |
| Strict Node certificate verification | REVIEW |
| Sanitized certificate error | `SELF_SIGNED_CERT_IN_CHAIN` |

The TLS handshake completed when certificate trust verification was disabled
for this transport-only diagnostic. The strict certificate check did not pass
under the Node trust store. This is a certificate-validation review item; it
does not prove a database credential problem and no certificate or SSL setting
was changed.

## Prisma

| Check | Result |
| --- | --- |
| Prisma datasource source | E2E `DATABASE_URL` from `.env.e2e.local` |
| Prisma `$connect()` | PASS |
| Prisma elapsed time | Approximately 351 ms |
| Previous `P1001` reproduced | NO |
| SQL query executed by this phase | NONE |

Prisma was instantiated with the E2E datasource only. Inherited connection
variables were cleared from the temporary probe process before the client was
created. No production datasource was used.

## Next.js Runtime

| Check | Result |
| --- | --- |
| E2E wrapper environment source | `.env.e2e.local` only |
| `.env.local` fallback | DISABLED |
| Stale Next.js development process | NONE DETECTED |
| Next.js process terminated | NO |
| Playwright | NOT RUN |

The existing `run-e2e-with-env.mjs` loader was inspected. It loads the E2E
file explicitly and passes the runtime variables to the child process; it does
not load `.env.local` as a fallback.

## Error Timing

| Stage | Result |
| --- | --- |
| DNS | PASS |
| TCP | PASS |
| PostgreSQL TLS transport | PASS |
| Prisma initialization/connect | PASS |
| SQL/query stage | NOT ENTERED |

The previous `P1001` was not reproduced after the current E2E Direct
configuration was used in a clean process. Because no stale Next.js process
was present, the safest classification is `TRANSIENT_CONNECTION_FAILURE`;
the earlier failure may also have been associated with the previous runtime
configuration state.

## Root Cause Classification

| Classification | Result | Basis |
| --- | --- | --- |
| `NODE_NETWORK_FAILURE` | NOT CONFIRMED | Node TCP succeeded outside sandbox |
| `TLS_FAILURE` | NOT CONFIRMED for transport | PostgreSQL TLS handshake succeeded |
| `PRISMA_CONNECTION_FAILURE` | NOT CONFIRMED | Current Prisma connect succeeded |
| `STALE_RUNTIME_ENVIRONMENT` | NOT CONFIRMED | No stale Next.js process detected |
| `TRANSIENT_CONNECTION_FAILURE` | **SELECTED** | Previous P1001 not reproduced |
| `UNDETERMINED` | NOT SELECTED | Current evidence is sufficient for transport diagnosis |

The strict certificate verification result remains `REVIEW`, but it is not the
selected root cause of the previous P1001 because Prisma connected using the
configured `sslmode=require` transport.

## Evidence and Safety Counters

- Environment values were not printed.
- `.env.local` was not read.
- No production endpoint was accessed.
- No PostgreSQL authentication credentials were printed.
- No SQL query was sent by the raw TCP/TLS probes.
- No INSERT, UPDATE, DELETE, migration, seed, import, sync, or provisioning
  was performed.
- Database writes: `0`.
- Temporary diagnostic probe was syntax-checked and removed after the run.
- No application source, Prisma schema, Auth implementation, or environment
  file was changed.

## Recommended Phase 22E.8

1. Decide whether the Node certificate-chain review requires operator action
   for the intended runtime. Do not disable certificate verification globally
   as an automatic fix.
2. Run the database read-only metadata/schema/data audit again, since this
   phase intentionally executed only transport and Prisma connection checks.
3. If that audit passes, run the isolated Supabase Auth Playwright suite in a
   separate phase using the E2E wrapper.
4. Keep Production, migrations, seed/import, and business-data writes out of
   the E2E validation path.

## Final Output

```text
STATUS: PASS_WITH_CERTIFICATE_REVIEW
DNS: PASS (IPv6 found)
TCP: PASS
TLS: PASS transport / CERTIFICATE REVIEW
NODE_RUNTIME: PASS
PRISMA_CONNECT: PASS
ERROR_CODE: previous P1001 not reproduced
ERROR_TIMING: no current error; prior failure occurred at Prisma connection initialization
DATABASE_WRITES: 0
PRODUCTION_ACCESS: 0
ROOT_CAUSE: TRANSIENT_CONNECTION_FAILURE
NEXT_PHASE: 22E.8 read-only database audit, then isolated E2E if database gate passes
```
