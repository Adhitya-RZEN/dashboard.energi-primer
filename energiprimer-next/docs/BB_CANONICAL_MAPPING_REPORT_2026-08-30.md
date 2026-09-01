# BB Canonical Mapping Report

Tanggal: 30 Agustus 2026  
Project: Dashboard Batu Bara PLN Jeranjang  
Status: **BB MAPPING — PASS WITH REVIEW**

## Business Rule

Hanya worksheet dengan nama yang cocok secara ketat dengan **[Bulan][2 digit tahun]-BB** yang merupakan source database BB. Worksheet lain tidak dibuatkan mapping database pada fase ini.

Canonical reference: **Juli26-BB**. Nilai worksheet canonical digunakan hanya sebagai reference untuk struktur, parser, validation, dan regression; nilai tidak disalin ke periode lain.

## Target Worksheet Pattern

Valid month names: Januari, Februari, Maret, April, Mei, Juni, Juli, Agustus, September, Oktober, November, Desember. Format tahun adalah dua digit dan suffix harus **-BB**. Contoh valid: Juli26-BB, Juni23-BB, September25-BB. Contoh invalid: Flyash-Okt, Summary-BB, Juli-26-BB.

## Canonical Reference: Juli26-BB

| Worksheet pattern | [Bulan][2 digit year]-BB |
| Worksheet | Juli26-BB |
| Sheet ID | 1171222689 |
| Range requested | A1:ZZ500 |
| Detected range | A4:DJ148 |
| Header rows | 5, 8, 9, 10 |
| Data rows | 31 |
| Date column | B / column 2 |
| Date range | 2026-07-01 -> 2026-07-31 (31 dates) |
| Blocks | dashboard 51:79 / J:AG; daily 4:67 / BO:CO; daily 8:47 / A:O; daily 8:48 / R:AN; daily 12:47 / A:N; target 23:67 / CD:CW; target 42:67 / CN:CZ; dashboard 53:72 / U:AA; target 15:67 / BY:CW; dashboard 51:79 / I:AA |
| Unit blocks | Unit 1, Unit 2, Unit 3 |
| Supplier rows | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] |
| Parser | EXISTING_PARSER_SUFFICIENT |
| Schema hash prefix | 39cf7fab5f60 |
| Plan status | READY_FOR_IMPORT |
| Plan summary | {"dailyRows":31,"receiptRows":7,"coalReceiptRows":1,"coalConsumptionRows":93,"coalStockRows":31,"biomassConsumptionRows":93,"solarConsumptionRows":31,"solarReceiptRows":1,"hopRows":93,"targetRows":1,"cumulativeRows":1,"totalRows":352} |
| Source key | entity + period/date + unit + supplier + value unit; row position excluded |
| Normalization | existing semantic parser, numeric normalization, Unit 1-3 ordered-block rule, seven Biomassa supplier identities |
| Validation | parser diagnostics, required daily paths, supplier identity, target 70.020 ton, duplicate/source-key and schema checks |

Canonical header mapping:

| Source Header | Normalized Field | Database Field | Type | Transformation | Confidence |
| --- | --- | --- | --- | --- | --- |
| NO > TGL | readingDate/periodStart | date or period_start | Decimal/number|null | parse daily date/day using worksheet month and year; flag period mismatch | HIGH |
| TANGGAL > TGL | readingDate/periodStart | date or period_start | Date|null | parse daily date/day using worksheet month and year; flag period mismatch | HIGH |
| STOK AWAL > BATUBARA > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AWAL > BIOMASSA SAWDUST > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AWAL > BIOMASSA WOODCHIP > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AWAL > BIOMASSA LRUK > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AWAL > BIOMASSA SRF > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AWAL > BIOMASSA BONGGOL > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| PENERIMAAN > BATUBARA > TON | coalReceipt.quantityTon | coal_receipts.quantity_ton | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | Decimal/number|null | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | Decimal/number|null | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | Decimal/number|null | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > WOODCHIP PT RAP | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | Decimal/number|null | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | text/unknown | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > WOODCHIP | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | text/unknown | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > LRUK | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | Decimal/number|null | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > SRF | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | Decimal/number|null | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > BONGGOL JAGUNG | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | text/unknown | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| UNIT 1 > BATUBARA | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 1 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 1 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 2 > BATUBARA | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 2 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 2 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 3 > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 3 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 3 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| TOTAL (TON) > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| TOTAL (TON) > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| STOK AKHIR > BATUBARA > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AKHIR > BIOMASSA SAWDUST > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AKHIR > BIOMASSA WOODCHIP > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AKHIR > BIOMASSA LRUK > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AKHIR > BIOMASSA SRF > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AKHIR > BIOMASSA BONGGOL > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| HOP > 3 UNIT > TON | hopDays unit 3 | hop_readings.hop_days | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| HOP > 2 UNIT > TON | hopDays unit 2 | hop_readings.hop_days | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| HOP > 1 UNIT > TON | hopDays unit 1 | hop_readings.hop_days | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| HOP > BIOMASSA > TON | hopDays | hop_readings.hop_days | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| BELT WEIGHER > UNIT 1 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 1 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 1 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 2 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 2 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 2 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 3 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 3 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 3 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 1 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 1 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 1 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 1 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | text/unknown | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 2 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 2 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 2 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 3 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 3 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 3 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 3 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 1 > BIOMASSA > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 1 > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 1 > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 1 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 1 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 2 > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 2 > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 2 > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 2 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 2 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 3 > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 3 > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 3 > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 3 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 3 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > INPUT | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | text/unknown | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > TOP UP | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > COUNTER MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | text/unknown | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > COUNTER SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | text/unknown | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > TOTAL COUNTER | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | text/unknown | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > TOTAL | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > 4.451 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| KWH GREEN > COAL HANDLING > BIOMASSA > TANGGAL | readingDate/periodStart | date or period_start | Date|null | parse daily date/day using worksheet month and year; flag period mismatch | HIGH |
| KWH GREEN > UNIT 1 > BIOMASSA > PROD BRUTO | powerGeneration unit 1 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 1 > BIOMASSA > MWH | powerGeneration unit 1 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 1 > BIOMASSA > TONASE | powerGeneration unit 1 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 2 > BIOMASSA > PROD BRUTO | powerGeneration unit 2 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 2 > BIOMASSA > MWH | powerGeneration unit 2 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 2 > BIOMASSA > TONASE | powerGeneration unit 2 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 3 > BIOMASSA > PROD BRUTO | powerGeneration unit 3 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 3 > BIOMASSA > MWH | powerGeneration unit 3 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 3 > BIOMASSA > TONASE | powerGeneration unit 3 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 1 > BIOMASSA > MWH | powerGeneration unit 1 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 1 > BIOMASSA > TONAS | powerGeneration unit 1 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 2 > BIOMASSA > MWH | powerGeneration unit 2 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 2 > BIOMASSA > TONAS | powerGeneration unit 2 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 3 > BIOMASSA > MWH | powerGeneration unit 3 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 3 > BIOMASSA > TONAS | powerGeneration unit 3 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SAWDUS | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | closingStock | coal_stock.closing_stock | text/unknown | normalize header semantics; parse numeric values; retain null | HIGH |

