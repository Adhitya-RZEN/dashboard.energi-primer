# Phase 1 — Source and Mapping Contract

Design date: 2026-09-15
Design status: **PASS_WITH_REVIEW — Phase 1 contract approved for controlled Phase 2 implementation**
Current automation readiness: **2/4**

This document defines how a Google Sheets source becomes an approved mapping. The Phase 1 design was read-only; Phase 2 adds contract modules without changing the current reader, registry data, schema, database, Google Sheets, environment, API, cron, or production state. The `/docx` directory requested by the brief does not exist; the active project directory `energiprimer-next/docs` is used.

## Phase 2 implementation status

### CURRENT IMPLEMENTATION

Discovery and the existing dynamic/legacy readers remain in place. Registry health and mapping approval are still separate concepts; the current production write path is not switched to the new contract.

### PHASE 2 IMPLEMENTATION

`canonical/source-manifest.ts` projects immutable workbook/sheet IDs and mutable title snapshots. `canonical/mapping-contract.ts` provides `BB_CANONICAL_V1@1`, explicit semantic field definitions, approval checks, and proposal objects that are never writable. Legacy physical mappings remain comparison-only.

### FUTURE WORK

Persist or project mapping ownership/version metadata through a reviewed registry extension and approve any additional physical or policy fallbacks per source profile. Production automation remains at **2/4** readiness.

## 1. Source evidence

| Evidence | Current fact |
| --- | --- |
| `src/lib/google-sheets.ts:94-135,331-569` | Spreadsheet ID/credentials are configured server-side; metadata and values are read through separate read-only API calls |
| `src/services/google-sheets/sync/discovery.ts:59-65,129-229,280-404` | Source key is derived from spreadsheet identity; worksheet key is the Google sheet ID; registry title/status/hash fields already exist |
| `src/services/google-sheets/dynamic/reader.ts:15,31-118` | Dynamic sync reads exact worksheets with `A1:ZZ500`; dashboard/legacy reader supports controlled fallback |
| `src/services/google-sheets/dynamic/types.ts:40-111,218-240` | Parser exposes cells, anchors, regions, header paths, worksheet metadata, and parser diagnostics |
| `src/services/google-sheets/sync/schema-detection.ts:13-162` | Current schema snapshot is semantic and structural, version 1, with value-type drift optionally ignored |
| `src/services/google-sheets/sync/bb-policy.ts:12-43,88-165,204-313` | `Juli26-BB` is the canonical policy reference; future automatic admission is period/schema gated |
| `src/services/google-sheets/import/plan.ts:210-232,326-522` | Semantic records and reviewed legacy physical fallbacks are both converted into the current import plan |
| `src/services/google-sheets/legacy-mapping/profiles.ts:8-119` | Canonical, legacy A/B/C, and unknown mapping profiles currently coexist |
| `docs/GOOGLE_SHEETS_SOURCE_MAP.md` | Phase 0 verified ranges, semantic signals, physical offsets, and parser variants |

## 2. Current source identity

The current registry already separates immutable identity from mutable display metadata:

| Concept | Current field | Intended meaning |
| --- | --- | --- |
| Spreadsheet identity | `SyncSource.externalId` | Google spreadsheet ID; source key is derived from it |
| Source identity | `SyncSource.sourceKey` | Stable application key for the external workbook |
| Provider | `SyncSource.provider` | `google_sheets` |
| Worksheet identity | `SyncWorksheet.worksheetKey` | Google `sheetId`; immutable within the workbook |
| Display title | `SyncWorksheet.worksheetTitle` | Mutable Google worksheet title snapshot |
| Normalized title | `SyncWorksheet.normalizedTitle` | Matching/search representation |
| Period | Derived from title by current resolver | Not currently a dedicated registry field |
| Schema identity | `schemaHash`, `schemaSnapshot` | Current semantic layout snapshot |
| Content identity | `contentHash` | Current plan-row content fingerprint |

