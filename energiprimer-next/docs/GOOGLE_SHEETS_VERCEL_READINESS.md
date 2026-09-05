# Google Sheets Vercel Readiness

> CURRENT PRODUCTION POINTER (2026-09-05): Phase 6K verified the Vercel
> deployment and Phase 6L verified one authorized controlled sync. The
> server-only Google credential boundary and exact source policy remain current;
> the provisioning-blocked status below is a historical 2026-08-28 snapshot.

Tanggal: 2026-08-28  
Scope: compatibility and secret-boundary audit tanpa provisioning credential.

## Implementation

| Item             | Result                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Client           | Native server-side REST client; googleapis tidak terpasang                                                                      |
| Auth             | Service account JWT RSA-SHA256 dengan scope Sheets read-only                                                                    |
| Credential input | `GOOGLE_SHEETS_CREDENTIALS_PATH` lokal atau pasangan `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` pada environment |
| Spreadsheet      | GOOGLE_SHEETS_SPREADSHEET_ID, tidak ditulis pada laporan                                                                        |
| Worksheet        | Dinamis berdasarkan nama bulan Indonesia, tahun 2 digit, dan suffix -BB                                                         |
| Range            | B11:CO59 untuk mapping legacy; A1:ZZ500 untuk agregat semantic penerimaan Biomassa                                              |
| Timeout          | 15 detik dengan AbortController                                                                                                 |
| Cache            | In-memory per process berdasarkan spreadsheet/worksheet/range                                                                   |
| Parser           | src/services/google-sheets-overview.ts; mapping semantic KPI dan agregat tujuh pemasok Biomassa dengan legacy fallback terbatas |
| Boundary         | src/lib/google-sheets.ts menggunakan server-only                                                                                |

## Environment variables

- GOOGLE_SHEETS_CREDENTIALS_PATH
- GOOGLE_SERVICE_ACCOUNT_EMAIL (alternatif)
- GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (alternatif)
- GOOGLE_SHEETS_SPREADSHEET_ID
- GOOGLE_SHEETS_CACHE_TTL

Tidak ada Google secret dengan prefix NEXT_PUBLIC_. Nilai aktual, service-account email, private key, dan spreadsheet ID tidak ditampilkan.

## Error and data handling

Service menangani configuration, credential read/parse, authentication, permission, rate limit, timeout, API failure, malformed response, dan empty response. Pesan ke UI bersifat generik. Token hanya disimpan di memory process dan tidak dikembalikan ke UI.

Parser memvalidasi row shape, mempertahankan null sebagai unavailable/gap sesuai kontrak, dan memakai transformation yang telah diaudit dari Laravel. Chart tidak memanggil Google API secara langsung.

## Vercel compatibility

Credential JSON lokal berada pada directory ignored Git. File tersebut tidak boleh di-commit dan tidak tersedia otomatis pada Function Vercel. Untuk deployment tanpa file mount, service mendukung pasangan environment service-account dengan newline private key yang dinormalisasi runtime.

### REQUIRES MANUAL CONFIGURATION

Sebelum production, operator harus:

1. Mengisi pasangan service-account melalui Vercel Environment Variables, atau menyediakan file dengan mekanisme secret Vercel yang disetujui.
2. Mengisi spreadsheet ID sebagai environment variable server-side.
3. Memberikan permission Viewer service account pada spreadsheet.
4. Memastikan worksheet/range production sesuai source of truth.
5. Menjalankan read-only smoke test dari Vercel Preview.

Provisioning credential, perubahan Google Cloud project, dan rotasi credential tidak dilakukan.

## Security verification

- Tidak ada import Google client dari Client Component.
- Public bundle scan tidak menemukan Google environment names, private-key marker, access token, atau service-account field.
- Error log Google tidak mencetak response credential.
- Credential file lokal tidak tracked.

## Historical status at audit date

**PASS WITH WARNINGS untuk source boundary; BLOCKED untuk production credential provisioning.**