Canonical database target mapping:

| Domain | PostgreSQL table | Fields | Relationship/shape |
| --- | --- | --- | --- |
| BIOMASS_RECEIPT | biomass_receipts | period_start, supplier_code, supplier_name, quantity_ton | one row per supplier and month |
| BIOMASS_CONSUMPTION | biomass_consumptions | reading_date, unit_id, quantity_ton | one row per day and Unit 1-3 |
| COAL_RECEIPT | coal_receipts | period_start, quantity_ton | one row per month |
| COAL_CONSUMPTION | coal_consumption | date, unit_id, coal_used | one row per day and Unit 1-3 |
| COAL_STOCK | coal_stock | date, opening_stock, received, consumed, closing_stock | one row per day |
| SOLAR_RECEIPT | solar_receipts | period_start, quantity_liter | one row per month |
| SOLAR_CONSUMPTION | solar_consumptions | date, quantity_liter | one row per day |
| HOP | hop_readings | date, unit_id, hop_days | one row per day and Unit 1-3 |
| POWER_GENERATION | power_generation | date, unit_id, average_load, power_generation | one row per day and Unit 1-3 |
| UNIT_MASTER | units | code, name, status | master identity; not a daily fact |
| BIOMASS_TARGET | biomass_targets | target_year, target_ton | one row per target year |
| BIOMASS_CUMULATIVE | biomass_cumulative_snapshots | period_start, cumulative_ton | one row per period snapshot |

No NEW_SCHEMA_REQUIRED target was identified for canonical domains. Summary/calculation/helper values are presentation evidence and are not assigned a new database table.

## Target Worksheet Inventory

Total target worksheets: **21**.  
Target content read: **21**.  
Read failures: **0**.

| Worksheet | Month | Year | Schema Family | Compatibility | Importability | Read Status |
| --- | --- | ---: | --- | --- | --- | --- |
| Juli26-BB | Juli | 2026 | CANONICAL_MATCH | MATCH | IMPORT_NOW | READ |
| Mei22-BB | Mei | 2022 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Juni22-BB | Juni | 2022 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Juli22-BB | Juli | 2022 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Mei23-BB | Mei | 2023 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Juni23-BB | Juni | 2023 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Juli23-BB | Juli | 2023 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Mei25-BB | Mei | 2025 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Juni25-BB | Juni | 2025 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Juli25-BB | Juli | 2025 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Agustus25-BB | Agustus | 2025 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| September25-BB | September | 2025 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Oktober25-BB | Oktober | 2025 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| November25-BB | November | 2025 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Desember25-BB | Desember | 2025 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Januari26-BB | Januari | 2026 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Februari26-BB | Februari | 2026 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Maret26-BB | Maret | 2026 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| April26-BB | April | 2026 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Mei26-BB | Mei | 2026 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |
| Juni26-BB | Juni | 2026 | AMBIGUOUS | AMBIGUOUS | NEEDS_MANUAL_REVIEW | READ |

## Non-BB Worksheet Inventory

Non-BB worksheet count: **178**. These are metadata-inventoried as **NON_DATABASE_SOURCE** for this BB phase. No content-to-database mapping was created for them.

