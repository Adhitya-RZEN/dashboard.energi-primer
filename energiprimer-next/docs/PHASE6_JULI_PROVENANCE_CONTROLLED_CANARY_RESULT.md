# PHASE 6 JULI PROVENANCE & CONTROLLED PRODUCTION CANARY RESULT

Status:
BLOCKED

Juli provenance:
APPROVED

Juli mapping:
APPROVED

Juli preflight:
PASS

Canary authorization:
AUTHORIZED

Canary scope:
<=25 records

Actual canary records:
22

Canary scope integrity:
PASS

Import plan integrity:
PASS

Durable ledger:
FAIL

Production execution:
EXECUTED

Production business INSERT:
0

Production business UPDATE:
15

Production business DELETE:
0

Production business UPSERT:
15

Unplanned Production business writes:
0

Google Sheets writes:
0

Ledger run:
NOT VERIFIED

Ledger batches:
NOT VERIFIED

Commit:
PASS

Reconciliation:
FAIL

Idempotency:
NOT EXECUTED

Recovery:
NOT EXECUTED

Duplicate business records:
0

Agustus:
SCHEMA_REVIEW - BLOCKED

Schema changes:
0

Migration:
0

Gate 1 - Juli Provenance:
PASS

Gate 2 - Canonical Preflight:
PASS

Gate 3 - Canary Scope:
PASS

Gate 4 - Production Commit:
PASS

Gate 5 - Reconciliation:
FAIL

Gate 6 - Idempotency:
FAIL

Gate 7 - Recovery:
REVIEW_ONLY

Automation readiness:
2/4 (unchanged; architecture and ledger infrastructure are ready, but this bounded execution did not complete durable reconciliation, idempotency, and Production recovery proof)

Validation:
- TypeScript: PASS
- Lint: PASS
- Build: PASS
- Prisma: PASS
- Phase 2: PASS
- Phase 3: PASS (23 assertions)
- Phase 4: PASS
- Phase 5: PASS
- Phase 5.1: PASS
- Phase 5.2: PASS
- Phase 6: PASS (contract fixtures); BLOCKED (live post-canary state)
- Production verification: PASS_WITH_REVIEW (business commit and scope evidence captured; ledger recovery remains pending)

Critical findings:
1. The explicitly authorized canonical POST executed the exact 22-record Juli scope and committed 15 business updates, including the 2026 biomass-target provenance correction from April/import 12 to Juli/import 15. The API returned FAILED after the business transaction because post-write reconciliation detected Production storage precision differences.
2. The Production ledger run 1 and batch 1 remain RECONCILIATION_REQUIRED with RECOVERY_REQUIRED. A storage-precision comparator fix and an exact-scope state-only recovery helper are implemented, but executing that helper would mutate Production ledger and Juli row-state/registry metadata and was not performed without explicit approval.
3. Idempotency was not run after the failed overall canary, Production failure injection was not performed, Agustus was untouched and remains blocked, and the deployed Vercel environment was not changed; the live write used the existing local canonical route against the Production database.

Remaining blockers:
1. Explicit approval for the exact state-only recovery of ledger plan d6f4659cb1fab3af7cdd81e8f95d7caac054a6eb16e9b32ed7a38ab6afe2acbe.
2. Durable ledger reconciliation, Juli row-state/registry repair, and same-immutable-plan idempotency verification.
3. Production deployment configuration still lacks the Phase 6 canary variables, and Agustus requires a separate approved schema/mapping resolution.

Documentation:
UPDATED

Next step:
Run the separately approved state-only recovery only after explicit operator approval. It must reconcile the existing ledger plan and repair only the 22 Juli row-state/registry metadata records, with zero normalized business writes, zero Google Sheets writes, and zero schema or migration changes. Then perform read-only reconciliation and the existing same-immutable-plan idempotency check; do not rerun the initial canary or expand scope.

## 1. Authorization and boundary

The operator authorization was limited to `Juli26-BB`, a maximum of 25 business records, the canonical POST/write boundary, durable ledger execution, reconciliation, idempotency, and safe recovery verification. No scheduler, full worksheet sync, Agustus operation, unrelated business table, schema change, migration, or Google Sheets write was authorized or performed.

## 2. Juli provenance decision

The live worksheet was `Juli26-BB`, Google Sheets sheet ID `1692973815`, source range `A1:ZZ500`. The live source metadata produced schema hash `2bed9745b5200c0904726f42efdeb560276397909e185d0f2b8fd2015aa4e983`; the source was admitted through the existing active Juli registry entry before execution.

The target evidence was:

- `CO55` is the live label `Target 2026`.
- `CO56` contains the live raw display value `  70.020 `, which resolves to `70,020` tonnes for target year 2026.
- Production already contained biomass target ID 1 for year 2026 with value `70,020`, attributed to `Google Sheets April26-BB`, import run 12.
- The Juli target has the same business identity and value. Within this explicitly authorized 22-record canary, Juli was therefore approved as the current source/provenance owner for that target, and the existing target record was updated through the canonical writer rather than by a direct SQL or Prisma shortcut.

This is a provenance correction within the authorized canary record. It is not a general historical backfill decision.

## 3. Exact canary provenance

The live parser found 352 valid canonical candidates and selected the closed, deterministic `Juli26-BB_FINAL_DAY_AND_AGGREGATES_V1` scope of 22 records. Every selected record had worksheet, sheet ID, source range, cell coordinate, canonical field, business identity, raw source value, and approved mapping provenance.

| # | Canonical field | Source cell | Business identity | Raw source value | Normalized value | Plan |
|---:|---|---|---|---|---:|---|
| 1 | `biomass_consumption.quantityTon` | T41 | 2026-07-31, unit 1 | `  81,600 ` | 81.6 | NOOP |
| 2 | `biomass_consumption.quantityTon` | W41 | 2026-07-31, unit 2 | `  47,600 ` | 47.6 | NOOP |
| 3 | `biomass_consumption.quantityTon` | Z41 | 2026-07-31, unit 3 | `  84,960 ` | 84.96 | UPDATE |
| 4 | `biomass_cumulative.cumulativeTon` | Y71 | July 2026 period | `29685,13` | 29685.13 | UPDATE |
| 5 | `biomass_receipt.quantityTon` | J42 | 2026-07-01, sawdust / PT Syahroni | `365,620` | 365.62 | NOOP |
| 6 | `biomass_receipt.quantityTon` | K42 | 2026-07-01, sawdust / PT Bintang | `251,080` | 251.08 | NOOP |
| 7 | `biomass_receipt.quantityTon` | L42 | 2026-07-01, woodchip / PT Syahroni | `1.904,660` | 1904.66 | NOOP |
| 8 | `biomass_receipt.quantityTon` | M42 | 2026-07-01, woodchip / PT RAP | `592,580` | 592.58 | UPDATE |
| 9 | `biomass_receipt.quantityTon` | N42 | 2026-07-01, woodchip / CV Multi Paketindo | `0,000` | 0 | NOOP |
| 10 | `biomass_receipt.quantityTon` | P42 | 2026-07-01, LRUK | `6,000` | 6 | NOOP |
| 11 | `biomass_receipt.quantityTon` | Q42 | 2026-07-01, SRF | `173,800` | 173.8 | UPDATE |
| 12 | `biomass_target.targetTon` | CO56 | target year 2026 | `  70.020 ` | 70020 | UPDATE |
| 13 | `coal_consumption.quantityTon` | S41 | 2026-07-31, unit 1 | `512,706` | 512.706 | UPDATE |
| 14 | `coal_consumption.quantityTon` | V41 | 2026-07-31, unit 2 | `584,527` | 584.527 | UPDATE |
| 15 | `coal_consumption.quantityTon` | Y41 | 2026-07-31, unit 3 | `372,546` | 372.546 | UPDATE |
| 16 | `coal_receipt.quantityTon` | Y60 | July 2026 period | `35.085,221` | 35085.221 | UPDATE |
| 17 | `coal_stock.closingStock` and `coal_stock.consumed` | AD41 | 2026-07-31, plant | `19.450,473` | 19450.473 closing stock | UPDATE |
| 18 | `hop_reading.hopDays` | AL41 | 2026-07-31, unit 1 | `32,4` | 32.4 | UPDATE |
| 19 | `hop_reading.hopDays` | AK41 | 2026-07-31, unit 2 | `16,2` | 16.2 | UPDATE |
| 20 | `hop_reading.hopDays` | AJ41 | 2026-07-31, unit 3 | `10,81` | 10.81 | UPDATE |
| 21 | `solar_consumption.quantityLiter` | CJ41 | 2026-07-31 | `1.025,000` | 1025 | UPDATE |
| 22 | `solar_receipt.quantityLiter` | Y69 | July 2026 period | `30.000` | 30000 | UPDATE |

The immutable canonical plan ID/hash was:

```text
planId: d6f4659cb1fab3af7cdd81e8f95d7caac054a6eb16e9b32ed7a38ab6afe2acbe
planHash: d6f4659cb1fab3af7cdd81e8f95d7caac054a6eb16e9b32ed7a38ab6afe2acbe
mapping: BB_CANONICAL_V1
source: Juli26-BB / 1692973815 / A1:ZZ500
scope: Juli26-BB_FINAL_DAY_AND_AGGREGATES_V1
operations: INSERT 0, UPDATE 15, SKIP 7, BLOCK 0
```

## 4. Production execution evidence

The existing `/api/sync/google-sheets` POST boundary was invoked with the exact plan ID, worksheet, and explicit canary flag. The route was served by the local application process configured against the Production database pooler; no deployed Vercel environment variable or configuration was changed.

The business transaction produced:

- Sync run 19: `FAILED` at the overall sync boundary after processing 22 rows (`updated=15`, `skipped=7`, `failed=1`).
- Spreadsheet import run 15: `SUCCESS`, 15 validated rows imported, 0 rejected.
- Staging rows: 15, all attributable to the approved Juli source cells.
- Business changes: 15 updates, 0 inserts, 0 deletes, 15 canonical upsert calls.
- Business table counts: no unplanned row additions; duplicate business records remained 0.

The target row was updated from the existing April/import 12 attribution to `Google Sheets Juli26-BB`, import run 15, while retaining the same 2026 target identity and value. No direct business-table shortcut was used.

## 5. Ledger and reconciliation evidence

Production ledger run 1 and batch 1 were created before the write. They contain the exact plan identity, source identity, mapping version, scope, and 15 writable items. Their final state is:

```text
canonical_import_run:     RECONCILIATION_REQUIRED
canonical_import_batch:   RECONCILIATION_REQUIRED
attemptCount:             1
failureCode:              RECOVERY_REQUIRED
committedItemCount:       0 (ledger outcome was treated as unknown)
```

The initial post-write target comparison reported only scale differences caused by legacy Production storage precision: coal consumption values are stored at two decimals, and coal stock/consumed values are stored at two decimals. It reported no provenance mismatch and no duplicate business key.

The comparator now normalizes those entities to their existing storage scale. A read-only recheck of the original immutable plan reports `RECONCILED`, with zero value mismatches, zero provenance mismatches, zero blockers, and zero duplicates. That read-only result does not itself mutate the ledger or row-state metadata, so the durable Production state remains pending recovery.

## 6. Idempotency and recovery

The same-plan idempotency execution was not attempted because the first overall canary did not reach a verified reconciliation state. No second independent canary was created.

The existing fixture recovery checks remain passing in Phase 4 and Phase 5. No Production failure was injected and no data was intentionally corrupted. The Phase 6 recovery helper is closed over the original 22-record plan and is state-only: it can reconcile the existing ledger evidence and repair only the 22 Juli row-state/registry metadata records. It was not executed because that is a new Production mutation requiring explicit operator approval after the partial/unknown ledger outcome.

## 7. Safety verification

- Google Sheets writes: 0.
- Agustus business, registry, and source writes: 0; registry remains `SCHEMA_REVIEW - BLOCKED`.
- Schema changes: 0.
- Migration changes: 0.
- Unplanned Production business writes: 0.
- No full synchronization or scheduler execution occurred.

## 8. Files

- `scripts/audit-juli-canary-read-only.ts` captures the live read-only scope and safety audit.
- `scripts/recover-phase6-juli-canary.ts` contains the gated, exact-scope state-only recovery; it is not an authorization to execute it.
- `scripts/verify-phase6-juli-canary.ts` contains the deterministic Phase 6 contract and scope regressions.

## 9. Phase 6R authorization gate - 2026-09-17

The Phase 6R brief was received with status `BLOCKED - EXECUTION AUTHORIZATION REQUIRED`. It defines the allowed state-only recovery but does not contain an explicit operator approval to perform that Production mutation. Accordingly, no recovery command was executed.

The final read-only snapshot still shows the existing immutable run 1 and batch 1 for plan `d6f4659cb1fab3af7cdd81e8f95d7caac054a6eb16e9b32ed7a38ab6afe2acbe`, source `Juli26-BB / 1692973815 / A1:ZZ500`, scope 22, planned `UPDATE 15 / SKIP 7 / INSERT 0 / BLOCK 0`, run and batch `RECONCILIATION_REQUIRED`, and `RECOVERY_REQUIRED`. Juli registry metadata is `ERROR`; Agustus remains `SCHEMA_REVIEW`; counts remain one canonical run, one canonical batch, spreadsheet import run 15, and no additional execution records.

The state-only recovery remains gated until the operator explicitly authorizes it. The original Phase 6 business commit is not rerun.