Evidence: `prisma/production/schema.prisma:254-295`; `src/services/google-sheets/sync/discovery.ts:59-65,118-229`.

## 3. Source manifest contract

### 3.1 Target shape

The source manifest is a design object, not a Prisma migration in this phase:

```text
SourceManifest
  sourceKey: stable application source key
  sourceType: GOOGLE_SHEETS
  provider: google_sheets
  spreadsheetId: immutable external workbook ID
  worksheet
    sheetId: immutable worksheet ID
    title: current display title
    titleSnapshot: title used for this observation
    normalizedTitle: matching form
    effectivePeriod: { year, month } | null
  mapping
    profile: profile identifier
    version: versioned mapping contract
    schemaVersion: structural snapshot version/hash
    parserVersion: parser implementation identifier
    approvalState: DISCOVERED | PROPOSED | APPROVED | REVIEW | BLOCKED
  ownership
    authority: GOOGLE_SHEETS | DATABASE | MANUAL | MIXED | UNKNOWN
    ownerRef: safe owner/policy reference | null
    precedence: explicit ordered source policy | null
  sourceRange: bounded range used for this observation
  status: DISCOVERED | VALIDATED | ACTIVE | SCHEMA_REVIEW | MISSING | DISABLED | ERROR
  observedAt: timestamp
```

`sheetId` and `spreadsheetId` are immutable source identity. `title`, `normalizedTitle`, period derivation, row count, hashes, and status are mutable observations. A title change must update display metadata and require period/mapping revalidation; it must not create a second logical worksheet identity.

### 3.2 Existing structure decision

**Decision: EXTEND.** Keep `SyncSource` and `SyncWorksheet` as the registry/persistence foundation; do not replace them.

| Existing capability | Decision | Gap to extend conceptually |
| --- | --- | --- |
| `SyncSource.externalId` and `sourceKey` | KEEP | Explicitly expose the external ID as `spreadsheetId` in the manifest projection |
| `SyncSource.provider/status` | KEEP | Add/derive `sourceType` and ownership policy |
| Lease fields | KEEP | Keep operational locking separate from mapping approval |
| `SyncWorksheet.worksheetKey` | KEEP | Document/validate it as immutable Google `sheetId` |
| `worksheetTitle`/`normalizedTitle` | KEEP | Treat as observed title metadata, never primary identity |
| `schemaHash`/`schemaSnapshot` | EXTEND | Bind to explicit `schemaVersion` and approved mapping profile/version |
| `contentHash`/`rowCount` | KEEP | Treat as observation/checksum evidence, not schema approval |
| `status` | EXTEND | Separate registry health from import lifecycle and mapping approval |
| `effectivePeriod` | EXTEND/DERIVE | Store or project an explicit period after title resolution; do not infer it at commit time |
| `ownership`/`mappingVersion`/`parserVersion` | EXTEND | Required for an approved writable manifest; no current dedicated fields |

### 3.3 Problem statement

The current registry can identify a workbook and worksheet, but it cannot by itself prove which mapping version, ownership policy, or effective period authorized a writable field. Keeping the registry unchanged would leave approval semantics implicit; replacing it would discard existing operational state.

Why not `REPLACE`: the current registry is already used by discovery, lease, canonical admission, row state, monitoring, and post-write verification. Replacing it would expand scope and discard useful operational history. Why not `KEEP` unchanged: it cannot record all required mapping/ownership/version semantics.

## 4. Mapping contract vocabulary