| Worksheet | Reason Not Target | Classification |
| --- | --- | --- |
| MAR-BB | MAR-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| FLM-MAR | FLM-MAR does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| MAR-DTS | MAR-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| MAR-ALBES | MAR-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| APR-BB | APR-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JUL-BB | JUL-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| APR-FLM | APR-FLM does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| APR-ALBES | APR-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| APR-DTS | APR-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| MEI-FLM | MEI-FLM does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| MEI-BB | MEI-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| MEI-ALBES | MEI-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| MEI DTS | MEI DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JUN-BB | JUN-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JUN-ALBES | JUN-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JUN-DTS | JUN-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JUN-FLM | JUN-FLM does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JUL-FLM | JUL-FLM does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JUL-ALBES | JUL-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| AGS-BB | AGS-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JUL-DTS | JUL-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| SEP-BB | SEP-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| OKT-BB | OKT-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| NOV-BB | NOV-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| DES-BB | DES-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JAN22 - BB | JAN22 - BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JAN22-FLM | JAN22-FLM does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JAN22-ALBES | JAN22-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JAN22-DTS | JAN22-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| FEB22-BB | FEB22-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| FEB22-ALBES | FEB22-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mar22-BB | Mar22-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mar22-ALBES | Mar22-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Apr22-BB | Apr22-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Apr22-ALBES | Apr22-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mei22-ALBES | Mei22-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juni22-ALBES | Juni22-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juli22-ALBES | Juli22-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Agus22-BB | Agus22-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Agus22-ALBES | Agus22-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Sep22-BB | Sep22-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Sep22-ALBES | Sep22-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Okt22-BB | Okt22-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Okt22-ALBES | Okt22-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Flyash-Okt | Flyash-Okt does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Nov22-BB | Nov22-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Flyash-Nov | Flyash-Nov does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Nov22-ALBES | Nov22-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Des22-BB | Des22-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Des22-FLYASH | Des22-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Des22-ALBES | Des22-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Jan23-BB | Jan23-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Feb23-BB | Feb23-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mar23-BB | Mar23-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Apr23-BB | Apr23-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Apr23-FLYASH | Apr23-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Apr23-ALBES | Apr23-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mei23-FLYASH | Mei23-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mei23-ALBES | Mei23-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juni23-FLYASH | Juni23-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juni23-ALBES | Juni23-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juli23-FLYASH | Juli23-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juli23-ALBES | Juli23-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Agust23-BB | Agust23-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Agust23-ALBES | Agust23-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Agust23-FLYASH | Agust23-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Sept23-BB | Sept23-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Okt23-BB | Okt23-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Sept23-FLYASH | Sept23-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Sept23-ALBES | Sept23-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Okt23-FLYASH | Okt23-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Okt23-ALBES | Okt23-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Nov23-BB | Nov23-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Nov23-FLYASH | Nov23-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Nov23-ALBES | Nov23-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Des23-BB | Des23-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Jan24-BB | Jan24-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Feb24-BB | Feb24-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Des23-FLYASH | Des23-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Des23-ALBES | Des23-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Jan24-FLYASH | Jan24-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Jan24-ALBES | Jan24-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Fab24-FLYASH | Fab24-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Feb24-ALBES | Feb24-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mar24-BB | Mar24-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mar24-FLYASH | Mar24-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mar24-ALBES | Mar24-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| APR24-BB | APR24-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| APR24-FLYASH | APR24-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| APR24-ALBES | APR24-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| MEI24-BB | MEI24-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| MEI24-FLYASH | MEI24-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| MEI24-ALBES | MEI24-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JUNI24-BB | JUNI24-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JUNI24-FLYASH | JUNI24-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JUNI24-ALBES | JUNI24-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JULY24-BB | JULY24-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JULI24-FLYASH | JULI24-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JULI24-ALBES | JULI24-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| AGUS24-BB | AGUS24-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| AGUST24-FLYASH | AGUST24-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| AGUST24-ALBES | AGUST24-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| SEPT24-BB | SEPT24-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| SEPT24-FLYASH | SEPT24-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| SEPT24-ALBES | SEPT24-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Okt24-BB | Okt24-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Okt24-FLYASH | Okt24-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Okt24-ALBES | Okt24-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Nov24-BB | Nov24-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Nov24-FLYASH | Nov24-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Nov24-ALBES | Nov24-ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Des24-BB | Des24-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Des24-FLYASH | Des24-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Des24 -ALBES | Des24 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Jan25-BB | Jan25-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Jan25-DTS | Jan25-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Jan25-FLYASH | Jan25-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Jan25 -ALBES | Jan25 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Feb25-BB | Feb25-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Feb25-DTS | Feb25-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Feb25 -ALBES | Feb25 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Feb25-FLYASH | Feb25-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mar25-BB | Mar25-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mar25-DTS | Mar25-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mar25 -ALBES | Mar25 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mar25-FLYASH | Mar25-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Apr25-BB | Apr25-BB does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Apr25 -ALBES | Apr25 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Apr25-FLYASH | Apr25-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Apr25-DTS | Apr25-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mei25 -ALBES | Mei25 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mei25-FLYASH | Mei25-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mei25-DTS | Mei25-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juni25-FLYASH | Juni25-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juni25 -ALBES | Juni25 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juni25-DTS | Juni25-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juli25-FLYASH | Juli25-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juli25-DTS | Juli25-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juli25 -ALBES | Juli25 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Agustus25-FLYASH | Agustus25-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Agustus25-DTS | Agustus25-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Agustus25 -ALBES | Agustus25 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| September25-FLYASH | September25-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| September25-DTS | September25-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| September25 -ALBES | September25 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Oktober25-FLYASH | Oktober25-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| November25 -ALBES | November25 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Oktober25 -ALBES | Oktober25 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Oktober25-DTS | Oktober25-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| November25-FLYASH | November25-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| November25-DTS | November25-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Desember25-FLYASH | Desember25-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Desember25 -ALBES | Desember25 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Desember25-DTS | Desember25-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Januari2026-FLYASH | Januari2026-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Januari26 -ALBES | Januari26 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Januari26-DTS | Januari26-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Februari2026-FLYASH | Februari2026-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Februari26 -ALBES | Februari26 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Februari26-DTS | Februari26-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Maret2026-FLYASH | Maret2026-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Maret26 -ALBES | Maret26 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Maret26-DTS | Maret26-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| April2026-FLYASH | April2026-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| April26 -ALBES | April26 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| April26-DTS | April26-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mei2026-FLYASH | Mei2026-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mei26 -ALBES | Mei26 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Mei26-DTS | Mei26-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juni2026-FLYASH | Juni2026-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juni26 -ALBES | Juni26 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juni26-DTS | Juni26-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juli2026-FLYASH | Juli2026-FLYASH does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juli26 -ALBES | Juli26 -ALBES does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| Juli26-DTS | Juli26-DTS does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| JULI24-FLM | JULI24-FLM does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| MEI24-FLM | MEI24-FLM does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |
| AGUST24-FLM | AGUST24-FLM does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope. | NON_DATABASE_SOURCE |

