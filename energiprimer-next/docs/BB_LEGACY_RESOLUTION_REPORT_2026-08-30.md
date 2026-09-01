# BB Legacy Resolution Report

Tanggal: 30 Agustus 2026  
Project: Dashboard Batu Bara PLN Jeranjang  
Status: **BB LEGACY RESOLUTION -- PASS WITH REVIEW**

## Executive Summary

Phase 11E membaca canonical **Juli26-BB** dan seluruh worksheet BB legacy yang memenuhi strict pattern. Non-BB worksheet tidak dibaca untuk mapping database pada fase ini. Juli26-BB dipakai sebagai canonical schema/reference; nilai numerik tidak disalin ke periode lain.

Baseline observed: metadata **199**, target BB **21**, legacy target **20**, read failures **0**, database snapshot stable **YES**. Database writes: **0**.

Canonical importability: **IMPORT_READY**. Legacy-only import result: IMPORT_READY **0**, IMPORT_AFTER_MAPPING **0**, NEEDS_MANUAL_REVIEW **20**, DO_NOT_IMPORT **0**. No import was performed.

## Business Rule

Only worksheet names matching **[Bulan][2 digit year]-BB** are BB database sources. Valid month names are Januari through Desember, year is exactly two digits, and suffix is exactly **-BB**. All other worksheets are **NON_DATABASE_SOURCE** and are outside this phase.

## Canonical Reference

| Worksheet | Juli26-BB |
| Sheet ID | 1171222689 |
| Range requested | A1:ZZ500 |
| Detected range | A4:DJ148 |
| Metadata dimensions | 593 rows x 115 columns |
| Observed dimensions | 148 rows x 114 columns |
| Header rows | 5, 8, 9, 10 |
| Data rows | 31 |
| Date column | B / column 2 |
| Date range | 2026-07-01 -> 2026-07-31 (31 dates) |
| Blocks | dashboard 51:79/J:AG; daily 4:67/BO:CO; daily 8:47/A:O; daily 8:48/R:AN; daily 12:47/A:N; target 23:67/CD:CW; target 42:67/CN:CZ; dashboard 53:72/U:AA; target 15:67/BY:CW; dashboard 51:79/I:AA |
| Unit blocks | Unit 1, Unit 2, Unit 3 |
| Supplier headers | STOK AWAL > BIOMASSA SAWDUST > TON, STOK AWAL > BIOMASSA WOODCHIP > TON, STOK AWAL > BIOMASSA LRUK > TON, STOK AWAL > BIOMASSA SRF > TON, STOK AWAL > BIOMASSA BONGGOL > TON, PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI, PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG, PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI, PENERIMAAN > BIOMASSA > WOODCHIP PT RAP, PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO, PENERIMAAN > BIOMASSA > WOODCHIP, PENERIMAAN > BIOMASSA > LRUK, PENERIMAAN > BIOMASSA > SRF, PENERIMAAN > BIOMASSA > BONGGOL JAGUNG, STOK AKHIR > BIOMASSA SAWDUST > TON, STOK AKHIR > BIOMASSA WOODCHIP > TON, STOK AKHIR > BIOMASSA LRUK > TON, STOK AKHIR > BIOMASSA SRF > TON, STOK AKHIR > BIOMASSA BONGGOL > TON, KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK, KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP, KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF, KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL, KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL, KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL, KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL |
| Parser | EXISTING_PARSER_SUFFICIENT |
| Schema hash prefix | 39cf7fab5f60 |
| Plan status | READY_FOR_IMPORT |
| Plan summary | {"dailyRows":31,"receiptRows":7,"coalReceiptRows":1,"coalConsumptionRows":93,"coalStockRows":31,"biomassConsumptionRows":93,"solarConsumptionRows":31,"solarReceiptRows":1,"hopRows":93,"targetRows":1,"cumulativeRows":1,"totalRows":352} |
| Official target | 70020 ton (Y70) |
| Normalization | existing semantic parser; Unit 1-3 ordered-block rule; seven supplier identities |
| Validation | parser diagnostics, daily paths, supplier identity, 70.020 ton target, source-key/content-hash checks |

Approved canonical behavior: Google API read PASS, parser PASS, dry-run PASS, controlled import PASS, 352 rows, rejected 0, duplicate 0, orphan 0, and re-import INSERT 0 / UPDATE 0 / SKIP 352 / FAILED 0. These facts are regression references only.

## Target Worksheet Inventory

| Worksheet | Schema Family | Date Status | Identity | Mapping | Importability | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| Juli26-BB | CANONICAL_FAMILY | PASS | CLEAR | CLEAR | IMPORT_READY | LOW |
| Mei22-BB | LEGACY_FAMILY_B | PASS | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Juni22-BB | LEGACY_FAMILY_B | PASS | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Juli22-BB | LEGACY_FAMILY_B | PASS | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Mei23-BB | LEGACY_FAMILY_C | PASS | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Juni23-BB | LEGACY_FAMILY_C | DUPLICATE_DATE | CONFLICT | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Juli23-BB | LEGACY_FAMILY_C | PASS | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Mei25-BB | LEGACY_FAMILY_A | PASS | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Juni25-BB | LEGACY_FAMILY_A | INVALID_DATE | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Juli25-BB | LEGACY_FAMILY_A | PASS | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Agustus25-BB | LEGACY_FAMILY_A | PASS | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| September25-BB | LEGACY_FAMILY_A | DUPLICATE_DATE | CONFLICT | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Oktober25-BB | LEGACY_FAMILY_A | PASS | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| November25-BB | LEGACY_FAMILY_A | INVALID_DATE | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Desember25-BB | LEGACY_FAMILY_A | PASS | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Januari26-BB | LEGACY_FAMILY_A | PASS | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Februari26-BB | LEGACY_FAMILY_A | INVALID_DATE | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Maret26-BB | LEGACY_FAMILY_A | PASS | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| April26-BB | LEGACY_FAMILY_A | INVALID_DATE | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Mei26-BB | LEGACY_FAMILY_A | PASS | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |
| Juni26-BB | LEGACY_FAMILY_A | INVALID_DATE | CLEAR | NEEDS_REVIEW | NEEDS_MANUAL_REVIEW | HIGH |

Detailed read inventory:

| Worksheet | Month | Year | Metadata dimensions | Observed dimensions | Detected range | Read status |
| --- | --- | ---: | --- | --- | --- | --- |
| Juli26-BB | Juli | 2026 | 593 x 115 | 148 x 114 | A4:DJ148 | READ |
| Mei22-BB | Mei | 2022 | 1005 x 82 | 106 x 82 | A3:CD106 | READ |
| Juni22-BB | Juni | 2022 | 1004 x 82 | 105 x 82 | A3:CD105 | READ |
| Juli22-BB | Juli | 2022 | 1005 x 82 | 106 x 82 | A3:CD106 | READ |
| Mei23-BB | Mei | 2023 | 867 x 100 | 174 x 100 | A3:CV174 | READ |
| Juni23-BB | Juni | 2023 | 767 x 101 | 113 x 101 | A3:CW113 | READ |
| Juli23-BB | Juli | 2023 | 702 x 101 | 184 x 101 | A3:CW184 | READ |
| Mei25-BB | Mei | 2025 | 588 x 115 | 143 x 114 | A4:DJ143 | READ |
| Juni25-BB | Juni | 2025 | 588 x 115 | 143 x 114 | A4:DJ143 | READ |
| Juli25-BB | Juli | 2025 | 588 x 115 | 143 x 114 | A1:DJ143 | READ |
| Agustus25-BB | Agustus | 2025 | 588 x 115 | 143 x 114 | A4:DJ143 | READ |
| September25-BB | September | 2025 | 588 x 115 | 143 x 114 | A4:DJ143 | READ |
| Oktober25-BB | Oktober | 2025 | 588 x 115 | 143 x 114 | A4:DJ143 | READ |
| November25-BB | November | 2025 | 588 x 115 | 143 x 114 | A4:DJ143 | READ |
| Desember25-BB | Desember | 2025 | 588 x 115 | 143 x 114 | A4:DJ143 | READ |
| Januari26-BB | Januari | 2026 | 592 x 115 | 147 x 114 | A4:DJ147 | READ |
| Februari26-BB | Februari | 2026 | 592 x 115 | 147 x 114 | A1:DJ147 | READ |
| Maret26-BB | Maret | 2026 | 592 x 115 | 147 x 114 | A4:DJ147 | READ |
| April26-BB | April | 2026 | 592 x 115 | 147 x 114 | A4:DJ147 | READ |
| Mei26-BB | Mei | 2026 | 592 x 115 | 147 x 114 | A4:DJ147 | READ |
| Juni26-BB | Juni | 2026 | 592 x 115 | 147 x 114 | A1:DJ147 | READ |