| Term | Contract meaning | Current evidence/status |
| --- | --- | --- |
| `MappingProfile` | Named set of entity-field source rules, such as `BB_CANONICAL_V1` | Current profile family exists in `legacy-mapping/profiles.ts:80-119`; exact version binding is incomplete |
| `MappingVersion` | Immutable version of a profile used to produce a plan | Not a current dedicated field; target requirement |
| `SourceLayout` | Approved worksheet layout family: canonical/legacy/review/unknown | Current `BbSchemaFamily` and policy approximate this |
| `SemanticPath` | Structural source path using resource/unit/total/stock/HOP/date qualifiers and normalized labels | Current `HeaderPath` provides most primitives (`dynamic/types.ts:101-111`) |
| `PhysicalReference` | Reviewed coordinate/range fallback for a named layout only | Current approved legacy fallbacks include `I42`, `CC42`, and cumulative extraction (`plan.ts:210-232`) |
| `ExpectedType` | `decimal`, `date`, `integer`, `text`, `empty-allowed`, etc. | Current parser uses numeric/date statuses; target makes them contract fields |
| `Unit` | Canonical unit such as `ton`, `liter`, or `day` | Current record field names and `valueUnit` provide partial representation |
| `Required` | Whether absence/malformed value blocks the field/entity | Current plan gates by entity; target makes it per field |
| `ConfidencePolicy` | Acceptable evidence and score thresholds | Current resolver uses score/confidence and blocks below `0.7` (`value-resolver.ts:145-239`) |
| `FallbackPolicy` | Whether a physical fallback or policy fallback is allowed | Current legacy fallback is profile-limited; target requires explicit approval |
| `ApprovalState` | Discovery/proposal versus authorized writable mapping | Current schema/registry statuses do not fully represent this distinction |

### 4.1 Target mapping rule

```text
source observation
  → discovery/analyzer proposal
  → mapping/profile/schema/ownership approval
  → canonical source field mapping
  → canonical domain record
```

Discovery may say “a possible `solar_consumption.quantityLiter` field was found.” Only an approved, versioned mapping may say “this exact source path is authorized to populate that field.” The commit layer receives the approved result and never rescans or reinterprets the workbook.

## 5. Canonical field mapping catalogue

The following defines the current verified shape without inventing literal header text not captured by the repository. `SemanticPath` uses the actual parser terminology. A physical fallback is valid only inside the named reviewed legacy profile.

| Entity.field | Semantic path / source rule | Physical fallback | Expected type/unit | Required | Identity role | Provenance |
| --- | --- | --- | --- | --- | --- | --- |
| `biomass_consumption.quantityTon` | `resource=biomass → daily → unitNumber=1..3`; date column from approved structure | None for canonical; legacy daily offsets `T/W/Z` only for reviewed dashboard compatibility | decimal / ton | true for a writable observation; explicit `-` may be `VALID_EMPTY` | No; unit/date are identity | Required |
| `coal_consumption.quantityTon` | `resource=coal → daily → unitNumber=1..3`, excluding stock/HOP/handling paths | Reviewed legacy offsets `S/V/Y`; total `AB` is a separate aggregate signal | decimal / ton | true for a writable observation; explicit empty policy applies | No; unit/date are identity | Required; legacy target currently cannot retain it |
| `coal_stock.closingStock` | `resource=coal → stock`, preferably label `STOK AKHIR`/`STOCK AKHIR` | `AD` in reviewed legacy layout | decimal / ton | true | No; stock scope/date are identity | Required; legacy target currently cannot retain it |
| `coal_stock.consumed` | Approved coal daily total associated with the same stock date | `AB` in reviewed legacy layout | decimal / ton | true together with closing stock for a writable stock row | No; stock scope/date are identity | Required; legacy target currently cannot retain it |
| `biomass_receipt.quantityTon` | Approved monthly aggregate table → canonical supplier column; seven supplier identities | No generalized physical fallback | decimal / ton | true for each canonical supplier | No; period/supplier are identity | Required; cell and aggregate row/range |
| `coal_receipt.quantityTon` | `coalReceiptMonthly` semantic aggregate | `I42` only in explicitly approved legacy worksheet profiles | decimal / ton | true | No; period is identity | Required |
| `solar_consumption.quantityLiter` | `resource=solar → daily → total` | `CJ` only for reviewed legacy dashboard layout | decimal / liter | true for a writable observation | No; date is identity | Required |
| `solar_receipt.quantityLiter` | Approved monthly solar receipt aggregate | `CC42` only in explicitly approved legacy worksheet profiles | decimal / liter | true | No; period is identity | Required |
| `hop_reading.hopDays` | `isHop=true → unitNumber=1..3 → daily` | Reviewed legacy mapping Unit 1=`AL`, Unit 2=`AK`, Unit 3=`AJ` | decimal / day | true for a writable observation | No; unit/date are identity | Required |
| `biomass_target.targetTon` | Approved semantic `biomassTarget` for target year | `CO56` only as reviewed legacy target row; otherwise policy fallback is not a source mapping | decimal / ton | true | No; target year is identity | Required for explicit source; policy fallback needs approval evidence |
| `biomass_cumulative.cumulativeTon` | Approved semantic `biomassCumulative` | Reviewed cumulative extraction around `CO59`/`TOTAL YEAR`; no generalized coordinate | decimal / ton | true | No; period is identity | Required |