## Canonical Profile

Juli26-BB defines the expected header hierarchy, daily block, Unit 1-3 identity, seven Biomassa supplier identities, date semantics, parser normalization, source-key identity, validation, and database relationship. Existing Unit normalization is retained: a duplicate Unit 2 label is interpreted as Unit 3 only when ordered block evidence proves it; this phase does not normalize source values.

## Schema Families

| Family | Worksheet Count | Example | Relation to Juli26-BB | Mapping Required |
| --- | ---: | --- | --- | --- |
| CANONICAL_MATCH | 1 | Juli26-BB | Schema fingerprint equals Juli26-BB. | NO |
| AMBIGUOUS | 20 | Mei22-BB, Juni22-BB, Juli22-BB, Mei23-BB, Juni23-BB | Only 24% semantic overlap with canonical reference; business meaning is not safe to infer. | YES |

Family summary: CANONICAL_MATCH=1, AMBIGUOUS=20.

Schema comparison uses semantic header key, resource, unit, total/stock/HOP flags, date column, observed value type, parser ambiguity, and date semantics. It does not rely on physical column position alone.

## Field Mapping

Canonical mapping based on Juli26-BB:

| Source Header | Normalized Field | Database Field | Type | Transformation | Confidence |
| --- | --- | --- | --- | --- | --- |
| NO > TGL | readingDate/periodStart | date or period_start | Decimal/number|null | parse daily date/day using worksheet month and year; flag period mismatch | HIGH |
| TANGGAL > TGL | readingDate/periodStart | date or period_start | Date|null | parse daily date/day using worksheet month and year; flag period mismatch | HIGH |
| STOK AWAL > BATUBARA > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AWAL > BIOMASSA SAWDUST > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AWAL > BIOMASSA WOODCHIP > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AWAL > BIOMASSA LRUK > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AWAL > BIOMASSA SRF > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AWAL > BIOMASSA BONGGOL > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| PENERIMAAN > BATUBARA > TON | coalReceipt.quantityTon | coal_receipts.quantity_ton | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| PENERIMAAN > BIOMASSA > SAWDUST PT SYAHRONI | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | Decimal/number|null | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > SAWDUST PT BINTANG | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | Decimal/number|null | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > WOODCHIP PT SYAHRONI | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | Decimal/number|null | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > WOODCHIP PT RAP | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | Decimal/number|null | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > WOODCHIP CV MULTI PAKETINDO | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | text/unknown | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > WOODCHIP | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | text/unknown | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > LRUK | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | Decimal/number|null | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > SRF | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | Decimal/number|null | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| PENERIMAAN > BIOMASSA > BONGGOL JAGUNG | biomassReceipt.quantityTon | biomass_receipts.quantity_ton | text/unknown | map supplier identity; parse ton value; sum only canonical seven supplier columns | HIGH |
| UNIT 1 > BATUBARA | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 1 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 1 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 2 > BATUBARA | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 2 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 2 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 3 > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 3 > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| UNIT 3 > % > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| TOTAL (TON) > BATUBARA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| TOTAL (TON) > BIOMASSA > TON | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| STOK AKHIR > BATUBARA > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AKHIR > BIOMASSA SAWDUST > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AKHIR > BIOMASSA WOODCHIP > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AKHIR > BIOMASSA LRUK > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AKHIR > BIOMASSA SRF > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| STOK AKHIR > BIOMASSA BONGGOL > TON | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| HOP > 3 UNIT > TON | hopDays unit 3 | hop_readings.hop_days | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| HOP > 2 UNIT > TON | hopDays unit 2 | hop_readings.hop_days | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| HOP > 1 UNIT > TON | hopDays unit 1 | hop_readings.hop_days | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| HOP > BIOMASSA > TON | hopDays | hop_readings.hop_days | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| BELT WEIGHER > UNIT 1 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 1 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 1 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 2 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 2 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 2 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 3 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 3 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BELT WEIGHER > UNIT 3 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 1 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 1 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 1 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 1 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | text/unknown | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 2 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 2 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 2 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 3 > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 3 > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 3 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 3 > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BUCKET > UNIT 1 > BIOMASSA > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 1 > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 1 > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 1 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 1 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 2 > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 2 > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 2 > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 2 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 2 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 3 > MALAM (1) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 3 > MALAM (2) | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 3 > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 3 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| BIOMASSA > UNIT 3 > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > INPUT | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | text/unknown | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > TOP UP | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > COUNTER MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | text/unknown | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > COUNTER SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | text/unknown | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > TOTAL COUNTER | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | text/unknown | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > MALAM | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > PAGI | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > SORE | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > TOTAL | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| HSD > COAL HANDLING > BIOMASSA > 4.451 | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | Decimal/number|null | do not map automatically; review semantic context | LOW |
| KWH GREEN > COAL HANDLING > BIOMASSA > TANGGAL | readingDate/periodStart | date or period_start | Date|null | parse daily date/day using worksheet month and year; flag period mismatch | HIGH |
| KWH GREEN > UNIT 1 > BIOMASSA > PROD BRUTO | powerGeneration unit 1 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 1 > BIOMASSA > MWH | powerGeneration unit 1 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 1 > BIOMASSA > TONASE | powerGeneration unit 1 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 2 > BIOMASSA > PROD BRUTO | powerGeneration unit 2 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 2 > BIOMASSA > MWH | powerGeneration unit 2 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 2 > BIOMASSA > TONASE | powerGeneration unit 2 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 3 > BIOMASSA > PROD BRUTO | powerGeneration unit 3 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 3 > BIOMASSA > MWH | powerGeneration unit 3 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 3 > BIOMASSA > TONASE | powerGeneration unit 3 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 1 > BIOMASSA > MWH | powerGeneration unit 1 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 1 > BIOMASSA > TONAS | powerGeneration unit 1 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 2 > BIOMASSA > MWH | powerGeneration unit 2 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 2 > BIOMASSA > TONAS | powerGeneration unit 2 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 3 > BIOMASSA > MWH | powerGeneration unit 3 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 3 > BIOMASSA > TONAS | powerGeneration unit 3 | power_generation.power_generation / average_load | Decimal/number|null | normalize header semantics; parse numeric values; retain null | MEDIUM |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SAWDUS | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR LRUK | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR WOODCHIP | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR SRF | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > UNIT 3 > BIOMASSA > STOK AKHIR BONGGOL | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > NK BM > BIOMASSA > STOK AKHIR BONGGOL | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > NK BB > BIOMASSA > STOK AKHIR BONGGOL | closingStock | coal_stock.closing_stock | Decimal/number|null | normalize header semantics; parse numeric values; retain null | HIGH |
| KWH GREEN > 1 > BIOMASSA > STOK AKHIR BONGGOL | closingStock | coal_stock.closing_stock | text/unknown | normalize header semantics; parse numeric values; retain null | HIGH |

