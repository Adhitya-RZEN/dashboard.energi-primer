# Google Sheets Production Readiness

Tanggal audit: 2026-08-28  
Scope: audit konfigurasi dan boundary server-side untuk deployment Vercel.

## Ringkasan

Integrasi target menggunakan service account dan Google Sheets REST API melalui implementasi native di `src/lib/google-sheets.ts`. Dependency `googleapis` tidak digunakan; tidak ada alasan teknis untuk menambahkannya pada Phase 10.

Status production: **BLOCKED** karena implementasi saat ini membaca credential dari file lokal yang diabaikan Git, sedangkan file tersebut tidak tersedia otomatis pada deployment Vercel.

## Konfigurasi yang diverifikasi

| Item | Hasil |
| --- | --- |
| Authentication | Service account JWT dengan RSA-SHA256 |
| Credential source | Path server-side dari `GOOGLE_SHEETS_CREDENTIALS_PATH` |
| Spreadsheet | ID hanya dibaca dari `GOOGLE_SHEETS_SPREADSHEET_ID`; tidak dicetak |
| Worksheet | Dibentuk mengikuti periode: `[MonthIndonesia][2-digit year]-BB` |
| Range | `B11:CO59` |
| API operation | Read-only Google Sheets v4 values endpoint |
| Timeout | 15 detik |
| Cache | In-memory process cache dengan TTL `GOOGLE_SHEETS_CACHE_TTL` |
| Client boundary | `server-only`; tidak diimpor Client Component |

Nama file credential lokal dan isi JSON/private key tidak ditulis di dokumen ini.

## Mapping dan transformation

Parser di `src/services/google-sheets-overview.ts` mempertahankan mapping Laravel yang sudah diaudit:

- indeks kolom ditentukan oleh range yang dikonfigurasi, bukan asumsi visual chart;
- header dan baris periode diproses menjadi tipe data overview yang digunakan service dashboard;
- nilai numerik dinormalisasi dengan aturan parser yang sama;
- fallback target dan formula Overview dipertahankan;
- periode yang tidak valid atau baris malformed tidak dianggap sebagai data valid;
- batas periode maksimum yang telah ditentukan service tetap digunakan.

Tidak ada perubahan schema database, API contract, KPI, atau business calculation pada Phase 10.

## Validation dan error handling

Service mengklasifikasikan error tanpa mengembalikan credential atau token:

- configuration/credential invalid;
- authentication failure;
- permission/forbidden;
- rate limit;
- timeout;
- API failure;
- malformed response;
- empty result.

Pesan yang dapat sampai ke UI bersifat generik. Detail log server tidak memasukkan private key, access token, spreadsheet ID, atau isi credential.

Verifikasi static yang dilakukan:

- module Google Sheets memiliki `server-only` boundary;
- hanya service server yang membaca `fs`, crypto, dan environment sensitif;
- hasil build tidak memuat nama environment sensitif, private-key marker, atau field credential pada public client chunks;
- tidak ada fetch tambahan dari komponen chart.

Live read pada environment lokal pernah dicatat pada dokumentasi Phase 8. Tidak ada koneksi baru atau perubahan data yang dijalankan pada audit production ini.

## Risiko deployment Vercel

Credential JSON lokal berada di directory yang di-ignore dan tidak boleh di-commit. Vercel Functions tidak menyediakan file tersebut hanya karena file ada pada workstation. Menyimpan path lokal yang sama pada production akan menyebabkan authentication gagal.

Production membutuhkan keputusan manual untuk salah satu pola berikut:

1. Refactor service agar membaca credential terpisah dari Vercel Environment Variables secara aman, dengan newline private key dinormalisasi saat runtime; atau
2. Mekanisme secret/file provisioning deployment yang disetujui operator dan kompatibel dengan runtime Vercel.

Keduanya memerlukan konfigurasi secret production dan validasi permission service account terhadap spreadsheet. Credential baru, rotasi, atau perubahan deployment tidak dilakukan otomatis dan berstatus **REQUIRES MANUAL APPROVAL**.

## Environment variables

Nama variable yang digunakan:

- `GOOGLE_SHEETS_CREDENTIALS_PATH`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_CACHE_TTL`

Tidak ada variable Google yang menggunakan prefix `NEXT_PUBLIC_`.

## Test plan

Setelah konfigurasi production disediakan secara manual, lakukan read-only verification untuk:

- authentication service account;
- akses spreadsheet, worksheet, dan range;
- mapping/transformation terhadap fixture atau response read-only;
- empty, malformed, permission, rate-limit, timeout, dan API error;
- pemeriksaan bahwa secret tidak berada di public bundle atau log.

Saat ini integration test production: **BLOCKED** karena konfigurasi deployment belum tersedia.

## Status

**BLOCKED / NOT READY untuk Google Sheets production.** Kode server-side dan error boundary siap diaudit, tetapi credential provisioning dan permission production masih membutuhkan konfigurasi manual.

