# PHASE 6L — CONTROLLED AUTHORIZED PRODUCTION SYNC

Tanggal: 2026-09-04  
Project: Energi Primer PLN  
Mode: controlled authorized production sync  
Status akhir: **PASS WITH FINDINGS**

## 1. Approval dan batas eksekusi

Persetujuan eksplisit diterima:

> Saya menyetujui tepat satu authorized Production sync Phase 6L.

Batas yang diterapkan:

| Item | Hasil |
|---|---:|
| Authorized production sync request | 1 |
| Retry | 0 |
| Additional sync request | 0 |
| Cron invocation | 0 |
| Migration/deploy/resolve | 0 |
| Google write | 0 |
| Environment/secret change | 0 |
| Agent commit/push | 0 |

Satu request dilakukan secara manual ke endpoint production terbaru dengan satu HTTP POST. Field triggerType pada record internal bernilai cron karena route menggunakan trigger type tersebut secara internal; ini bukan invocation Vercel Cron.

## 2. Deployment identity dan provenance

| Item | Nilai |
|---|---|
| Vercel project | dashboard-energi-primer |
| Deployment ID | dpl_Gj1BecPeA6N7dZkeHE7LmnwbNRRX |
| Target | production |
| Deployment state | READY |
| Direct deployment URL | https://dashboard-energi-primer-k4azudqg1-projek-rzen.vercel.app |
| Production alias | https://dashboard-energi-primer-projek-rzen.vercel.app |
| Git branch | NextJs |
| Local HEAD | deeea1291b8ebfa563379e307eed7fd93ba133e1 |
| Vercel Git SHA | deeea1291b8ebfa563379e307eed7fd93ba133e1 |
| Commit verification | unverified |
| Provenance | PASS |

Deployment yang diuji adalah deployment READY terbaru dan SHA-nya sama dengan local HEAD.

## 3. Pre-sync production state

Snapshot diambil read-only sebelum authorized sync.

| Metric | Nilai |
|---|---:|
| sync_runs | 1 |
| sync_sources | 1 |
| active leases | 0 |
| sync_worksheets | 199 |
| sync_row_states | 2.409 |
| import_runs | 12 |
| staging_rows | 3.919 |
| duplicate natural keys | 0 |

Latest pre-sync run:

| Field | Nilai |
|---|---|
| ID | 1 |
| Status | SUCCESS |
| Trigger type | cron |
| Started | 2026-09-02T13:38:46.000Z |
| Finished | 2026-09-02T13:38:55.000Z |
| Duration | 9.576 ms |
| Worksheets scanned | 0 |
| Rows scanned | 0 |
| Inserted/updated/skipped/failed | 0 / 0 / 0 / 0 |

Pre-sync dashboard counts:

| Domain | Count |
|---|---:|
| Biomass receipts | 49 |
| Biomass consumptions | 636 |
| Coal receipts | 7 |
| Coal consumption | 636 |
| Coal stock | 212 |
| Solar receipts | 7 |
| Solar consumptions | 212 |
| HOP readings | 636 |
| Biomass targets | 1 |
| Biomass cumulative snapshots | 7 |

## 4. Google source policy

Pre-sync Google read-only checks berhasil:

- OAuth: PASS.
- Metadata listing: PASS.
- Worksheet metadata registry: 199.
- Required worksheets ditemukan: 7.
- Missing required worksheets: 0.
- Google writes: 0.

Required worksheet titles:

- Januari26-BB
- Februari26-BB
- Maret26-BB
- April26-BB
- Mei26-BB
- Juni26-BB
- Juli26-BB

Registry 199 worksheet merupakan metadata discovery registry, bukan berarti 199 worksheet tersebut semuanya di-import pada setiap sync.

Source tersedia sampai Juli 2026. Dengan kebijakan exact January–July, Agustus dan September tidak menjadi required input untuk run ini.

## 5. Hasil authorized production sync

Request tunggal:

| Field | Hasil |
|---|---|
| Method | POST |
| Endpoint | /api/sync/google-sheets |
| HTTP status | 200 |
| Content type | application/json |
| Public response status | SUCCESS |
| syncRun ID | 2 |
| request_id dari runtime log | 782cead5-c12f-4f23-b7fb-899b5b774611 |
| Observed stage | sync_request |
| Observed stage status | PASS |
| First failing stage | NONE |
| Final workflow status | SUCCESS |
| error_category | NONE |
| error_code | NONE |
| Retryable | Tidak ada retry |
| Google status | Tidak ada error |

Counter response:

| Counter | Nilai |
|---|---:|
| worksheetsScanned | 0 |
| rowsScanned | 0 |
| inserted | 0 |
| updated | 0 |
| skipped | 0 |
| failed | 0 |

Public response tidak mengekspos request_id, stage, atau total duration. Vercel log read-only berhasil memetakan request authorized ke request_id di atas dan hanya menampilkan record diagnostic request-level sync_request. Diagnostic record downstream tidak surfaced secara individual oleh Vercel CLI.

Runtime syncRun menyimpan:

- startedAt: 2026-09-04T15:37:23.000Z
- finishedAt: 2026-09-04T15:37:27.000Z
- durationMs: 4068
- status: SUCCESS

Tidak ada required worksheet yang diproses pada run ini. Hasil tersebut konsisten dengan source yang tersedia sampai Juli dan policy boundary January–July; tidak ada business row yang berubah.

## 6. P2028 dan discovery transaction

Hasil:

- P2028: **NOT OBSERVED**.
- discovery_transaction: effective PASS berdasarkan workflow yang selesai SUCCESS.
- Tidak ada first failing stage.
- Tidak ada retry.
- Tidak ada bukti kegagalan transaction root pada run ini.

Hasil ini membuktikan jalur discovery/sync berhasil pada satu execution terkontrol. Hasil ini tidak boleh ditafsirkan sebagai bukti bahwa P2028 mustahil terjadi kembali pada seluruh kondisi production.

## 7. Post-sync database state

Snapshot read-only post-sync menunjukkan:

| Metric | Sebelum | Sesudah |
|---|---:|---:|
| sync_runs | 1 | 2 |
| active leases | 0 | 0 |
| sync_sources | 1 | 1 |
| sync_worksheets | 199 | 199 |
| sync_row_states | 2.409 | 2.409 |
| import_runs | 12 | 12 |
| staging_rows | 3.919 | 3.919 |
| duplicate natural keys | 0 | 0 |

Latest post-sync run:

- ID: 2
- Status: SUCCESS
- Trigger type: cron
- Worksheets scanned: 0
- Rows scanned: 0
- Inserted/updated/skipped/failed: 0 / 0 / 0 / 0
- Duration: 4068 ms
- Active lease setelah run: 0

Dashboard counts tetap sama dengan pre-sync snapshot. Metadata source lastDiscoveredAt maju dari 2026-09-02T13:37:57.000Z menjadi 2026-09-04T15:37:17.000Z, sebagai perubahan metadata discovery yang sah.

## 8. Dashboard dan authenticated application check

Post-sync authenticated E2E berhasil:

- CSRF endpoint: HTTP 200.
- Credentials callback: HTTP 302.
- Session cookie: tersedia.
- Authenticated dashboard: HTTP 200.
- Marker Overview Energi Primer: ditemukan.
- Dashboard metric service: overview-postgres.
- Tidak ada perubahan business data dari dashboard check.

Guest access ke /dashboard tetap diarahkan ke /login.

## 9. Migration dan schema safety

Post-sync verification:

- supabase:production:migrate-status: PASS.
- supabase:production:migration:preflight: PASS.
- Satu baseline migration terdeteksi.
- Pending migration: 0.
- Unexpected migration: 0.
- Unfinished migration: 0.
- Rollback/checksum/drift finding: 0.
- Migration deploy: NOT RUN.
- Migration resolve: NOT RUN.
- Migration writes: 0.

## 10. Security dan leakage verification

Route verification pada deployment yang sama:

| Check | Hasil |
|---|---|
| / | 200 |
| /login | 200 |
| /api/auth/providers | 200; provider hanya credentials |
| /api/auth/session | 200 |
| Guest /dashboard | 307 ke /login |
| /forgot-password | 404 |
| /reset-password | 404 |
| /password/reset | 404 |
| Malformed /api/auth/forgot-password | 400 |
| Malformed /api/auth/reset-password | 400 |
| /api/password/reset | 404 |
| Missing/malformed/wrong Cron bearer | 401 |

Public HTML dan 9/9 public JavaScript chunks tidak mengandung marker database URL, Supabase URL/key, AUTH_SECRET, CRON_SECRET, Google service-account/private key, access/refresh token, atau PrismaClient. Tidak ada body leak yang terdeteksi.

Security headers yang teramati:

- HSTS: max-age=31536000
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()

CSP tidak terpasang. Ini dicatat sebagai LOW/REVIEW finding, bukan sebagai kegagalan sync.

## 11. Write accounting

| Write category | Aktual |
|---|---:|
| Authorized sync POST | 1 |
| Sync retry | 0 |
| Additional sync | 0 |
| Vercel Cron invocation | 0 |
| Business row insert/update | 0 / 0 |
| Import/staging row change | 0 |
| Sync metadata run | 1 record sah, syncRun ID 2 |
| Source discovery metadata | lastDiscoveredAt maju |
| Migration/deploy/resolve write | 0 |
| Manual DB write | 0 |
| Google write | 0 |
| Environment change | 0 |
| Secret rotation/change | 0 |
| Agent deployment | 0 |
| Commit | 0 |
| Push | 0 |

Satu post-sync admin login menghasilkan satu perubahan auth last_login_at yang diharapkan dari login verification; perubahan tersebut bukan bagian dari sync business data.

## 12. Findings

- **PASS:** satu authorized production sync selesai HTTP 200 dengan status SUCCESS.
- **PASS:** tidak ada P2028, error category, error code, atau failed counter.
- **PASS:** tidak ada perubahan business data, duplicate natural key, active lease, atau migration drift.
- **REVIEW:** Vercel CLI hanya menyajikan stage sync_request; downstream diagnostic stage tidak tersedia secara individual.
- **REVIEW:** public sync response belum mengekspos request_id/stage/duration diagnostic.
- **LOW/REVIEW:** CSP belum terpasang.
- **REVIEW, non-blocking:** live non-admin token scenario tidak dijalankan karena safety boundary; static authorization gate PASS.
- **Informational:** commit verification Vercel berstatus unverified.
- **By design:** idempotency tidak diuji dengan second sync karena batas Phase 6L melarang sync kedua.

## 13. Root-cause conclusion

Boundary discovery transaction yang sebelumnya berhubungan dengan P2028 tidak tereproduksi pada satu authorized production run ini. OAuth, metadata listing, source policy, discovery workflow, finalization, dan syncRun completion menghasilkan execution SUCCESS dengan zero failed counter dan tanpa P2028.

Kesimpulan yang tepat adalah remediation efektif pada execution ini. Belum ada dasar untuk menyatakan root cause telah hilang secara permanen pada semua kondisi load, timeout, atau koneksi production.

## 14. Documentation changes

Dokumentasi yang dibuat:

- docs/PHASE6L_CONTROLLED_AUTHORIZED_PRODUCTION_SYNC_2026-09-04.md

Dokumentasi historical Phase 6 sebelumnya dipertahankan. Tidak ada historical evidence yang dihapus atau ditulis ulang. Tidak ada perubahan code, environment, secret, migration, deployment, commit, atau push pada Phase 6L.

## 15. Final status dan stop condition

**PASS WITH FINDINGS**

Critical sync gate PASS:

- tepat satu authorized sync telah digunakan;
- response SUCCESS;
- syncRun ID 2 SUCCESS;
- P2028 NOT OBSERVED;
- post-sync database, dashboard, migration, dan security checks lulus;
- findings yang tersisa bersifat observability/security hardening dan tidak menggagalkan sync.

Approval Phase 6L telah dikonsumsi. Setelah laporan ini dibuat, tidak dilakukan dan tidak diizinkan:

- sync kedua atau retry;
- Cron invocation;
- migration atau resolve;
- deploy;
- commit atau push;
- environment/secret modification.

STOP COMPLETELY untuk Phase 6L.