Legacy headers with equivalent semantics are **proposed mappings only**. No mapping was implemented or applied to legacy worksheets in Phase 11D.

## Unit Mapping

Canonical units are Unit 1, Unit 2, and Unit 3. Unit identity is mapped through the existing unit master and is not inferred solely from a physical column position.

| Worksheet | Detected Units | Notes | Status |
| --- | --- | --- | --- |
| Juli26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Mei22-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Juni22-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Juli22-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Mei23-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Juni23-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Juli23-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Mei25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Juni25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Juli25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Agustus25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| September25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Oktober25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| November25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Desember25-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Januari26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Februari26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Maret26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| April26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Mei26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |
| Juni26-BB | Unit 1, Unit 2, Unit 3 | Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values. | HIGH |

## Supplier Mapping

Canonical Biomassa receipt suppliers are represented by the supplier identities resolved by Juli26-BB. The canonical seven-supplier rule is used for comparison only; no legacy supplier name is auto-renamed.

| Worksheet | Detected Suppliers | Missing Canonical Codes | Notes |
| --- | --- | --- | --- |
| Juli26-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| Mei22-BB | UNKNOWN | sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-syahroni, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf | missing canonical supplier code(s): sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-syahroni, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf no supplier receipt rows resolved by existing parser |
| Juni22-BB | UNKNOWN | sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-syahroni, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf | missing canonical supplier code(s): sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-syahroni, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf no supplier receipt rows resolved by existing parser |
| Juli22-BB | UNKNOWN | sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-syahroni, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf | missing canonical supplier code(s): sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-syahroni, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf no supplier receipt rows resolved by existing parser |
| Mei23-BB | Woodchip PT Syahroni [woodchip-pt-syahroni] | sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf | missing canonical supplier code(s): sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf |
| Juni23-BB | Woodchip PT Syahroni [woodchip-pt-syahroni] | sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf | missing canonical supplier code(s): sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf |
| Juli23-BB | Woodchip PT Syahroni [woodchip-pt-syahroni] | sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf | missing canonical supplier code(s): sawdust-pt-syahroni, sawdust-pt-bintang, woodchip-pt-rap, woodchip-cv-multi-paketindo, lruk, srf |
| Mei25-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| Juni25-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| Juli25-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| Agustus25-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| September25-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| Oktober25-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| November25-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| Desember25-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| Januari26-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| Februari26-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| Maret26-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| April26-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| Mei26-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |
| Juni26-BB | Sawdust PT Syahroni [sawdust-pt-syahroni], Sawdust PT Bintang [sawdust-pt-bintang], Woodchip PT Syahroni [woodchip-pt-syahroni], Woodchip PT RAP [woodchip-pt-rap], Woodchip CV Multi Paketindo [woodchip-cv-multi-paketindo], LRUK [lruk], SRF [srf] | none | No supplier issue detected by this audit. |

