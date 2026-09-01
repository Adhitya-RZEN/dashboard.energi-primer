# Database Import Readiness Recheck — 2026-08-30

## Keputusan

**BLOCKED — bulk import seluruh Google Sheets belum dijalankan.**

Database normalized dan importer lokal sudah siap untuk import bertahap, tetapi
gate pembacaan Google Sheets gagal pada request API. Tidak ada `sheets:import`,
`INSERT`, `UPDATE`, `DELETE`, atau commit import yang dijalankan pada recheck ini.

## Pemeriksaan yang dijalankan

| Pemeriksaan | Status | Catatan |
| --- | --- | --- |
| Google configuration verification | PASS | Pasangan konfigurasi server-side dikenali; nilai secret tidak dicetak. |
| Dynamic parser verification | PASS | Parser static lulus. |
| PostgreSQL Overview verification | PASS | Data Juli 2026 dan metric normalized terbaca. |
| Schema detection verification | PASS | Perubahan schema diarahkan ke `NEEDS_REVIEW`. |
| Retry verification | PASS | Rate limit/transient error memakai retry terbatas. |
| Cron authorization verification | PASS | Authorization valid/invalid/missing teruji. |
| Live worksheet discovery | BLOCKED | Google API mengembalikan error kategori `api`. |

Pemeriksaan konektivitas HTTPS ke endpoint Google OAuth dan Sheets dari
environment saat ini juga gagal. Hasil ini belum membedakan firewall/proxy/DNS
dari masalah permission atau credential karena detail credential tidak dibuka.

## Kondisi database saat ini

- Data normalized yang tervalidasi tetap mencakup Juli 2026.
- Target Biomassa: `70020` ton.
- Penerimaan Biomassa: `3223.46` ton.
- Pemakaian Biomassa: `3740.65` ton.
- Penerimaan Batubara: `30084.842` ton.
- Pemakaian Solar: `24274` liter.
- Status Overview PostgreSQL: PASS.

## Tindakan manual yang diperlukan

1. Pulihkan akses outbound HTTPS dari environment yang menjalankan importer, atau
   konfigurasi proxy/firewall yang disetujui.
2. Pastikan service account memiliki permission Viewer pada spreadsheet.
3. Pastikan pasangan konfigurasi service account dan spreadsheet ID tersedia pada
   environment server-side. Nilai aktual tidak dicatat di dokumen ini.
4. Jalankan ulang discovery live.
5. Jalankan dry-run untuk satu worksheet valid.
6. Hanya worksheet berstatus `READY_FOR_IMPORT` yang boleh di-commit.

## Rencana setelah blocker selesai

Import dilakukan satu periode valid per batch:

```text
live discovery
→ schema validation
→ dry-run
→ review row count/metric/null/unit
→ transactional commit
→ parity verification
→ periode berikutnya
```

Worksheet dengan perubahan header, mapping ambigu, target selain `70020`, atau
coverage data yang belum jelas harus berhenti pada `NEEDS_REVIEW`.

## Status

**Tidak ada perubahan pada project Laravel, schema database, atau data operasional
selama recheck ini.**