Evidence: `src/services/google-sheets/dynamic/types.ts:101-111,180-228`; `src/services/google-sheets/import/plan.ts:78-109,210-232,235-289,326-522`; `src/services/google-sheets-overview.ts:45-68`; `src/services/google-sheets/legacy-mapping/profiles.ts:13-37`.

The `CO56`/`CO59` notation is a reviewed legacy range interpretation from the current dashboard contract. It is not authorization to generalize that coordinate to an unapproved worksheet.

## 6. Discovery versus approval

| State | Meaning | Can produce diagnostics? | Can produce a writable plan? |
| --- | --- | ---: | ---: |
| `DISCOVERED` | Source/worksheet observed in metadata | Yes | No |
| `PROPOSED` | Analyzer found a plausible semantic/physical mapping | Yes | No |
| `REVIEW` | Owner must resolve ambiguity/legacy layout | Yes | No |
| `APPROVED` | Profile, version, schema, ownership, and source paths are authorized | Yes | Yes |
| `BLOCKED` | Missing/ambiguous/conflicting schema or ownership | Yes | No |
| `ACTIVE` | Registry health state after an approved mapping has been validated | Yes | Only with approved mapping |

Current `SyncWorksheet.status=ACTIVE` is not, by itself, sufficient approval evidence for a writable mapping. Approval is a mapping contract state; registry health is an operational state.

## 7. Dynamic and legacy mapping authority decision

**Decision: legacy mapper becomes `COMPARISON / AUDIT TOOL` during reconstruction, then may be deprecated.** It must not remain an independent writable policy or a second adapter that can silently emit a different import plan.

Evidence:

- Dynamic production sync calls `readAndParseDynamicWorksheet()`, builds a plan, classifies changes, and commits through `sync/engine.ts:377-621`.
- Legacy mapping has separate family thresholds, field-path logic, date rejection, supplier handling, identity summaries, and import gates (`legacy-mapping/mapper.ts:89-142,326-399,481-749`).
- The Phase 0 audit found that the two paths can represent the same source field differently.

Target coexistence:

```text
Google source
  → one discovery/analyzer layer
  → candidate mapping proposal
  → approval/policy
  → one canonical mapping contract
  → one canonical domain transform
  → import plan

Legacy mapper ──> comparison/audit report only
                 (no independent writable plan)
```

The legacy profiles remain valuable evidence for reviewed historical layouts and fixture generation. `LEGACY_FAMILY_B`, `LEGACY_FAMILY_C`, and `UNKNOWN_FAMILY` remain blocked until an owner approves their semantics (`profiles.ts:97-119`).

## 8. Confidence, fallback, and fail-closed policy