## Date Mapping

Every target worksheet is checked against its name-derived month/year. Invalid calendar dates, dates outside the expected period, or unresolved daily dates are flagged as DATE_PERIOD_MISMATCH; source values are not repaired.

| Worksheet | Expected Period | Detected Date Range | Validation |
| --- | --- | --- | --- |
| Juli26-BB | 2026-07 | 2026-07-01 -> 2026-07-31 (31 dates) | PASS |
| Mei22-BB | 2022-05 | 2022-05-01 -> 2022-05-31 (31 dates) | PASS |
| Juni22-BB | 2022-06 | 2022-06-01 -> 2022-06-30 (30 dates) | PASS |
| Juli22-BB | 2022-07 | 2022-07-01 -> 2022-07-31 (31 dates) | PASS |
| Mei23-BB | 2023-05 | 2023-05-01 -> 2023-05-31 (31 dates) | PASS |
| Juni23-BB | 2023-06 | 2023-06-01 -> 2023-06-30 (30 dates) | PASS |
| Juli23-BB | 2023-07 | 2023-07-01 -> 2023-07-31 (31 dates) | PASS |
| Mei25-BB | 2025-05 | 2025-05-01 -> 2025-05-31 (31 dates) | PASS |
| Juni25-BB | 2025-06 | 2025-06-01 -> 2025-06-31 (31 dates) | 2025-06-31: DATE_PERIOD_MISMATCH (expected 2025-06) |
| Juli25-BB | 2025-07 | 2025-07-01 -> 2025-07-31 (31 dates) | PASS |
| Agustus25-BB | 2025-08 | 2025-08-01 -> 2025-08-31 (31 dates) | PASS |
| September25-BB | 2025-09 | 2025-09-01 -> 2025-09-30 (30 dates) | PASS |
| Oktober25-BB | 2025-10 | 2025-10-01 -> 2025-10-31 (31 dates) | PASS |
| November25-BB | 2025-11 | 2025-11-01 -> 2025-11-31 (31 dates) | 2025-11-31: DATE_PERIOD_MISMATCH (expected 2025-11) |
| Desember25-BB | 2025-12 | 2025-12-01 -> 2025-12-31 (31 dates) | PASS |
| Januari26-BB | 2026-01 | 2026-01-01 -> 2026-01-31 (31 dates) | PASS |
| Februari26-BB | 2026-02 | 2026-02-01 -> 2026-02-31 (31 dates) | 2026-02-29: DATE_PERIOD_MISMATCH (expected 2026-02) 2026-02-30: DATE_PERIOD_MISMATCH (expected 2026-02) 2026-02-31: DATE_PERIOD_MISMATCH (expected 2026-02) |
| Maret26-BB | 2026-03 | 2026-03-01 -> 2026-03-31 (31 dates) | PASS |
| April26-BB | 2026-04 | 2026-04-01 -> 2026-04-31 (31 dates) | 2026-04-31: DATE_PERIOD_MISMATCH (expected 2026-04) |
| Mei26-BB | 2026-05 | 2026-05-01 -> 2026-05-31 (31 dates) | PASS |
| Juni26-BB | 2026-06 | 2026-06-01 -> 2026-06-31 (31 dates) | 2026-06-31: DATE_PERIOD_MISMATCH (expected 2026-06) |

## Target Biomassa

Official current target: **70.020 ton**. A legacy target is never overwritten automatically.

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

Classification rule: exact 70.020 ton is CURRENT_TARGET; other explicit values are HISTORICAL_TARGET or CALCULATED_TARGET and require review; missing/ambiguous values are UNKNOWN and require review.

## Duplicate Analysis

Duplicate investigation is retained for **Juni23-BB** and **September25-BB** because both match the target pattern. They are not excluded from the target inventory due to duplicates.

Duplicate groups detected: **22**.