## Schema Families

Family assignment uses semantic resource/unit/total/stock/HOP/date profiles, table kinds, header tokens, and parser shape. It is not based on year alone.

| Family | Worksheet Count | Members | Difference from Juli26-BB | Mapping Required | Parser Change |
| --- | ---: | --- | --- | --- | --- |
| CANONICAL_FAMILY | 1 | Juli26-BB | Schema fingerprint and semantic profile equal Juli26-BB. | NO | EXISTING_PARSER_SUFFICIENT |
| LEGACY_FAMILY_A | 14 | Agustus25-BB, April26-BB, Desember25-BB, Februari26-BB, Januari26-BB, Juli25-BB, Juni25-BB, Juni26-BB, Maret26-BB, Mei25-BB, Mei26-BB, November25-BB, Oktober25-BB, September25-BB | Semantic columns are mostly present but their physical order differs. Header label overlap is 97%; aliases/renames require explicit mapping. Detected semantic table block kinds differ from the canonical order. At least one equivalent semantic column has a different observed value type. | YES | PARSER_EXTENSION_REQUIRED |
| LEGACY_FAMILY_B | 3 | Juli22-BB, Juni22-BB, Mei22-BB | Detected semantic table block kinds differ from the canonical order. At least one equivalent semantic column has a different observed value type. Only 25% semantic overlap with Juli26-BB. Resource/domain evidence is materially different; business meaning cannot be inferred safely. | YES | PARSER_EXTENSION_REQUIRED |
| LEGACY_FAMILY_C | 3 | Juli23-BB, Juni23-BB, Mei23-BB | Detected semantic table block kinds differ from the canonical order. At least one equivalent semantic column has a different observed value type. Only 51% semantic overlap with Juli26-BB. Resource/domain evidence is materially different; business meaning cannot be inferred safely. | YES | PARSER_EXTENSION_REQUIRED |

## Field Mapping

The following are proposed mappings for resolution. They are not implemented and are not import instructions.

### CANONICAL_FAMILY

Members: Juli26-BB

| Source Header | Canonical Field | Database Field | Transformation | Confidence |
| --- | --- | --- | --- | --- |
| NO > TGL | readingDate / periodStart | date / period_start | parse day/date using worksheet period; reject or review period mismatch | HIGH |
| TANGGAL > TGL | readingDate / periodStart | date / period_start | parse day/date using worksheet period; reject or review period mismatch | HIGH |
| STOK AWAL > BATUBARA > TON | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | HIGH |
| STOK AWAL > BIOMASSA SAWDUST > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AWAL > BIOMASSA WOODCHIP > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AWAL > BIOMASSA LRUK > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AWAL > BIOMASSA SRF > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AWAL > BIOMASSA BONGGOL > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| PENERIMAAN > BATUBARA > TON | coalReceipt.quantityTon | CoalReceipt.quantity_ton | normalize semantic header; parse numeric value; preserve null; validate unit and period | HIGH |
| PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > WOODCHIP PT RAP | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > WOODCHIP | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > LRUK | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > SRF | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > BONGGOL JAGUNG | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | HIGH |
| UNIT 1 > BATUBARA | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 1 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 1 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 2 > BATUBARA | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 2 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 2 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 3 > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 3 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 3 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| TOTAL (TON) > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| TOTAL (TON) > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| STOK AKHIR > BATUBARA > TON | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | HIGH |
| STOK AKHIR > BIOMASSA SAWDUST > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AKHIR > BIOMASSA WOODCHIP > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AKHIR > BIOMASSA LRUK > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AKHIR > BIOMASSA SRF > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AKHIR > BIOMASSA BONGGOL > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| HOP > 3 UNIT > TON | hopDays unit 3 | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | HIGH |
| HOP > 2 UNIT > TON | hopDays unit 2 | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | HIGH |
| HOP > 1 UNIT > TON | hopDays unit 1 | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | HIGH |
| HOP > BIOMASSA > TON | hopDays | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | HIGH |
| BELT WEIGHER > UNIT 1 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 1 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 1 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 2 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 2 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 2 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 3 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 3 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 3 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 2 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 2 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 2 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 3 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 3 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 3 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > BIOMASSA > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 1 > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 1 > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 1 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > INPUT | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > TOP UP | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > COUNTER MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > COUNTER SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > TOTAL COUNTER | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > TOTAL | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 4.451 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > COAL HANDLING > BIOMASSA > TANGGAL | readingDate / periodStart | date / period_start | parse day/date using worksheet period; reject or review period mismatch | HIGH |
| KWH GREEN > UNIT 1 > BIOMASSA > PROD BRUTO | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 1 > BIOMASSA > MWH | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 1 > BIOMASSA > TONASE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 2 > BIOMASSA > PROD BRUTO | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 2 > BIOMASSA > MWH | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 2 > BIOMASSA > TONASE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > PROD BRUTO | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > MWH | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > TONASE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 1 > BIOMASSA > TONAS | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 2 > BIOMASSA > TONAS | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > TONAS | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SAWDUS | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |

### LEGACY_FAMILY_A

Members: Agustus25-BB, April26-BB, Desember25-BB, Februari26-BB, Januari26-BB, Juli25-BB, Juni25-BB, Juni26-BB, Maret26-BB, Mei25-BB, Mei26-BB, November25-BB, Oktober25-BB, September25-BB

| Source Header | Canonical Field | Database Field | Transformation | Confidence |
| --- | --- | --- | --- | --- |
| NO > TGL | readingDate / periodStart | date / period_start | parse day/date using worksheet period; reject or review period mismatch | HIGH |
| TANGGAL > TGL | readingDate / periodStart | date / period_start | parse day/date using worksheet period; reject or review period mismatch | HIGH |
| STOK AWAL > BATUBARA > TON | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| STOK AWAL > BIOMASSA SAWDUST > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AWAL > BIOMASSA WOODCHIP > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AWAL > BIOMASSA LRUK > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AWAL > BIOMASSA SRF > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AWAL > BIOMASSA BONGGOL > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| PENERIMAAN > BATUBARA > TON | coalReceipt.quantityTon | CoalReceipt.quantity_ton | normalize semantic header; parse numeric value; preserve null; validate unit and period | LOW |
| PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| PENERIMAAN > BIOMASSA > WOODCHIP PT RAP | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| PENERIMAAN > BIOMASSA > WOODCHIP | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| PENERIMAAN > BIOMASSA > LRUK | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| PENERIMAAN > BIOMASSA > SRF | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| PENERIMAAN > BIOMASSA > BONGGOL JAGUNG | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| UNIT 1 > BATUBARA | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 1 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 1 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 2 > BATUBARA | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 2 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 2 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 3 > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 3 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 3 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| TOTAL (TON) > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| TOTAL (TON) > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| STOK AKHIR > BATUBARA > TON | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| STOK AKHIR > BIOMASSA SAWDUST > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AKHIR > BIOMASSA WOODCHIP > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AKHIR > BIOMASSA LRUK > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AKHIR > BIOMASSA SRF > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AKHIR > BIOMASSA BONGGOL > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| HOP > 3 UNIT > TON | hopDays unit 3 | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| HOP > 2 UNIT > TON | hopDays unit 2 | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| HOP > 1 UNIT > TON | hopDays unit 1 | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| HOP > BIOMASSA > TON | hopDays | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| BELT WEIGHER > UNIT 1 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 1 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 1 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 2 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 2 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 2 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 3 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 3 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 3 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 2 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 2 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 2 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 3 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 3 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 3 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > BIOMASSA > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 1 > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 1 > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 1 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > INPUT | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > TOP UP | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > COUNTER MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > COUNTER SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > TOTAL COUNTER | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > TOTAL | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 8.958 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > COAL HANDLING > BIOMASSA > TANGGAL | readingDate / periodStart | date / period_start | parse day/date using worksheet period; reject or review period mismatch | HIGH |
| KWH GREEN > UNIT 1 > BIOMASSA > PROD BRUTO | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 1 > BIOMASSA > MWH | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 1 > BIOMASSA > TONASE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 2 > BIOMASSA > PROD BRUTO | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 2 > BIOMASSA > MWH | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 2 > BIOMASSA > TONASE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > PROD BRUTO | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > MWH | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > TONASE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 1 > BIOMASSA > TONAS | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 2 > BIOMASSA > TONAS | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > TONAS | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SAWDUS | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| HSD > COAL HANDLING > BIOMASSA > 7.753 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 5.401 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 4.678 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 6.651 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 8.074 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 9.058 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 6.299 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 6.225 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 8.547 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 5.631 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 8.533 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 7.307 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > BIOMASSA > 5.942 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |

### LEGACY_FAMILY_B

Members: Juli22-BB, Juni22-BB, Mei22-BB

| Source Header | Canonical Field | Database Field | Transformation | Confidence |
| --- | --- | --- | --- | --- |
| NO | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| TANGGAL | readingDate / periodStart | date / period_start | parse day/date using worksheet period; reject or review period mismatch | HIGH |
| STOK AWAL > BATUBARA > TON | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| STOK AWAL > BIOMASSA > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| PENERIMAAN > BATUBARA > TON | coalReceipt.quantityTon | CoalReceipt.quantity_ton | normalize semantic header; parse numeric value; preserve null; validate unit and period | LOW |
| PENERIMAAN > BIOMASSA > TON | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| UNIT 1 > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 1 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 1 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 2 > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 2 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 3 > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 3 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 3 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| TOTAL (TON) > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| TOTAL (TON) > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| STOK AKHIR > BATUBARA > TON | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| STOK AKHIR > BIOMASSA > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| HOP > 3 UNIT > TON | hopDays unit 3 | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| HOP > 2 UNIT > TON | hopDays unit 2 | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| HOP > 1 UNIT > TON | hopDays unit 1 | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| BELT WEIGHER > UNIT 1 > 1 UNIT > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 1 > 1 UNIT > PAGI1 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 1 > 1 UNIT > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 2 > 1 UNIT > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 2 > 1 UNIT > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 2 > 1 UNIT > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 3 > 1 UNIT > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 3 > 1 UNIT > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 3 > 1 UNIT > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > 1 UNIT > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > 1 UNIT > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > 1 UNIT > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 2 > 1 UNIT > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 2 > 1 UNIT > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 2 > 1 UNIT > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 3 > 1 UNIT > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 3 > 1 UNIT > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 3 > 1 UNIT > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 1 > 1 UNIT > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 1 > 1 UNIT > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 1 > 1 UNIT > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > 1 UNIT > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > 1 UNIT > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > 1 UNIT > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > 1 UNIT > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > 1 UNIT > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > 1 UNIT > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > 1 UNIT > INPUT | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > 1 UNIT > TOP UP | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > 1 UNIT > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > 1 UNIT > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > 1 UNIT > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > 1 UNIT > TOTAL | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > 1 UNIT > 6.565 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > COAL HANDLING > 1 UNIT > TANGGAL | readingDate / periodStart | date / period_start | parse day/date using worksheet period; reject or review period mismatch | HIGH |
| KWH GREEN > UNIT 1 > 1 UNIT > PROD BRUTO | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 1 > 1 UNIT > MWH | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 1 > 1 UNIT > TONASE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > 1 UNIT > PROD BRUTO | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > 1 UNIT > MWH | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > 1 UNIT > TONASE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 1 > 1 UNIT > TONAS | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > 1 UNIT > TONAS | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > 1 UNIT > STOK | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| KWH GREEN > NK BM > 1 UNIT > STOK | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| KWH GREEN > NK BB > 1 UNIT > STOK | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| KWH GREEN > 1 > 1 UNIT > STOK | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| HSD > COAL HANDLING > 1 UNIT > 7.406 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > 1 UNIT > 8.489 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |

### LEGACY_FAMILY_C

Members: Juli23-BB, Juni23-BB, Mei23-BB

| Source Header | Canonical Field | Database Field | Transformation | Confidence |
| --- | --- | --- | --- | --- |
| NO > TGL | readingDate / periodStart | date / period_start | parse day/date using worksheet period; reject or review period mismatch | HIGH |
| TANGGAL > TGL | readingDate / periodStart | date / period_start | parse day/date using worksheet period; reject or review period mismatch | HIGH |
| STOK AWAL > BATUBARA > TON | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| STOK AWAL > BIOMASSA SAWDUST > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AWAL > BIOMASSA WOODCHIP > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AWAL > BIOMASSA SKAM PADI > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| PENERIMAAN > BATUBARA > TON | coalReceipt.quantityTon | CoalReceipt.quantity_ton | normalize semantic header; parse numeric value; preserve null; validate unit and period | LOW |
| PENERIMAAN > BIOMASSA > SAWDUST | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| PENERIMAAN > BIOMASSA > WOODCHIP PT BHIRAWA | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| PENERIMAAN > BIOMASSA > WOODCHIP PT BBM (BRIUK) | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| PENERIMAAN > BIOMASSA > SEKAM PADI | biomassReceipt.quantityTon | BiomassReceipt.quantity_ton | map supplier identity; parse ton value; preserve null; sum only approved supplier columns | LOW |
| UNIT 1 > BATUBARA | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 1 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 1 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 2 > BATUBARA | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 2 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 2 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 3 > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 3 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| UNIT 3 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| TOTAL (TON) > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| TOTAL (TON) > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| STOK AKHIR > BATUBARA > TON | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| STOK AKHIR > BIOMASSA SAWDUST > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AKHIR > BIOMASSA WOODCHIP > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| STOK AKHIR > BIOMASSA SKAM PADI > TON | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| HOP > 3 UNIT > TON | hopDays unit 3 | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| HOP > 2 UNIT > TON | hopDays unit 2 | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| HOP > 1 UNIT > TON | hopDays unit 1 | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| HOP > SKAM PADI > TON | hopDays | HopReading.hop_days | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| BELT WEIGHER > UNIT 1 > SKAM PADI > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 1 > SKAM PADI > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 1 > SKAM PADI > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 2 > SKAM PADI > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 2 > SKAM PADI > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 2 > SKAM PADI > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 3 > SKAM PADI > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 3 > SKAM PADI > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BELT WEIGHER > UNIT 3 > SKAM PADI > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > SKAM PADI > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > SKAM PADI > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > SKAM PADI > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 2 > SKAM PADI > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 2 > SKAM PADI > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 2 > SKAM PADI > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 3 > SKAM PADI > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 3 > SKAM PADI > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 3 > SKAM PADI > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BUCKET > UNIT 1 > SKAM PADI > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 1 > SKAM PADI > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 1 > SKAM PADI > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 1 > SKAM PADI > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > SKAM PADI > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > SKAM PADI > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > SKAM PADI > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 2 > SKAM PADI > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > SKAM PADI > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > SKAM PADI > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > SKAM PADI > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| BIOMASSA > UNIT 3 > SKAM PADI > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > SKAM PADI > INPUT | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > SKAM PADI > TOP UP | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > SKAM PADI > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > SKAM PADI > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > SKAM PADI > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > SKAM PADI > TOTAL | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > SKAM PADI > 6.578 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > COAL HANDLING > SKAM PADI > TANGGAL | readingDate / periodStart | date / period_start | parse day/date using worksheet period; reject or review period mismatch | HIGH |
| KWH GREEN > UNIT 1 > SKAM PADI > PROD BRUTO | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 1 > SKAM PADI > MWH | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 1 > SKAM PADI > TONASE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 2 > SKAM PADI > PROD BRUTO | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 2 > SKAM PADI > MWH | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 2 > SKAM PADI > TONASE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > SKAM PADI > PROD BRUTO | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > SKAM PADI > MWH | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > SKAM PADI > TONASE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 1 > SKAM PADI > TONAS | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 2 > SKAM PADI > TONAS | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > SKAM PADI > TONAS | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| KWH GREEN > UNIT 3 > SKAM PADI > STOK AKHIR SAWDUS | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| KWH GREEN > UNIT 3 > SKAM PADI > STOK AKHIR SKAM PADI | coalStock.closingStock | CoalStock.closing_stock | normalize semantic header; parse numeric value; preserve null; validate unit and period | MEDIUM |
| KWH GREEN > UNIT 3 > SKAM PADI > STOK AKHIR WOODCHIP | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > NK BM > SKAM PADI > STOK AKHIR WOODCHIP | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > NK BB > SKAM PADI > STOK AKHIR WOODCHIP | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| KWH GREEN > 1 > SKAM PADI > STOK AKHIR WOODCHIP | biomassStock.closingStock | NO_DIRECT_DATABASE_TARGET | source field is not represented by the existing Prisma/import model; do not create schema automatically | LOW |
| HSD > COAL HANDLING > SKAM PADI > 8.340 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |
| HSD > COAL HANDLING > SKAM PADI > 9.457 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | do not infer automatically; require semantic review | LOW |

