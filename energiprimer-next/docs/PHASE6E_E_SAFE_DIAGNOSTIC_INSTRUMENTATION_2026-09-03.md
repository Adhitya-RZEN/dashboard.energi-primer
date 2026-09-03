# PHASE 6E-E — SAFE DIAGNOSTIC INSTRUMENTATION

Overall Status: PASS WITH FINDINGS

Project: Energi Primer PLN Jeranjang  
Repository: energiprimer-next  
Branch: NextJs  
Date: 2026-09-03

## 1. Objective

Menambahkan observability diagnostik yang aman untuk kegagalan sinkronisasi
Google Sheets tanpa mengklaim root cause baru. Instrumentation ini mengganti
log broad sync_database dengan stage, request ID, durasi, kategori error
terbatas, dan safe error code.

Phase ini dijalankan sebagai local code instrumentation + local regression
only. Tidak ada request ke Production sync, retry Production, perubahan
database/env/credential, migrasi, deployment, commit, atau push.

Root cause tetap: ROOT CAUSE NOT YET IDENTIFIED.

## 2. Pre-Instrumentation Snapshot

Snapshot diambil sebelum perubahan source:

| Item | Value |
|---|---|
| Branch | NextJs |
| HEAD | 09363e739d5dc4ca5931724bd63d1c21ca293ca6 |
| Repository state | Dirty karena artefak/dokumen user yang sudah ada |
| Target source/schema/env state | Tidak memiliki perubahan sebelum instrumentation |
| Existing untracked items | Dokumen Phase 6D/6E-A sampai 6E-D dan graphify-out/ |
| Commit/push sebelum atau selama phase ini | Tidak ada |

Perubahan user yang sudah ada tidak di-reset atau dibuang.

## 3. Files Changed

| File | Changed? | Purpose |
|---|---:|---|
| src/app/api/sync/google-sheets/route.ts | YES | Request ID, environment gate, terminal success/failure diagnostics; response contract tetap |
| src/services/google-sheets/sync/engine.ts | YES | Instrumentation lease, syncRun lifecycle, worksheet, import, row-state, dan finalization |
| src/services/google-sheets/sync/discovery.ts | YES | Instrumentation Google config dan discovery transaction |
| src/lib/google-sheets.ts | YES | Instrumentation OAuth, metadata request, metadata cache hit, dan safe Google error mapping |
| src/services/google-sheets/sync/diagnostic-core.ts | NEW | Stage tuple, request ID, monotonic timing, bounded logger, Google/Prisma safe mapping |
| src/services/google-sheets/sync/diagnostics.ts | NEW | Safe sync error detail dan wrapper instrumentation yang rethrow error asli |
| docs/PHASE6E_E_SAFE_DIAGNOSTIC_INSTRUMENTATION_2026-09-03.md | NEW | Laporan phase ini |

Tidak ada perubahan pada Prisma schema, migration, .env.local,
.env.e2e.local, package.json, vercel.json, credentials, spreadsheet
configuration, atau cron configuration.

Evidence utama berada pada:

- route.ts lines 35-157
- engine.ts lines 266-743
- discovery.ts lines 123-269
- google-sheets.ts lines 418-569
- diagnostic-core.ts lines 5-217
- diagnostics.ts lines 18-61

## 4. Instrumentation Design

- Satu request ID dibuat dengan crypto.randomUUID() pada route dan
  diteruskan ke engine; direct engine invocation membuat ID sendiri.
- Logger hanya mengeluarkan request_id, stage, status, duration_ms,
  error_category, error_code, serta optional attempt dan
  google_http_status.
- request ID harus berbentuk UUID; token diagnostik dibatasi ke karakter
  uppercase/underscore dan panjang terbatas; nilai invalid menjadi UNKNOWN.
- Durasi memakai performance.now() dan dibulatkan menjadi integer dengan batas
  aman.
- Google HTTP status dibatasi ke 100–599.
- Wrapper hanya mencatat PASS/FAIL lalu mengembalikan hasil atau melempar
  kembali error original.
- attempt dicatat dari retry yang sudah ada pada discovery. Tidak ada retry
  baru yang diperkenalkan.
- Metadata cache hit dicatat sebagai google_metadata PASS dengan
  error_code=CACHE_HIT; pada jalur itu OAuth memang tidak dijalankan.
- request_id tidak dimasukkan ke public HTTP response.

## 5. Stage Coverage