| Worksheet | Source Key Prefix | Entity | Identity | Source Rows | Values | Content Hash Prefixes | Classification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Juni23-BB | d59f289f8c62 | coal_consumption | coal_consumption \| 2023-06-01 \| UNIT-1 \| supplier-none \| ton | 11, 11 | 627.15, NULL | c49498fd804e, 4d0ecc866897 | BUSINESS_KEY_COLLISION |
| Juni23-BB | de80d675b746 | coal_consumption | coal_consumption \| 2023-06-01 \| UNIT-2 \| supplier-none \| ton | 11, 11 | 581.14, NULL | 4fdd7a99f454, 76cbe86e0614 | BUSINESS_KEY_COLLISION |
| Juni23-BB | 33af27c9ad29 | coal_consumption | coal_consumption \| 2023-06-01 \| UNIT-3 \| supplier-none \| ton | 11, 11 | 604.46, NULL | 3c9ef58cedca, 4d2e08ff418c | BUSINESS_KEY_COLLISION |
| Juni23-BB | 15776f80c260 | coal_stock | coal_stock \| 2023-06-01 \| unit-none \| supplier-none \| ton | 11, 11 | 70429.979, 55906.725 | ee33f53d92b6, 3600c968184a | BUSINESS_KEY_COLLISION |
| Juni23-BB | 4a82e7cbaca2 | biomass_consumption | biomass_consumption \| 2023-06-01 \| UNIT-1 \| supplier-none \| ton | 11, 11 | 20, NULL | e3e5ca74667c, caaae684dea2 | BUSINESS_KEY_COLLISION |
| Juni23-BB | 1904319f0d75 | biomass_consumption | biomass_consumption \| 2023-06-01 \| UNIT-2 \| supplier-none \| ton | 11, 11 | NULL, NULL | f799f66373f0 | TRUE_DUPLICATE |
| Juni23-BB | 764779b71561 | biomass_consumption | biomass_consumption \| 2023-06-01 \| UNIT-3 \| supplier-none \| ton | 11, 11 | NULL, NULL | ed6e10917d42 | TRUE_DUPLICATE |
| Juni23-BB | 10bd6aba2382 | solar_consumption | solar_consumption \| 2023-06-01 \| unit-none \| supplier-none \| liter | 11, 11 | 662, NULL | f9f7ca15dace, cb1d85503698 | BUSINESS_KEY_COLLISION |
| Juni23-BB | 28c787530053 | hop_reading | hop_reading \| 2023-06-01 \| UNIT-1 \| supplier-none \| hari | 11, 11 | 128.1, 101.6 | b08c23e75ed7, 3e907f3fec9a | BUSINESS_KEY_COLLISION |
| Juni23-BB | 8c5a54de5995 | hop_reading | hop_reading \| 2023-06-01 \| UNIT-2 \| supplier-none \| hari | 11, 11 | 64, 50.8 | 7b0d2eb05b2b, 3a5dc222711b | BUSINESS_KEY_COLLISION |
| Juni23-BB | c6cce06de085 | hop_reading | hop_reading \| 2023-06-01 \| UNIT-3 \| supplier-none \| hari | 11, 11 | 42.7, 33.9 | 88f7cc5ff4e9, 58863374aac6 | BUSINESS_KEY_COLLISION |
| September25-BB | fbe516f316e7 | coal_consumption | coal_consumption \| 2025-09-01 \| UNIT-1 \| supplier-none \| ton | 11, 11 | 458.691, NULL | 0d399779c635, 3a8af746edd6 | BUSINESS_KEY_COLLISION |
| September25-BB | 26d0e1212aef | coal_consumption | coal_consumption \| 2025-09-01 \| UNIT-2 \| supplier-none \| ton | 11, 11 | 575.392, NULL | 786f178cc9b3, 93e276562946 | BUSINESS_KEY_COLLISION |
| September25-BB | c8f4896b0299 | coal_consumption | coal_consumption \| 2025-09-01 \| UNIT-3 \| supplier-none \| ton | 11, 11 | NULL, NULL | 253fe299068b | TRUE_DUPLICATE |
| September25-BB | 4c78425e2bf7 | coal_stock | coal_stock \| 2025-09-01 \| unit-none \| supplier-none \| ton | 11, 11 | 37958.006, 53596.06 | 452ca5a64cb8, db44f9d9feb9 | BUSINESS_KEY_COLLISION |
| September25-BB | 431a884830e0 | biomass_consumption | biomass_consumption \| 2025-09-01 \| UNIT-1 \| supplier-none \| ton | 11, 11 | 66.4, NULL | 5c01a2a13c12, 168f2e4b6563 | BUSINESS_KEY_COLLISION |
| September25-BB | a2504a4ee73a | biomass_consumption | biomass_consumption \| 2025-09-01 \| UNIT-2 \| supplier-none \| ton | 11, 11 | 61.2, NULL | f7821612bf37, 980fc0958b7a | BUSINESS_KEY_COLLISION |
| September25-BB | 326707f88a5b | biomass_consumption | biomass_consumption \| 2025-09-01 \| UNIT-3 \| supplier-none \| ton | 11, 11 | NULL, NULL | fc3d6c275a3d | TRUE_DUPLICATE |
| September25-BB | d58f35c62aaa | solar_consumption | solar_consumption \| 2025-09-01 \| unit-none \| supplier-none \| liter | 11, 11 | 693, NULL | 0577499974f9, d1217df4cd04 | BUSINESS_KEY_COLLISION |
| September25-BB | c6b2d00b69d8 | hop_reading | hop_reading \| 2025-09-01 \| UNIT-1 \| supplier-none \| hari | 11, 11 | 69, 97.4 | dc4692d103f8, 1d436ab8574d | BUSINESS_KEY_COLLISION |
| September25-BB | c3bc047eb66a | hop_reading | hop_reading \| 2025-09-01 \| UNIT-2 \| supplier-none \| hari | 11, 11 | 34.5, 48.7 | c3eb24b1e35d, 17cd82c82b74 | BUSINESS_KEY_COLLISION |
| September25-BB | 06bfe303e41d | hop_reading | hop_reading \| 2025-09-01 \| UNIT-3 \| supplier-none \| hari | 11, 11 | 23, 32.5 | 9e369e4c445c, b2db59fe1b67 | BUSINESS_KEY_COLLISION |

TRUE_DUPLICATE means same business identity and same normalized content hash. BUSINESS_KEY_COLLISION means same identity with conflicting values. IDENTITY_DESIGN_ERROR, LEGACY_IDENTITY, or UNKNOWN are retained for manual investigation. No duplicate was deleted, merged, updated, or imported.