## Date Validation

Date validation distinguishes formatting from semantic period mismatch and impossible calendar dates. Source dates were not changed.

| Worksheet | Expected Period | Detected Range | Format(s) | Duplicate Dates | Validation Evidence |
| --- | --- | --- | --- | --- | --- |
| Juli26-BB | 2026-07 | 2026-07-01 -> 2026-07-31 (31 dates) | DAY_MONTH_LABEL | none | PASS |
| Mei22-BB | 2022-05 | 2022-05-01 -> 2022-05-31 (31 dates) | DAY_MONTH_LABEL | none | PASS |
| Juni22-BB | 2022-06 | 2022-06-01 -> 2022-06-30 (30 dates) | DAY_MONTH_LABEL | none | PASS |
| Juli22-BB | 2022-07 | 2022-07-01 -> 2022-07-31 (31 dates) | DAY_MONTH_LABEL | none | PASS |
| Mei23-BB | 2023-05 | 2023-05-01 -> 2023-05-31 (31 dates) | DAY_MONTH_LABEL | none | PASS |
| Juni23-BB | 2023-06 | 2023-06-01 -> 2023-06-30 (30 dates) | DAY_MONTH_LABEL | 2023-06-01 | Duplicate date(s): 2023-06-01 |
| Juli23-BB | 2023-07 | 2023-07-01 -> 2023-07-31 (31 dates) | DAY_MONTH_LABEL | none | PASS |
| Mei25-BB | 2025-05 | 2025-05-01 -> 2025-05-31 (31 dates) | DAY_MONTH_LABEL | none | PASS |
| Juni25-BB | 2025-06 | 2025-06-01 -> 2025-06-31 (31 dates) | DAY_NUMBER | none | A41=31: INVALID_DATE |
| Juli25-BB | 2025-07 | 2025-07-01 -> 2025-07-31 (31 dates) | DAY_MONTH_LABEL | none | PASS |
| Agustus25-BB | 2025-08 | 2025-08-01 -> 2025-08-31 (31 dates) | DAY_MONTH_LABEL | none | PASS |
| September25-BB | 2025-09 | 2025-09-01 -> 2025-09-30 (30 dates) | DAY_MONTH_LABEL | 2025-09-01 | Duplicate date(s): 2025-09-01 |
| Oktober25-BB | 2025-10 | 2025-10-01 -> 2025-10-31 (31 dates) | DAY_MONTH_LABEL | none | PASS |
| November25-BB | 2025-11 | 2025-11-01 -> 2025-11-31 (31 dates) | DAY_NUMBER | none | A41=31: INVALID_DATE |
| Desember25-BB | 2025-12 | 2025-12-01 -> 2025-12-31 (31 dates) | DAY_MONTH_LABEL | none | PASS |
| Januari26-BB | 2026-01 | 2026-01-01 -> 2026-01-31 (31 dates) | DAY_MONTH_LABEL | none | PASS |
| Februari26-BB | 2026-02 | 2026-02-01 -> 2026-02-31 (31 dates) | DAY_NUMBER | none | A39=29: INVALID_DATE A40=30: INVALID_DATE A41=31: INVALID_DATE |
| Maret26-BB | 2026-03 | 2026-03-01 -> 2026-03-31 (31 dates) | DAY_MONTH_LABEL | none | PASS |
| April26-BB | 2026-04 | 2026-04-01 -> 2026-04-31 (31 dates) | DAY_NUMBER | none | A41=31: INVALID_DATE |
| Mei26-BB | 2026-05 | 2026-05-01 -> 2026-05-31 (31 dates) | DAY_MONTH_LABEL | none | PASS |
| Juni26-BB | 2026-06 | 2026-06-01 -> 2026-06-31 (31 dates) | DAY_NUMBER | none | A41=31: INVALID_DATE |

Focused date review:

- **Juni25-BB:** INVALID_DATE; A41=31: INVALID_DATE
- **November25-BB:** INVALID_DATE; A41=31: INVALID_DATE
- **Februari26-BB:** INVALID_DATE; A39=29: INVALID_DATE A40=30: INVALID_DATE A41=31: INVALID_DATE
- **April26-BB:** INVALID_DATE; A41=31: INVALID_DATE
- **Juni26-BB:** INVALID_DATE; A41=31: INVALID_DATE

Decision rule: a date from another month/year is **DATE_PERIOD_MISMATCH**; an impossible calendar day is **INVALID_DATE**. Neither is shifted, deleted, or assigned to a different worksheet automatically. A semantically valid ISO/day-month representation with a different physical format is **DATE_FORMAT_DIFFERENCE**.

## Identity Strategy

| Family | Status | Existing Source Key | Business Key | Composite Key | Content Hash | Unique Dimensions | Sample Key Prefixes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CANONICAL_FAMILY | CLEAR | SHA-256(entityType + periodStart/readingDate + unit + supplier + valueUnit); row/address excluded | entity + period/date + Unit 1-3 where applicable + supplier where applicable + value unit | SHA-256(source identity + normalized content/value) | entityType, periodStart/readingDate, unitCode, supplierCode, valueUnit | affd24c8f11f, 4ddcfa222200, 0b05dc146b6e, 2ac686f4e2f5, bdf2d8f7fe4a, 37d4c84aed0f, e9cc158d499b, b5370c4e001d |
| LEGACY_FAMILY_A | CLEAR | SHA-256(entityType + periodStart/readingDate + unit + supplier + valueUnit); row/address excluded | entity + period/date + Unit 1-3 where applicable + supplier where applicable + value unit | SHA-256(source identity + normalized content/value) | entityType, periodStart/readingDate, unitCode, supplierCode, valueUnit | c009680127a3, 7b7eef891c10, 678a7daea1bc, 25abc099be16, ed01132556fe, 81980d1ddade, 4976d59705f0, e64b4e04f12c |
| LEGACY_FAMILY_B | CLEAR | SHA-256(entityType + periodStart/readingDate + unit + supplier + valueUnit); row/address excluded | entity + period/date + Unit 1-3 where applicable + supplier where applicable + value unit | SHA-256(source identity + normalized content/value) | entityType, periodStart/readingDate, unitCode, supplierCode, valueUnit | fb24eb9deb5d, 8b78b26b28dc, 77daf3ef6125, 393e50b1ce90, bb49ad3909de, a926657872c3, 0f1a9f98ec21, 31b664fee35c |
| LEGACY_FAMILY_C | CLEAR | SHA-256(entityType + periodStart/readingDate + unit + supplier + valueUnit); row/address excluded | entity + period/date + Unit 1-3 where applicable + supplier where applicable + value unit | SHA-256(source identity + normalized content/value) | entityType, periodStart/readingDate, unitCode, supplierCode, valueUnit | 13a14068b3be, 7159f6940ce3, e26df71ca14d, 0d73f7993a68, 3086e5b01df3, b0ef3433e355, c40253090059, d2b0acdb9cf7 |