| Stage | Instrumented | Success Logged | Failure Logged |
|---|---:|---:|---:|
| sync_request | YES, route entry | YES | Terminal failure dicatat oleh sync_complete |
| environment_gate | YES, route helper | YES | YES, DEPLOYMENT_DENIED |
| google_config | YES, discovery | YES | YES |
| google_oauth | YES, Google client | YES | YES |
| google_metadata | YES, metadata/cache path | YES | YES |
| discovery_transaction | YES, exact Prisma transaction | YES | YES |
| source_lease | YES, acquire/renew/release | YES | YES, termasuk NOT_ACQUIRED/NOT_RENEWED |
| sync_run_create | YES, exact syncRun.create | YES | YES |
| worksheet_processing | YES, per worksheet dan read failure | YES | YES |
| import_transaction | YES, exact existing import wrapper | YES | YES |
| row_state_transaction | YES, exact existing row-state wrapper | YES | YES |
| sync_run_finalize | YES, exact final syncRun.update | YES | YES |
| sync_complete | YES, route terminal path | YES | YES |

Stage instrumentation tidak memindahkan operasi, mengubah transaction
boundary, atau mengubah result semantics.

## 6. Safe Error-Code Handling

Google integration error hanya dipetakan dari bounded code yang sudah
didefinisikan aplikasi:

- configuration → CONFIGURATION / GOOGLE_CONFIGURATION
- credentials atau authentication → AUTHENTICATION
- permission → PERMISSION
- rate_limit → RATE_LIMIT
- timeout → TIMEOUT
- api tanpa status valid → NETWORK
- api dengan status valid → API + google_http_status
- malformed_response → API / GOOGLE_MALFORMED_RESPONSE

Prisma hanya mengeluarkan P#### yang aman atau identifier class terbatas:
PRISMA_INITIALIZATION, PRISMA_KNOWN_REQUEST,
PRISMA_UNKNOWN_REQUEST, dan PRISMA_RUST_PANIC. Jika tidak ada identifier
aman, hasilnya UNKNOWN. Kategori aplikasi yang sudah ada tetap digunakan
untuk business/error handling; perubahan hanya pada diagnostic output.

Pure helper smoke test PASS: UUID shape, Google API mapping, P2024 mapping,
dan redaction field invalid.

## 7. Secret Leakage Review

Status: PASS.

Search terhadap enam source file instrumentation hanya menemukan referensi
implementasi yang memang diperlukan, seperti private_key, access_token,
Bearer, dan process.env.CRON_SECRET. Tidak ada nilai secret yang dicetak.

Review juga memastikan:

- hanya diagnostic-core.ts yang memanggil console.error;
- console.error menerima satu string hasil field bounded;
- tidak ada console.error(error), raw error message, stack trace,
  Authorization header, bearer token, private key, URL, SQL, atau response
  body pada diagnostic logger;
- public response tidak memuat diagnostic detail.

## 8. Business Logic Preservation

Status: PASS.

Manual diff review terhadap source baseline menunjukkan:

- urutan discovery → lease → syncRun.create → worksheet processing →
  finalization tetap;
- transaction discovery tetap menggunakan maxWait 10_000 dan timeout 60_000;
- row-state transaction tetap timeout 30_000;
- retry helper dan retry limits tidak diubah;
- lease duration dan advisory/lease behavior tidak diubah;
- parsing, admission, schema review, identity, null/zero, unit, dan deletion
  behavior tidak diubah;
- existing safeErrorMessage dan database failure update tetap;
- authentication, authorization, CRON_SECRET check, dan deployment gate tetap;
- response status/body tetap.

Perubahan pada call signature hanya optional diagnostic context/config yang
tidak mengubah hasil operasi normal.

## 9. Security Regression

Status: PASS.

- sync:verify-cron-auth PASS untuk valid fixture, wrong secret, dan missing
  authorization; tidak menggunakan Production CRON_SECRET.
- sync:verify-preview-write-safety PASS dengan databaseWrites=0 dan memastikan
  preview/unknown deployment tetap fail-closed.
- auth:security:verify PASS dengan networkRequests=0 dan databaseWrites=0.
  Auth E2E environment dilaporkan AUTH_E2E_ENV_NOT_AVAILABLE, sehingga tidak
  ada valid live auth E2E pada phase ini.
- Public failure response tetap:
  { status: "FAILED", message: "Synchronization failed." }
- Tidak ada authentication bypass atau diagnostics pada response client.

## 10. Static Regression