## Parser Extension Plan

| Worksheet | Schema Family | Recommendation | Evidence |
| --- | --- | --- | --- |
| Juli26-BB | CANONICAL_MATCH | EXISTING_PARSER_SUFFICIENT | Schema fingerprint equals Juli26-BB. |
| Mei22-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Only 24% semantic overlap with canonical reference; business meaning is not safe to infer. |
| Juni22-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Only 25% semantic overlap with canonical reference; business meaning is not safe to infer. |
| Juli22-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Only 25% semantic overlap with canonical reference; business meaning is not safe to infer. |
| Mei23-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| Juni23-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| Juli23-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| Mei25-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| Juni25-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| Juli25-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| Agustus25-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| September25-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| Oktober25-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| November25-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| Desember25-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| Januari26-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| Februari26-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| Maret26-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| April26-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| Mei26-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |
| Juni26-BB | AMBIGUOUS | PARSER_EXTENSION_REQUIRED_AFTER_REVIEW | Parser reports ambiguous field(s): biomassCumulative. |

Priority remains: existing parser -> mapping profile -> parser extension -> new parser only when unavoidable. No parser was implemented in this phase.

## Import Eligibility

| Worksheet | Eligibility | Schema Family | Existing Plan Issues |
| --- | --- | --- | --- |
| Juli26-BB | IMPORT_NOW | CANONICAL_MATCH | none |
| Mei22-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, biomass_supplier_receipt_empty, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020 |
| Juni22-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, biomass_supplier_receipt_empty, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020 |
| Juli22-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, biomass_supplier_receipt_empty, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020 |
| Mei23-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Juni23-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Juli23-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Mei25-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Juni25-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Juli25-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Agustus25-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| September25-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Oktober25-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| November25-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Desember25-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Januari26-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Februari26-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Maret26-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| April26-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Mei26-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |
| Juni26-BB | NEEDS_MANUAL_REVIEW | AMBIGUOUS | solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields |

Summary:

- IMPORT_NOW: **1**
- IMPORT_AFTER_MAPPING: **0**
- NEEDS_MANUAL_REVIEW: **20**
- NON_DATABASE_SOURCE: **178**

## Manual Review

| Worksheet | Reason | Status |
| --- | --- | --- |
| Mei22-BB | Only 24% semantic overlap with canonical reference; business meaning is not safe to infer.; biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, biomass_supplier_receipt_empty, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020 | NEEDS_MANUAL_REVIEW |
| Juni22-BB | Only 25% semantic overlap with canonical reference; business meaning is not safe to infer.; biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, biomass_supplier_receipt_empty, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020 | NEEDS_MANUAL_REVIEW |
| Juli22-BB | Only 25% semantic overlap with canonical reference; business meaning is not safe to infer.; biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, biomass_supplier_receipt_empty, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020 | NEEDS_MANUAL_REVIEW |
| Mei23-BB | Parser reports ambiguous field(s): biomassCumulative.; biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| Juni23-BB | Parser reports ambiguous field(s): biomassCumulative.; biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| Juli23-BB | Parser reports ambiguous field(s): biomassCumulative.; biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| Mei25-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| Juni25-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| Juli25-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| Agustus25-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| September25-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| Oktober25-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| November25-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| Desember25-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| Januari26-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| Februari26-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| Maret26-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| April26-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| Mei26-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |
| Juni26-BB | Parser reports ambiguous field(s): biomassCumulative.; solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields | NEEDS_MANUAL_REVIEW |

Mandatory duplicate review remains focused on Juni23-BB and September25-BB. Flyash-Okt and Flyash-Nov are non-BB worksheets and therefore are not manual-review targets for the BB database in this phase.

## Database Safety

This phase is read-only. No INSERT, UPDATE, DELETE, DROP, TRUNCATE, reset, Prisma migration, Prisma db push/pull, import, synchronization write, Google Sheets mutation, credential change, environment change, Laravel change, Prisma schema change, or deployment was performed.

Snapshot before audit:

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

Snapshot after audit:

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

- Database snapshots stable: **YES**
- Database writes: **0**
- Destructive operations: **NONE**

## Final Recommendation

1. Keep Juli26-BB as the only automatic import candidate until a separately approved import phase.
2. Treat every non-BB worksheet as NON_DATABASE_SOURCE for the BB database.
3. Resolve the target worksheets marked NEEDS_MANUAL_REVIEW, especially Juni23-BB and September25-BB duplicate/identity evidence.
4. Build mapping profiles per schema family, not one parser per worksheet.
5. Re-run this read-only mapping and dry-run after mapping decisions; do not import from this report.

## Final Summary

| Metric | Count |
| --- | ---: |
| Total worksheets | 199 |
| BB target worksheets | 21 |
| Non-BB worksheets | 178 |
| Canonical match | 1 |
| Legacy compatible | 0 |
| Legacy mapping required | 0 |
| Incompatible | 0 |
| Ambiguous | 20 |
| Import now | 1 |
| Import after mapping | 0 |
| Manual review | 20 |
| Non-database | 178 |
| Staging rows profiled | 7265 |

Final status: **BB MAPPING — PASS WITH REVIEW**.

Phase 11D stops here. **Do not import.**