Permanent identity excludes Google Sheets row number and cell address. Existing Unit normalization remains Unit 1, Unit 2, Unit 3; the ordered duplicate Unit 2 rule remains a proposed interpretation only.

## Duplicate Analysis

Mandatory focus: **Juni23-BB** and **September25-BB**. Source key, business key, date, unit, supplier, domain, quantity, block, source rows, and content hash evidence are listed below.

| Worksheet | Source Key | Business Key | Entity | Date | Unit | Supplier | Domain | Quantity | Block | Source Rows | Content Hash | Classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Juni23-BB | d59f289f8c62 | coal_consumption \| 2023-06-01 \| UNIT-1 \| supplier-none \| ton | coal_consumption | 2023-06-01 | UNIT-1 | supplier-none | coal_consumption | 627.15, NULL | daily 8:52/A:O | 11, 11 | c49498fd804e, 4d0ecc866897 | BUSINESS_KEY_COLLISION |
| Juni23-BB | de80d675b746 | coal_consumption \| 2023-06-01 \| UNIT-2 \| supplier-none \| ton | coal_consumption | 2023-06-01 | UNIT-2 | supplier-none | coal_consumption | 581.14, NULL | UNRESOLVED_BLOCK | 11, 11 | 4fdd7a99f454, 76cbe86e0614 | BUSINESS_KEY_COLLISION |
| Juni23-BB | 33af27c9ad29 | coal_consumption \| 2023-06-01 \| UNIT-3 \| supplier-none \| ton | coal_consumption | 2023-06-01 | UNIT-3 | supplier-none | coal_consumption | 604.46, NULL | UNRESOLVED_BLOCK | 11, 11 | 3c9ef58cedca, 4d2e08ff418c | BUSINESS_KEY_COLLISION |
| Juni23-BB | 15776f80c260 | coal_stock \| 2023-06-01 \| unit-none \| supplier-none \| ton | coal_stock | 2023-06-01 | unit-none | supplier-none | coal_stock | 70429.979, 55906.725 | UNRESOLVED_BLOCK | 11, 11 | ee33f53d92b6, 3600c968184a | BUSINESS_KEY_COLLISION |
| Juni23-BB | 4a82e7cbaca2 | biomass_consumption \| 2023-06-01 \| UNIT-1 \| supplier-none \| ton | biomass_consumption | 2023-06-01 | UNIT-1 | supplier-none | biomass_consumption | 20, NULL | daily 8:52/A:O | 11, 11 | e3e5ca74667c, caaae684dea2 | BUSINESS_KEY_COLLISION |
| Juni23-BB | 1904319f0d75 | biomass_consumption \| 2023-06-01 \| UNIT-2 \| supplier-none \| ton | biomass_consumption | 2023-06-01 | UNIT-2 | supplier-none | biomass_consumption | NULL, NULL | UNRESOLVED_BLOCK | 11, 11 | f799f66373f0 | TRUE_DUPLICATE |
| Juni23-BB | 764779b71561 | biomass_consumption \| 2023-06-01 \| UNIT-3 \| supplier-none \| ton | biomass_consumption | 2023-06-01 | UNIT-3 | supplier-none | biomass_consumption | NULL, NULL | UNRESOLVED_BLOCK | 11, 11 | ed6e10917d42 | TRUE_DUPLICATE |
| Juni23-BB | 10bd6aba2382 | solar_consumption \| 2023-06-01 \| unit-none \| supplier-none \| liter | solar_consumption | 2023-06-01 | unit-none | supplier-none | solar_consumption | 662, NULL | daily 4:59/BG:CG | 11, 11 | f9f7ca15dace, cb1d85503698 | BUSINESS_KEY_COLLISION |
| Juni23-BB | 28c787530053 | hop_reading \| 2023-06-01 \| UNIT-1 \| supplier-none \| hari | hop_reading | 2023-06-01 | UNIT-1 | supplier-none | hop_reading | 128.1, 101.6 | UNRESOLVED_BLOCK | 11, 11 | b08c23e75ed7, 3e907f3fec9a | BUSINESS_KEY_COLLISION |
| Juni23-BB | 8c5a54de5995 | hop_reading \| 2023-06-01 \| UNIT-2 \| supplier-none \| hari | hop_reading | 2023-06-01 | UNIT-2 | supplier-none | hop_reading | 64, 50.8 | UNRESOLVED_BLOCK | 11, 11 | 7b0d2eb05b2b, 3a5dc222711b | BUSINESS_KEY_COLLISION |
| Juni23-BB | c6cce06de085 | hop_reading \| 2023-06-01 \| UNIT-3 \| supplier-none \| hari | hop_reading | 2023-06-01 | UNIT-3 | supplier-none | hop_reading | 42.7, 33.9 | UNRESOLVED_BLOCK | 11, 11 | 88f7cc5ff4e9, 58863374aac6 | BUSINESS_KEY_COLLISION |
| September25-BB | fbe516f316e7 | coal_consumption \| 2025-09-01 \| UNIT-1 \| supplier-none \| ton | coal_consumption | 2025-09-01 | UNIT-1 | supplier-none | coal_consumption | 458.691, NULL | daily 6:50/R:AN | 11, 11 | 0d399779c635, 3a8af746edd6 | BUSINESS_KEY_COLLISION |
| September25-BB | 26d0e1212aef | coal_consumption \| 2025-09-01 \| UNIT-2 \| supplier-none \| ton | coal_consumption | 2025-09-01 | UNIT-2 | supplier-none | coal_consumption | 575.392, NULL | daily 6:50/R:AN | 11, 11 | 786f178cc9b3, 93e276562946 | BUSINESS_KEY_COLLISION |
| September25-BB | c8f4896b0299 | coal_consumption \| 2025-09-01 \| UNIT-3 \| supplier-none \| ton | coal_consumption | 2025-09-01 | UNIT-3 | supplier-none | coal_consumption | NULL, NULL | daily 6:50/R:AN | 11, 11 | 253fe299068b | TRUE_DUPLICATE |
| September25-BB | 4c78425e2bf7 | coal_stock \| 2025-09-01 \| unit-none \| supplier-none \| ton | coal_stock | 2025-09-01 | unit-none | supplier-none | coal_stock | 37958.006, 53596.06 | daily 6:50/R:AN | 11, 11 | 452ca5a64cb8, db44f9d9feb9 | BUSINESS_KEY_COLLISION |
| September25-BB | 431a884830e0 | biomass_consumption \| 2025-09-01 \| UNIT-1 \| supplier-none \| ton | biomass_consumption | 2025-09-01 | UNIT-1 | supplier-none | biomass_consumption | 66.4, NULL | daily 6:50/R:AN | 11, 11 | 5c01a2a13c12, 168f2e4b6563 | BUSINESS_KEY_COLLISION |
| September25-BB | a2504a4ee73a | biomass_consumption \| 2025-09-01 \| UNIT-2 \| supplier-none \| ton | biomass_consumption | 2025-09-01 | UNIT-2 | supplier-none | biomass_consumption | 61.2, NULL | daily 6:50/R:AN | 11, 11 | f7821612bf37, 980fc0958b7a | BUSINESS_KEY_COLLISION |
| September25-BB | 326707f88a5b | biomass_consumption \| 2025-09-01 \| UNIT-3 \| supplier-none \| ton | biomass_consumption | 2025-09-01 | UNIT-3 | supplier-none | biomass_consumption | NULL, NULL | daily 6:50/R:AN | 11, 11 | fc3d6c275a3d | TRUE_DUPLICATE |
| September25-BB | d58f35c62aaa | solar_consumption \| 2025-09-01 \| unit-none \| supplier-none \| liter | solar_consumption | 2025-09-01 | unit-none | supplier-none | solar_consumption | 693, NULL | daily 4:64/BO:CO | 11, 11 | 0577499974f9, d1217df4cd04 | BUSINESS_KEY_COLLISION |
| September25-BB | c6b2d00b69d8 | hop_reading \| 2025-09-01 \| UNIT-1 \| supplier-none \| hari | hop_reading | 2025-09-01 | UNIT-1 | supplier-none | hop_reading | 69, 97.4 | daily 6:50/R:AN | 11, 11 | dc4692d103f8, 1d436ab8574d | BUSINESS_KEY_COLLISION |
| September25-BB | c3bc047eb66a | hop_reading \| 2025-09-01 \| UNIT-2 \| supplier-none \| hari | hop_reading | 2025-09-01 | UNIT-2 | supplier-none | hop_reading | 34.5, 48.7 | daily 6:50/R:AN | 11, 11 | c3eb24b1e35d, 17cd82c82b74 | BUSINESS_KEY_COLLISION |
| September25-BB | 06bfe303e41d | hop_reading \| 2025-09-01 \| UNIT-3 \| supplier-none \| hari | hop_reading | 2025-09-01 | UNIT-3 | supplier-none | hop_reading | 23, 32.5 | daily 6:50/R:AN | 11, 11 | 9e369e4c445c, b2db59fe1b67 | BUSINESS_KEY_COLLISION |

