# Controlled Import Report — Juli26-BB

Tanggal pelaksanaan: 30 Agustus 2026  
Status akhir: **PASS** (dengan warning non-blocking dari parser existing)

## Scope dan batas keamanan

Import ini dilakukan sesuai instruksi controlled import dan hanya menargetkan worksheet `Juli26-BB`.

- Laravel tidak diubah.
- Database production, Supabase, dan Vercel tidak disentuh.
- Tidak ada `prisma migrate`, `prisma db push`, reset, drop, truncate, atau operasi delete.
- Tidak ada `INSERT`, `UPDATE`, atau `DELETE` pada worksheet selain target.
- Tidak ada perubahan schema, authentication, authorization, API, atau business logic.
- Tidak ada secret, private key, access token, password, atau nilai lengkap `DATABASE_URL` yang dicatat.

Discovery Google Sheets membaca metadata 199 worksheet untuk memperbarui/mengecek registry sinkronisasi yang sudah ada. Seleksi sinkronisasi hanya memilih `Juli26-BB`; data worksheet lain tidak diparse atau diimpor.

## Environment

| Item | Hasil |
| --- | --- |
| Database target | PostgreSQL lokal |
| Host/port | `127.0.0.1:5432` |
| Database/schema | `dashboard_pln` / `public` |
| Source | Google Sheets dynamic parser |
| Worksheet | `Juli26-BB` |
| Range | `A1:ZZ500` |
| Authentication | Service account server-side dari konfigurasi lokal yang sudah tersedia; nilai credential tidak dicatat |
| Target non-local | Tidak digunakan |

## Preflight

Dry-run berhasil dengan status `READY_FOR_IMPORT`.

| Pemeriksaan | Hasil |
| --- | --- |
| Baris staging yang direncanakan | 352 |
| Baris valid | 352 |
| Baris rejected | 0 |
| Blocking issue | 0 |
| Worksheet efektif | `Juli26-BB` |
| Target biomassa 2026 | 70.020 ton |
| Parser/schema/retry verification | PASS |
| Database target safety check | PASS; local-only |

Warning non-blocking dari data/source existing:

1. Ada label Unit 2 yang dinormalisasi ke urutan Unit 1–3 oleh parser existing.
2. Total bulanan biomassa dari dashboard berbeda dengan agregasi semantic Unit 1–3; implementasi existing mempertahankan agregasi Unit 1–3 untuk parity.

Warning tersebut tidak diubah selama import dan tetap membutuhkan review bisnis bila aturan sumber diperbarui.

## Write pertama

| Item | Hasil |
| --- | --- |
| Import run | `6` |
| Status | `SUCCESS` |
| Worksheet | `Juli26-BB` |
| Periode | Juli 2026 |
| Imported/reported database writes | 352 |
| Rejected rows | 0 |
| Staging rows untuk run target | 352 |

Distribusi data hasil import:

| Entity | Rows |
| --- | ---: |
| Biomass consumption | 93 |
| Biomass receipt | 7 |
| Biomass target | 1 |
| Biomass cumulative | 1 |
| Coal consumption | 93 |
| Coal receipt | 1 |
| Coal stock | 31 |
| HOP reading | 93 |
| Solar consumption | 31 |
| Solar receipt | 1 |
| **Total** | **352** |

## Re-import/idempotency

Re-import dijalankan melalui orchestrator sinkronisasi existing dengan seleksi eksplisit `--worksheet=Juli26-BB`.

| Counter | Hasil |
| --- | ---: |
| Worksheets scanned | 1 |
| Rows scanned | 352 |
| INSERT | 0 |
| UPDATE | 0 |
| SKIP | 352 |
| FAILED | 0 |

Hasil ini membuktikan bahwa import ulang data yang sama tidak membuat normalized duplicate dan seluruh row dikenali sebagai synchronized.

## Post-import data verification

### Relasi, unit, tanggal, dan duplicate

- Unit tersedia tepat dan konsisten: Unit 1, Unit 2, Unit 3.
- Biomass consumption, solar consumption, dan HOP mencakup 1–31 Juli 2026.
- Coal consumption dan coal stock mencakup 2–31 Juli 2026 sesuai data sumber.
- Orphan staging/import-run rows: 0.
- Orphan unit relationship rows: 0.
- Orphan import-run relationship rows yang diuji: 0.
- Duplicate groups pada biomass receipt, biomass consumption, solar consumption, dan HOP: 0.
- Open schema changes: 0.

### Row counts dan aggregate

| Metric | Nilai hasil verifikasi |
| --- | ---: |
| Biomass receipt | 3.223,46 ton |
| Biomass consumption | 3.740,65 ton |
| Coal receipt | 30.084,842 ton |
| Solar consumption | 24.274 liter |
| Solar receipt | 25.000 liter |
| Biomass target 2026 | 70.020 ton |
| Biomass cumulative | 29.103,77 ton |
| Biomass progress | 41,5649% |

Database staging setelah write pertama tetap memiliki 1.862 row dari seluruh riwayat import yang sudah ada; normalized table tidak bertambah duplicate pada re-import.

## Dashboard/regression verification

Query dashboard PostgreSQL normalized data berhasil dijalankan dengan hasil:

- Periode: Juli 2026.
- Daily series: 31 row.
- Focus date: 28 Juli 2026.
- Focus values: Unit 1 `74,8`, Unit 2 `47,6`, Unit 3 `61,2` ton.
- KPI aggregate sama dengan baseline dry-run.
- Target tetap 70.020 ton dan progress tetap sekitar 41,6%.
- Tidak ada perubahan pada query, schema, atau business calculation.

## Test result

| Test/verification | Status |
| --- | --- |
| Controlled import dry-run | PASS |
| Controlled post-import verification | PASS |
| Re-import idempotency | PASS |
| `verify-import-data` | PASS |
| `db:verify-overview` | PASS |
| `db:verify` | PASS |
| `sync:verify-state` | PASS |
| `dynamic:verify` | PASS |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `prisma validate` | PASS |
| `prisma migrate status` | PASS; schema up to date, 5 migrations found |
| `npm run build` | PASS |
| Existing automated test script | Tidak tersedia pada `package.json` |

Node menampilkan warning experimental loader saat menjalankan script TypeScript secara langsung. Warning tersebut tidak memengaruhi hasil test dan tidak berkaitan dengan credential atau data.

## Files changed

- `scripts/verify-controlled-import.ts` — verifikasi read-only untuk run target, row count, date range, relationship, orphan, dan duplicate.
- `docs/CONTROLLED_IMPORT_JULI26-BB_2026-08-30.md` — laporan ini.

Tidak ada perubahan pada Prisma schema, migration, database structure, source Laravel, credential, atau konfigurasi production.

## Manual follow-up

- Review dua warning parser/source di atas sebelum melakukan perubahan aturan normalisasi.
- Controlled import ini tidak mencakup worksheet lain. Import bulk atau sinkronisasi cron harus menjadi pekerjaan terpisah dengan approval dan runbook tersendiri.
- Konfigurasi credential production tetap harus dilakukan melalui secret/environment configuration deployment, bukan melalui repository.

## Final decision

**CONTROLLED IMPORT — PASS**

Worksheet `Juli26-BB` berhasil diimpor ke PostgreSQL lokal, data tervalidasi, re-import menghasilkan `SKIP 352`, tidak ditemukan orphan/duplicate, dan seluruh pemeriksaan aplikasi yang relevan berhasil. Proses dihentikan sesuai scope; tidak ada bulk import, worksheet lain, atau deployment yang dilakukan.