| Command | Result |
|---|---|
| npm run db:generate | PASS |
| npm run db:validate | PASS |
| npm run lint | PASS |
| npx tsc --noEmit | PASS |
| npx tsc --noEmit --incremental false | PASS |
| sync:verify-config | PASS |
| sync:verify-cron-auth | PASS |
| sync:verify-preview-write-safety | PASS |
| sync:verify-schema | PASS |
| sync:verify-retry | PASS, static mode only |
| sync:verify-auto-admission | PASS |
| dynamic:verify | PASS |
| bb:mapping:test | PASS, 27 assertions |
| auth:security:verify | PASS, no network/database writes |
| diagnostic-core helper smoke test | PASS |

Tidak dijalankan:

- sync:verify-discovery live dan sync:verify-incremental karena dapat
  melakukan write terhadap target remote;
- sync:verify-state karena target .env.local bukan disposable local database,
  walaupun verifier tersebut read-only;
- sheets:sync, sheets:import, dry-run live, dan command sync lain yang dapat
  membaca remote Google atau menulis database.

## 11. Build Regression

Status: PASS.

npm run build berhasil dengan Next.js 16.3.3. Route
/api/sync/google-sheets tetap ter-build sebagai dynamic Node.js route, dan
TypeScript build check juga selesai PASS.

Tidak ada deployment yang dijalankan.

## 12. Local Sync Test

Status:

NOT TESTED — NO SAFE LOCAL SYNC TARGET

.env.local mengarah ke Supabase pooler remote yang digunakan sebagai target
runtime. Repository tidak menyediakan database disposable lokal dengan
isolated writes dan Google read-only sandbox untuk phase ini. Karena itu,
tidak ada local sync request, tidak ada request ke Production endpoint, dan
tidak ada upaya membuat test target baru.

## 13. Diff Review

Status: PASS.

- git diff --check: PASS. Warning yang ada hanya normalisasi LF ke CRLF oleh
  Git pada empat working-copy source file.
- git diff --stat: empat file tracked source berubah; dua helper diagnostik
  baru dan laporan ini untracked sebagai artefak phase.
- Forbidden diff check untuk prisma, .env.local, .env.e2e.local,
  vercel.json, dan package.json: kosong.
- Tidak ada credentials, migration, schema, cron, atau deployment file yang
  berubah.
- Tidak ada file yang di-stage, commit, atau push.

Diff logical yang lebih besar pada discovery/google client terutama berasal
dari indentation akibat membungkus operasi yang sama dalam try/catch
diagnostic; operation body dan opsi transaction tetap sama.

## 14. Production Safety Counters

Aktivitas selama Phase 6E-E:

| Counter | Expected | Actual |
|---|---:|---:|
| Production sync request | 0 | 0 |
| Production retry | 0 | 0 |
| Production database write | 0 | 0 |
| Local/remote sync database write | 0 | 0 |
| Google Sheet write | 0 | 0 |
| Migration / db push / resolve | 0 | 0 |
| Environment or credential change | 0 | 0 |
| Deployment | 0 | 0 |
| Commit | 0 | 0 |
| Push | 0 | 0 |

Aktivitas historical Phase 6E-B tidak dihitung sebagai aktivitas Phase 6E-E.
db:generate hanya menghasilkan client lokal dan tidak menjalankan database
write.

## 15. Remaining Unknowns

Root cause status tetap:

ROOT CAUSE NOT YET IDENTIFIED

Event PostgreSQL 08P01/08006 historis tetap candidate correlation, bukan
causality yang terkonfirmasi, karena tidak ada shared request/client
correlation ID. Instrumentation belum dideploy dan belum menghasilkan
request_id dari Production.

Final diagnostic value: YES untuk execution path yang benar-benar dijalankan.
Next authorized sync akan dapat membedakan:

- A. Google configuration/OAuth/metadata failure: YES, dengan bounded Google
  category/code dan optional HTTP status;
- B. discovery transaction failure: YES;
- C. lease acquisition/renew/release failure: YES;
- D. syncRun.create failure: YES;
- E. import transaction failure: YES;
- F. row-state transaction failure: YES;
- G. finalization failure: YES;
- H. safe Prisma error code: YES jika Prisma code/class identifier tersedia,
  selain itu UNKNOWN.

Cache hit dan early exit tidak diperlakukan sebagai error; stage yang tidak
dijalankan memang tidak dibuat-buat sebagai PASS.

## 16. Recommended Next Step

1. Review diff source dan desain safe log.
2. Jika disetujui, minta approval terpisah untuk deployment instrumentation
   ini saja.
3. Setelah deployment, inspect Production logs menggunakan request_id.
4. Dapatkan explicit operator approval baru untuk satu Production sync.
5. Jalankan tepat satu authorized sync, cocokkan request_id dengan stage dan
   error_code, lalu stop.

Langkah deployment dan sync Production tersebut tidak dijalankan dalam
Phase 6E-E.