TRUE_DUPLICATE means same business identity and same normalized content hash. BUSINESS_KEY_COLLISION means same identity with conflicting content. IDENTITY_DESIGN_ERROR, LEGACY_IDENTITY, and UNKNOWN remain manual decisions. No duplicate was deleted, merged, updated, or imported.

## Historical Semantics

| Worksheet | Classification | Evidence | Rule |
| --- | --- | --- | --- |
| Juli26-BB | CURRENT_OPERATIONAL | 31 daily rows; 352 staged rows; target CURRENT_TARGET | Historical values remain historical; no current value substitution. |
| Mei22-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 342 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Juni22-BB | HISTORICAL_OPERATIONAL | 30 daily rows; 331 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Juli22-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 342 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Mei23-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 342 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Juni23-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 342 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Juli23-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 342 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Mei25-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Juni25-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Juli25-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Agustus25-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| September25-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Oktober25-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| November25-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Desember25-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Januari26-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Februari26-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Maret26-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| April26-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Mei26-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |
| Juni26-BB | HISTORICAL_OPERATIONAL | 31 daily rows; 348 staged rows; target UNKNOWN | Historical values remain historical; no current value substitution. |

## Target Biomassa

Official current target: **70.020 ton**. Legacy values are never overwritten.

| Worksheet | Detected Value | Classification | Review | Source |
| --- | ---: | --- | --- | --- |
| Juli26-BB | 70020 | CURRENT_TARGET | PASS | Y70 |
| Mei22-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Juni22-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Juli22-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Mei23-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Juni23-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Juli23-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Mei25-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Juni25-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Juli25-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Agustus25-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| September25-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Oktober25-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| November25-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Desember25-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Januari26-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Februari26-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Maret26-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| April26-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Mei26-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |
| Juni26-BB | UNKNOWN | UNKNOWN | NEEDS_REVIEW | UNKNOWN |

Only an exact 70.020 ton value is classified CURRENT_TARGET. Missing or ambiguous legacy values remain UNKNOWN/NEEDS_REVIEW; historical or calculated values must be explicitly classified by the source owner.

## Unit Mapping

Canonical units are Unit 1, Unit 2, Unit 3.

| Worksheet | Detected Units | Notes | Confidence |
| --- | --- | --- | --- |
| Juli26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Mei22-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Juni22-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Juli22-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Mei23-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Juni23-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Juli23-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Mei25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Juni25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Juli25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Agustus25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| September25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Oktober25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| November25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Desember25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Januari26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Februari26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Maret26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| April26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Mei26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |
| Juni26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged. | HIGH |

## Supplier Mapping

Canonical supplier identities are the seven supplier codes resolved by Juli26-BB. Legacy names are not auto-renamed.

| Worksheet | Detected Supplier Headers | Parser Supplier Rows | Missing Canonical Codes | Notes |
| --- | --- | --- | --- | --- |
| Juli26-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| Mei22-BB | PENERIMAAN > BIOMASSA > TON | UNKNOWN | sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-syahroni, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf | Existing parser resolved no Biomassa supplier receipt rows. Missing canonical code(s): sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-syahroni, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf. Supplier-like headers are present but not safely mapped by the existing parser. |
| Juni22-BB | PENERIMAAN > BIOMASSA > TON | UNKNOWN | sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-syahroni, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf | Existing parser resolved no Biomassa supplier receipt rows. Missing canonical code(s): sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-syahroni, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf. Supplier-like headers are present but not safely mapped by the existing parser. |
| Juli22-BB | PENERIMAAN > BIOMASSA > TON | UNKNOWN | sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-syahroni, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf | Existing parser resolved no Biomassa supplier receipt rows. Missing canonical code(s): sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-syahroni, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf. Supplier-like headers are present but not safely mapped by the existing parser. |
| Mei23-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; PENERIMAAN > BIOMASSA > SAWDUST; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT BHIRAWA; PENERIMAAN > BIOMASSA > SEKAM PADI; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; KWH GREEN > UNIT 3 > SKAM PADI > STOK AKHIR WOODCHIP; KWH GREEN > NK BM > SKAM PADI > STOK AKHIR WOODCHIP; KWH GREEN > NK BB > SKAM PADI > STOK AKHIR WOODCHIP; KWH GREEN > 1 > SKAM PADI > STOK AKHIR WOODCHIP | Woodchip PT Syahroni [woodchip-pt-syahroni] | sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf | Missing canonical code(s): sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf. |
| Juni23-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; PENERIMAAN > BIOMASSA > SAWDUST; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT BHIRAWA; PENERIMAAN > BIOMASSA > WOODCHIP PT BBM (BRIUK); PENERIMAAN > BIOMASSA > SEKAM PADI; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; KWH GREEN > UNIT 3 > SKAM PADI > STOK AKHIR WOODCHIP; KWH GREEN > NK BM > SKAM PADI > STOK AKHIR WOODCHIP; KWH GREEN > NK BB > SKAM PADI > STOK AKHIR WOODCHIP; KWH GREEN > 1 > SKAM PADI > STOK AKHIR WOODCHIP | Woodchip PT Syahroni [woodchip-pt-syahroni] | sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf | Missing canonical code(s): sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf. |
| Juli23-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; PENERIMAAN > BIOMASSA > SAWDUST; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT BHIRAWA; PENERIMAAN > BIOMASSA > WOODCHIP PT BBM (BRIUK); PENERIMAAN > BIOMASSA > SEKAM PADI; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; KWH GREEN > UNIT 3 > SKAM PADI > STOK AKHIR WOODCHIP; KWH GREEN > NK BM > SKAM PADI > STOK AKHIR WOODCHIP; KWH GREEN > NK BB > SKAM PADI > STOK AKHIR WOODCHIP; KWH GREEN > 1 > SKAM PADI > STOK AKHIR WOODCHIP | Woodchip PT Syahroni [woodchip-pt-syahroni] | sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf | Missing canonical code(s): sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf. |
| Mei25-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| Juni25-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| Juli25-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| Agustus25-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| September25-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| Oktober25-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| November25-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| Desember25-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| Januari26-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| Februari26-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| Maret26-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| April26-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| Mei26-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |
| Juni26-BB | STOK AWAL > BIOMASSA SAWDUST > TON; STOK AWAL > BIOMASSA WOODCHIP > TON; STOK AWAL > BIOMASSA LRUK > TON; STOK AWAL > BIOMASSA SRF > TON; STOK AWAL > BIOMASSA BONGGOL > TON; PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI; PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG; PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI; PENERIMAAN > BIOMASSA > WOODCHIP PT RAP; PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO; PENERIMAAN > BIOMASSA > WOODCHIP; PENERIMAAN > BIOMASSA > LRUK; PENERIMAAN > BIOMASSA > SRF; PENERIMAAN > BIOMASSA > BONGGOL JAGUNG; STOK AKHIR > BIOMASSA SAWDUST > TON; STOK AKHIR > BIOMASSA WOODCHIP > TON; STOK AKHIR > BIOMASSA LRUK > TON; STOK AKHIR > BIOMASSA SRF > TON; STOK AKHIR > BIOMASSA BONGGOL > TON; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF; KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL; KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | Sawdust PT Syahroni [sawdust-pt-syahroni]; Sawdust PT Bintang [sawdust-pt-bintang]; Woodchip PT Syahroni [woodchip-pt-syahroni]; Woodchip PT RAP [woodchip-pt-rap]; Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo]; LRUK [lruk]; SRF [srf] | none | No issue detected. |