1. Exact approved semantic path: eligible for write if type, period, identity, and provenance checks pass.
2. Approved physical reference inside a named legacy profile: eligible only after that profile is explicitly approved and its fixture set passes.
3. Heuristic candidate with no approved path: proposal/review only, regardless of score.
4. Close competing candidates, duplicate semantic paths, missing required field, wrong period, malformed value, or source ownership conflict: BLOCK.
5. Policy fallback `70,020`: represented as `POLICY_FALLBACK`, never as `GOOGLE_SHEETS` observation, and requires explicit approval.
6. Source layout outside `A1:ZZ500`, formula/merged/hidden semantics not captured by the client, or unverified title variant: NOT VERIFIED, not a silent fallback.

This preserves the current fail-closed canonical policy while removing the dangerous interpretation that a high heuristic score alone authorizes a write.

## 9. Decision and rationale

`SyncSource`/`SyncWorksheet` are sufficient as the registry foundation but should be extended through a source-manifest projection and explicit mapping/version/ownership state. The dynamic analyzer remains the discovery engine. One approved mapping contract becomes the only writable authority. The legacy mapper becomes a comparison/audit tool because making it a second adapter would preserve two policy implementations and continue the original ambiguity.

## 10. Current state versus target state

### Current state

- Source identity is mostly present in registry fields.
- Semantic parser and legacy coordinate fallbacks both exist.
- Schema snapshot is structural but not a complete mapping approval record.
- Confidence gate blocks ambiguity but cannot prove every accepted candidate is the intended one.
- Mapping/profile/version/ownership are not consistently persisted with every plan row.

### Target state

- Manifest contains immutable source identity and mutable observation metadata.
- Every writable field points to one approved mapping version.
- Legacy mapping only compares/proposes; it cannot commit.
- Commit consumes an immutable canonical plan and cannot discover business meaning.
- A source title change, layout change, or ownership conflict blocks until reapproved.

### Future work after Phase 2

Phase 2 adds the in-memory/source-independent manifest and mapping contract under `src/services/google-sheets/canonical/`. Future work may add a reviewed registry projection for ownership/version approval; no migration is authorized by Phase 2.

## 11. Not verified

- Complete Google source ownership across multiple workbooks is not present in current runtime metadata.
- Formula text, merged-cell semantics, hidden rows/columns, worksheet visibility, and source-level display formats are not captured by the current client (`src/lib/google-sheets.ts:331-569`).
- Literal header spellings for every future worksheet cannot be established from repository code alone.
- Agustus production write eligibility is **NOT VERIFIED — PRODUCTION WRITE NOT AUTHORIZED**.
- Phase 2 mapping/layout and approval fixtures pass in `scripts/verify-phase2-canonical-contract.ts`; production source admission remains separately gated.

## 12. Future work after Phase 2

Remaining scope: reviewed registry persistence for mapping approval/ownership/version fields and additional profile-specific mapping evidence. The Phase 2 module is `src/services/google-sheets/canonical/mapping-contract.ts`; a database migration remains a separate decision.

## 13. Acceptance criteria for the design

- [ ] Source manifest fields distinguish immutable IDs from mutable titles/status/period observations.
- [ ] Existing `SyncSource`/`SyncWorksheet` decision is explicitly `EXTEND`, with evidence and no replacement.
- [ ] Every canonical field has semantic path, reviewed fallback or explicit `None`, expected type, unit, requiredness, validation, identity role, provenance requirement, and mapping version.
- [ ] Discovery/proposal is distinct from approval/writable authority.
- [ ] Legacy mapper has one declared role and cannot remain a second writable policy.
- [ ] Confidence and fallback rules fail closed on ambiguity and unverified source semantics.

## 14. Open questions

1. Should mapping approval live on `SyncWorksheet`, a separate manifest table, or an immutable plan artifact with a registry projection?
2. What human/role is authorized to approve a legacy profile or policy fallback?
3. Is `A1:ZZ500` a permanent source contract or only the current bounded read limit?
4. Should the source manifest store a safe project identifier in addition to spreadsheet ID without exposing secrets?