## Database Mapping

| Domain | Canonical Field | Existing Prisma Model | Existing PostgreSQL Table | Fields | Relationship |
| --- | --- | --- | --- | --- | --- |
| BIOMASS_RECEIPT | biomassReceipt.quantityTon | BiomassReceipt | biomass_receipts | period_start, supplier_code, supplier_name, quantity_ton | one row per supplier and period |
| BIOMASS_CONSUMPTION | biomassConsumption.quantityTon | BiomassConsumption | biomass_consumptions | reading_date, unit_id, quantity_ton | one row per day and Unit 1-3 |
| COAL_RECEIPT | coalReceipt.quantityTon | CoalReceipt | coal_receipts | period_start, quantity_ton | one row per period |
| COAL_CONSUMPTION | coalConsumption.quantityTon | CoalConsumption | coal_consumption | date, unit_id, coal_used | one row per day and Unit 1-3 |
| COAL_STOCK | coalStock.closingStock | CoalStock | coal_stock | date, opening_stock, received, consumed, closing_stock | one row per day |
| BIOMASS_STOCK | biomassStock.closingStock | NONE | NO_EXISTING_TABLE | not represented in current import plan | NEW_SCHEMA_REQUIRED_IF_BIOMASS_STOCK_MUST_BE_PERSISTED |
| SOLAR_RECEIPT | solarReceipt.quantityLiter | SolarReceipt | solar_receipts | period_start, quantity_liter | one row per period |
| SOLAR_CONSUMPTION | solarConsumption.quantityLiter | SolarConsumption | solar_consumptions | reading_date, quantity_liter | one row per day |
| HOP | hopDays | HopReading | hop_readings | reading_date, unit_id, hop_days | one row per day and Unit 1-3 |
| BIOMASS_TARGET | biomassTarget.targetTon | BiomassTarget | biomass_targets | target_year, target_ton | one row per target year |
| BIOMASS_CUMULATIVE | biomassCumulative.cumulativeTon | BiomassCumulativeSnapshot | biomass_cumulative_snapshots | period_start, cumulative_ton | one row per period snapshot |
| UNIT_MASTER | unit.identity | Unit | units | code, name, status | master identity for Unit 1-3 |

No new table was created. **BIOMASS_STOCK** is a documented target gap: the source field is observed, but no existing Prisma model/PostgreSQL table represents it. Persisting that domain is **NEW_SCHEMA_REQUIRED_IF_BIOMASS_STOCK_MUST_BE_PERSISTED** and requires manual approval; it does not block the already approved canonical import plan because the current import plan does not persist biomass stock, but it blocks full-field parity. Unresolved legacy semantics remain unmapped until approved.

## Importability

| Worksheet | Eligibility | Schema Family | Existing Plan Issues |
| --- | --- | --- | --- |
| Juli26-BB | IMPORT_READY | CANONICAL_FAMILY | none |
| Mei22-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_B | biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, biomass_supplier_receipt_empty, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020 |
| Juni22-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_B | biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, biomass_supplier_receipt_empty, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020 |
| Juli22-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_B | biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, biomass_supplier_receipt_empty, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020 |
| Mei23-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_C | biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Juni23-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_C | biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Juli23-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_C | biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Mei25-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Juni25-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Juli25-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Agustus25-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| September25-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Oktober25-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| November25-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Desember25-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Januari26-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Februari26-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Maret26-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| April26-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Mei26-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Juni26-BB | NEEDS_MANUAL_REVIEW | LEGACY_FAMILY_A | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |

Criteria: IMPORT_READY requires clear schema, mapping, identity, valid dates, and valid critical fields. IMPORT_AFTER_MAPPING is reserved for understandable schemas awaiting a mapping profile. NEEDS_MANUAL_REVIEW covers critical ambiguity, identity conflict, date ambiguity, and business semantic ambiguity. No target was classified DO_NOT_IMPORT solely because of a parser failure.

## Parser Strategy

No parser was changed.

| Family | Members | Strategy | Evidence |
| --- | --- | --- | --- |
| CANONICAL_FAMILY | Juli26-BB | EXISTING_PARSER_SUFFICIENT | Schema fingerprint and semantic profile equal Juli26-BB. |
| LEGACY_FAMILY_A | Agustus25-BB, April26-BB, Desember25-BB, Februari26-BB, Januari26-BB, Juli25-BB, Juni25-BB, Juni26-BB, Maret26-BB, Mei25-BB, Mei26-BB, November25-BB, Oktober25-BB, September25-BB | PARSER_EXTENSION_REQUIRED | Semantic columns are mostly present but their physical order differs. Header label overlap is 97%; aliases/renames require explicit mapping. Detected semantic table block kinds differ from the canonical order. At least one equivalent semantic column has a different observed value type. Header label overlap is 99%; aliases/renames require explicit mapping. Header label overlap is 98%; aliases/renames require explicit mapping. |
| LEGACY_FAMILY_B | Juli22-BB, Juni22-BB, Mei22-BB | PARSER_EXTENSION_REQUIRED | Detected semantic table block kinds differ from the canonical order. At least one equivalent semantic column has a different observed value type. Only 25% semantic overlap with Juli26-BB. Resource/domain evidence is materially different; business meaning cannot be inferred safely. Only 24% semantic overlap with Juli26-BB. |
| LEGACY_FAMILY_C | Juli23-BB, Juni23-BB, Mei23-BB | PARSER_EXTENSION_REQUIRED | Detected semantic table block kinds differ from the canonical order. At least one equivalent semantic column has a different observed value type. Only 51% semantic overlap with Juli26-BB. Resource/domain evidence is materially different; business meaning cannot be inferred safely. Only 50% semantic overlap with Juli26-BB. |

Priority remains existing parser -> mapping profile -> parser extension -> new parser only if unavoidable.

## Risk Assessment

| Level | Risk/Evidence | Recommendation |
| --- | --- | --- |
| HIGH | DATE: Juni25-BB, November25-BB, Februari26-BB, April26-BB, Juni26-BB contain invalid or mismatched dates. | Preserve source values and require source-owner decision before import. |
| HIGH | IDENTITY: Juni23-BB, September25-BB contain duplicate identity groups. | Do not delete/merge automatically; resolve source key/business key with owner approval. |
| HIGH | SCHEMA: 20 legacy worksheets need explicit field mapping or parser review. | Approve mapping per schema family and re-run dry-run. |
| HIGH | BIOMASS_STOCK: 21 BB worksheet(s) contain biomass stock fields without an existing database target. | Keep biomass stock out of import until a target model/table and business identity are explicitly approved. |
| MEDIUM | MERGED_CELLS: Merged-cell metadata is not exposed by the existing values-only reader. | Do not infer merged structure from blank cells; obtain explicit spreadsheet metadata before relying on merges. |

## Manual Decisions

| Worksheet | Issue | Evidence | Recommended Decision | Decision Required | Risk |
| --- | --- | --- | --- | --- | --- |
| Agustus25-BB, April26-BB, Desember25-BB, Februari26-BB, Januari26-BB, Juli25-BB, Juni25-BB, Juni26-BB, Maret26-BB, Mei25-BB, Mei26-BB, November25-BB, Oktober25-BB, September25-BB | Schema family/mapping | Semantic columns are mostly present but their physical order differs. Header label overlap is 97%; aliases/renames require explicit mapping. Detected semantic table block kinds differ from the canonical order. At least one equivalent semantic column has a different observed value type. | Preserve distinct family until mapping is approved. | Semantic columns are mostly present but their physical order differs. Header label overlap is 97%; aliases/renames require explicit mapping. Detected semantic table block kinds differ from the canonical order. At least one equivalent semantic column has a different observed value type. | HIGH |
| Juli22-BB, Juni22-BB, Mei22-BB | Schema family/mapping | Detected semantic table block kinds differ from the canonical order. At least one equivalent semantic column has a different observed value type. Only 25% semantic overlap with Juli26-BB. Resource/domain evidence is materially different; business meaning cannot be inferred safely. | Preserve distinct family until mapping is approved. | Detected semantic table block kinds differ from the canonical order. At least one equivalent semantic column has a different observed value type. Only 25% semantic overlap with Juli26-BB. Resource/domain evidence is materially different; business meaning cannot be inferred safely. | HIGH |
| Juli23-BB, Juni23-BB, Mei23-BB | Schema family/mapping | Detected semantic table block kinds differ from the canonical order. At least one equivalent semantic column has a different observed value type. Only 51% semantic overlap with Juli26-BB. Resource/domain evidence is materially different; business meaning cannot be inferred safely. | Preserve distinct family until mapping is approved. | Detected semantic table block kinds differ from the canonical order. At least one equivalent semantic column has a different observed value type. Only 51% semantic overlap with Juli26-BB. Resource/domain evidence is materially different; business meaning cannot be inferred safely. | HIGH |
| Juni23-BB | Date semantics | Duplicate date(s): 2023-06-01 | Preserve source date; classify as DUPLICATE_DATE; do not shift/delete automatically. | Day/date interpretation and import policy. | HIGH |
| Juni25-BB | Date semantics | A41=31: INVALID_DATE | Preserve source date; classify as INVALID_DATE; do not shift/delete automatically. | Day/date interpretation and import policy. | HIGH |
| September25-BB | Date semantics | Duplicate date(s): 2025-09-01 | Preserve source date; classify as DUPLICATE_DATE; do not shift/delete automatically. | Day/date interpretation and import policy. | HIGH |
| November25-BB | Date semantics | A41=31: INVALID_DATE | Preserve source date; classify as INVALID_DATE; do not shift/delete automatically. | Day/date interpretation and import policy. | HIGH |
| Februari26-BB | Date semantics | A39=29: INVALID_DATE A40=30: INVALID_DATE A41=31: INVALID_DATE | Preserve source date; classify as INVALID_DATE; do not shift/delete automatically. | Day/date interpretation and import policy. | HIGH |
| April26-BB | Date semantics | A41=31: INVALID_DATE | Preserve source date; classify as INVALID_DATE; do not shift/delete automatically. | Day/date interpretation and import policy. | HIGH |
| Juni26-BB | Date semantics | A41=31: INVALID_DATE | Preserve source date; classify as INVALID_DATE; do not shift/delete automatically. | Day/date interpretation and import policy. | HIGH |
| Juni23-BB | Duplicate/identity resolution | 11 identity group(s); classifications: BUSINESS_KEY_COLLISION, TRUE_DUPLICATE. | Retain both source rows; no automatic merge/delete. | Owner must confirm business key, block, and canonical row selection. | HIGH |
| September25-BB | Duplicate/identity resolution | 11 identity group(s); classifications: BUSINESS_KEY_COLLISION, TRUE_DUPLICATE. | Retain both source rows; no automatic merge/delete. | Owner must confirm business key, block, and canonical row selection. | HIGH |
| Mei22-BB, Juni22-BB, Juli22-BB, Mei23-BB, Juni23-BB, Juli23-BB, Mei25-BB, Juni25-BB, Juli25-BB, Agustus25-BB, September25-BB, Oktober25-BB, November25-BB, Desember25-BB, Januari26-BB, Februari26-BB, Maret26-BB, April26-BB, Mei26-BB, Juni26-BB | Biomassa target | Canonical official target is 70.020 ton; legacy target is missing or not proven equal. | Keep historical target/UNKNOWN separate; never overwrite with current target. | Historical vs current/calculated target classification. | HIGH |
| Mei22-BB, Juni22-BB, Juli22-BB, Mei23-BB, Juni23-BB, Juli23-BB | Supplier identity | Canonical supplier codes missing from existing parser evidence. | Confirm renamed/abbreviated supplier mapping per family before import. | Supplier identity and receipt aggregation. | HIGH |
| Juli26-BB, Mei22-BB, Juni22-BB, Juli22-BB, Mei23-BB, Juni23-BB, Juli23-BB, Mei25-BB, Juni25-BB, Juli25-BB, Agustus25-BB, September25-BB, Oktober25-BB, November25-BB, Desember25-BB, Januari26-BB, Februari26-BB, Maret26-BB, April26-BB, Mei26-BB, Juni26-BB | Database target for biomass stock | Biomass stock fields are present, but no existing Prisma model/PostgreSQL table represents them. | Do not add a schema or import biomass stock automatically; decide whether full persistence is required. | Approve NEW_SCHEMA_REQUIRED target design or explicitly exclude the field from the supported import scope. | HIGH |

The recommendations preserve source data and defer decisions where evidence is insufficient. No final historical mapping was selected automatically.

## Recommended Implementation Sequence

1. **11E.1** Approve the canonical mapping profile from Juli26-BB.
2. **11E.2** Approve each legacy schema family and its field mapping.
3. **11E.3** Resolve supplier aliases and Unit 1-3 semantics.
4. **11E.4** Resolve invalid/mismatched dates without silently shifting source rows.
5. **11E.5** Approve source/business identity and content-hash policy.
6. **11E.6** Resolve Juni23-BB and September25-BB duplicate/collision decisions.
7. **11E.7** Implement only the approved mapping/parser extension in a later phase.
8. **11E.8** Run a complete dry-run and compare expected output.
9. **11E.9** Execute controlled import only after explicit approval.

## Database Safety

This phase is read-only. No INSERT, UPDATE, DELETE, DROP, TRUNCATE, reset, Prisma migration, Prisma db push/pull, import, synchronization write, Google Sheets write, credential change, environment change, Prisma schema change, Laravel change, Supabase change, or deployment was performed.

Database snapshot before:

- units: 3
- coalQuality: 1095
- coalConsumption: 1188
- coalStock: 396
- powerGeneration: 1095
- kpiTargets: 1095
- biomassReceipts: 7
- biomassConsumptions: 93
- coalReceipts: 1
- solarReceipts: 1
- solarConsumptions: 31
- hopReadings: 93
- biomassTargets: 1
- cumulativeSnapshots: 1
- importRuns: 6
- stagingRows: 1862
- syncSources: 1
- syncWorksheets: 199
- syncRuns: 8
- syncRowStates: 352
- schemaChanges: 0

Database snapshot after:

- units: 3
- coalQuality: 1095
- coalConsumption: 1188
- coalStock: 396
- powerGeneration: 1095
- kpiTargets: 1095
- biomassReceipts: 7
- biomassConsumptions: 93
- coalReceipts: 1
- solarReceipts: 1
- solarConsumptions: 31
- hopReadings: 93
- biomassTargets: 1
- cumulativeSnapshots: 1
- importRuns: 6
- stagingRows: 1862
- syncSources: 1
- syncWorksheets: 199
- syncRuns: 8
- syncRowStates: 352
- schemaChanges: 0

- Database writes: **0**
- Destructive operations: **NONE**
- Snapshot stable: **YES**
- Snapshot errors: **none**

## Final Status

| Metric | Result |
| --- | ---: |
| Total worksheets metadata | 199 |
| BB target worksheets | 21 |
| Legacy worksheets | 20 |
| Canonical | READ |
| Read failures | 0 |
| Canonical importability | IMPORT_READY |
| Legacy import ready | 0 |
| Legacy import after mapping | 0 |
| Legacy manual review | 20 |
| Legacy do not import | 0 |
| Database writes | 0 |

Final status: **BB LEGACY RESOLUTION -- PASS WITH REVIEW**.

Phase 11E stops here. **Do not import. Do not change the database, Prisma schema, parser, production code, or deployment.**
