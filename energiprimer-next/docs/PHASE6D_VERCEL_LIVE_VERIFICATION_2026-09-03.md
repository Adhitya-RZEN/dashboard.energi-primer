# Phase 6D — Vercel Live Verification

Tanggal pemeriksaan: 2026-09-03  
Project lokal: energiprimer-next  
Status akhir: **PASS WITH LIMITED REVIEW**

## 1. Scope

Pemeriksaan Phase 6D-A dibatasi pada Vercel Production dan operasi read-only.
Phase 6D-C kemudian melakukan satu deployment Production terkontrol untuk
koreksi schedule Cron. Tidak ada migration, migrate resolve, schema change,
data deletion, import, atau authorized sync yang dijalankan.

Probe live mencakup GET publik, endpoint Auth.js, satu authenticated E2E
Production terkontrol, bearer Cron yang hilang/salah, pemindaian
HTML/JavaScript bundle, metadata Vercel, dan agregasi request log tanpa
mencetak log mentah.

Authorized Cron tidak dijalankan karena endpoint tersebut write-capable dan
tidak disetujui. Authenticated E2E menggunakan credential Production dari
file lokal yang di-ignore Git; value tidak dicatat atau ditampilkan.

## 2. Production deployment identity

| Field | Evidence |
| --- | --- |
| Vercel project | projek-rzen/dashboard-energi-primer |
| Project ID | prj_CuwETLeUjPrqWErbWJHcw8a0ZB05 |
| Root Directory | energiprimer-next |
| Deployment ID | dpl_9sMiBr6141Yfs3mPDSqnJL9NV6hA |
| Deployment URL | dashboard-energi-primer-ews0odvph-projek-rzen.vercel.app |
| Target | Production |
| Status | Ready |
| Git ref | NextJs |
| Git commit | 09363e739d5dc4ca5931724bd63d1c21ca293ca6 |
| Commit verification | verified |
| Vercel GitHub repository | Adhitya-RZEN/dashboard.energi-primer |
| Build framework | Next.js |
| Node.js | 24.x |
| Build command | Vercel default equivalent to npm run build / next build |

Vercel project inspection mengonfirmasi Root Directory energiprimer-next,
Framework Preset Next.js, dan Node.js 24.x.

## 3. Domain verification

Alias Production yang tercantum pada deployment aktif:

- https://dashboard-energi-primer.vercel.app
- https://dashboard-energi-primer-projek-rzen.vercel.app
- https://dashboard-energi-primer-git-nextjs-projek-rzen.vercel.app

Probe route dilakukan pada alias kanonik
https://dashboard-energi-primer.vercel.app, bukan pada URL Preview. Alias
tersebut tercantum langsung pada deployment Production Ready terbaru dari
branch NextJs.

Result: **PASS untuk domain/alias**, dengan catatan provenance repository pada
bagian Findings.

## 4. Framework verification

Vercel mendeteksi Next.js dan deployment output berisi lambda untuk halaman
Next.js, middleware, Auth.js route, dan Google Sheets route. Local
npm run build juga PASS pada regression gate Phase 6C.

Result: **PASS**.

## 5. Environment verification

Nama variable Production dibaca melalui daftar environment Vercel; value tidak
dibaca atau ditampilkan.

| Variable name | Production presence | Reported scope |
| --- | --- | --- |
| DATABASE_URL | present | Production, Preview |
| AUTH_SECRET | present | Production, Preview |
| AUTH_TRUST_HOST | present | Production, Preview |
| AUTH_URL | present | Production, Preview |
| SUPABASE_DIRECT_URL | present | Production, Preview |
| SUPABASE_POOLER_URL | present | Production, Preview |
| NEXT_PUBLIC_APP_NAME | present | Production, Preview |
| NEXT_PUBLIC_APP_URL | present | Production, Preview |
| CRON_SECRET | present | Production, Preview |
| GOOGLE_SHEETS_CREDENTIALS_PATH | present | Production, Preview |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | present | Production, Preview |
| GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY | present | Production, Preview |
| GOOGLE_SHEETS_SPREADSHEET_ID | present | Production, Preview |
| GOOGLE_SHEETS_CACHE_TTL | present | Production, Preview |

Environment list hanya membuktikan nama dan scope, bukan bahwa value Production
dan Preview berbeda atau menunjuk database/provider yang benar.

AUTH_URL terdaftar dan endpoint Auth.js Production berfungsi secara dasar,
tetapi value tidak dibaca sehingga pemeriksaan ini tidak mengklaim isi value
secara langsung. File credential E2E yang di-ignore Git digunakan hanya untuk
sequence Production terkontrol dan tidak dicatat atau ditampilkan.

## 6. Auth.js production verification

Probe aman:

| Check | Result | Evidence |
| --- | --- | --- |
| Auth.js providers | PASS | GET /api/auth/providers returned 200; provider key hanya credentials |
| CSRF endpoint | PASS | GET /api/auth/csrf returned 200; token hanya diproses internal |
| Valid admin login | PASS | Satu successful Production login terkontrol |

Valid login dijalankan tepat satu kali. Successful Auth.js login dapat
memperbarui users.last_login_at sebagai expected authentication write.

## 7. Session verification

GET /api/auth/session tanpa cookie returned 200 dengan response anonim,
tanpa user dan tanpa token yang dicetak. Ini hanya membuktikan anonymous
session behavior.

Session admin, refresh /dashboard, dan persistence berhasil diverifikasi
dengan satu session jar.

Result: **PASS untuk authenticated session dan refresh**.

## 8. Authorization verification

GET /dashboard tanpa authentication returned HTTP 307 dengan tujuan /login.
HTML dashboard tidak diberikan kepada guest.

Admin authorization diuji melalui session Production yang berhasil dan role
admin diterima. Supplemental signed operator-role authorization check juga
PASS dan ditolak ke /login tanpa database write.

Result: **PASS untuk guest boundary dan admin authorization**.

## 9. Logout verification

Logout dijalankan tepat satu kali. Session setelah logout hilang dan request
berikutnya ke /dashboard kembali redirect ke /login.

Result: **PASS**.

## 10. Database verification

Authenticated Production application berhasil merender dashboard dengan HTTP
200 dan expected overview marker. Ini membuktikan jalur application read
berhasil tanpa direct database command atau mutation.

Local Phase 6C/previous regression evidence untuk Prisma, schema, dan Supabase
production preflight tetap hanya evidence lokal/read-only; evidence tersebut
tidak menggantikan pembacaan melalui Production application.

P1000, P1001, ECONNREFUSED, ETIMEDOUT, dan marker SSL/pooler error tidak
terlihat pada agregasi request log Production yang diperiksa, tetapi itu bukan
pengganti authenticated database read.

Result: **PASS untuk minimum authenticated application read**; granular KPI
semantics dan nilai data tidak diubah.

## 11. Dashboard verification

Guest /dashboard ditolak dan diarahkan ke /login. Halaman authenticated
berhasil HTTP 200 dengan marker Overview Energi Primer pada satu login
terkontrol. Navigasi granular, seluruh KPI, chart, dan semantics
null-versus-zero tidak dimodifikasi pada test ini.

Local build membuktikan route dashboard terkompilasi, bukan bahwa data
Production berhasil dibaca.

Result: **PASS untuk authenticated dashboard minimum contract**.

## 12. Client/server boundary

Pemeriksaan live mencakup HTML / dan /login, serta 10 JavaScript asset
yang dimuat oleh halaman tersebut:

- seluruh asset returned HTTP 200;
- tidak ditemukan nama server environment seperti DATABASE_URL,
  AUTH_SECRET, CRON_SECRET, private-key variable, atau service-role
  variable;
- tidak ditemukan private-key marker, credential URL, atau JWT-like material;
- X-Powered-By tidak ada pada route publik yang diperiksa.

Result: **PASS untuk public surface yang diuji**. Authenticated dashboard
bundle/network response belum dapat diperiksa.

## 13. Cron verification

Vercel deployment metadata mengenali:

- path: /api/sync/google-sheets
- deployed schedule: 0 22 * * *

Workspace saat ini memiliki vercel.json dengan schedule 0 22 * * *. Schedule
tersebut berarti 22:00 UTC, yaitu 06:00 WITA pada hari berikutnya. Schedule
Production sebelumnya adalah 0 1 * * *; deployment Phase 6D-C telah mengoreksi
nilai aktif dan keduanya sekarang MATCH.

Result: **PASS**.

## 14. Google Sheets verification

Nama konfigurasi Google Production tercatat pada Vercel:

- GOOGLE_SHEETS_CREDENTIALS_PATH
- GOOGLE_SERVICE_ACCOUNT_EMAIL
- GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
- GOOGLE_SHEETS_SPREADSHEET_ID
- GOOGLE_SHEETS_CACHE_TTL

Value tidak dibaca. Local sync:verify-config Phase 6C PASS, tetapi worksheet
discovery dan Google API read live belum dijalankan.

Result: **PARTIAL; live Google configuration/discovery NOT TESTED**.

## 15. Sync verification

Probe aman terhadap sync endpoint:

| Request | Result | Evidence |
| --- | --- | --- |
| Missing Authorization | DENIED | HTTP 401, JSON shape hanya message dan status |
| Wrong bearer value | DENIED | HTTP 401, JSON shape hanya message dan status |
| Correct bearer | NOT TESTED | Akan masuk ke jalur write-capable sync dan memerlukan approval eksplisit |

Tidak ada Google Sheets sync, import, registry update, atau idempotency run
yang dijalankan. rows inserted/updated/unchanged/failed tidak diklaim.

## 16. Migration separation

Tidak ada migration deploy, migration resolve, schema mutation, atau data
migration yang dijalankan.

Evidence yang tersedia:

- vercel.json hanya mendeklarasikan sync Cron;
- project build command adalah npm run build / next build;
- local Phase 6B migration preflight dan migrate-status PASS;
- 100 request-log records terbaru dari deployment yang diperiksa secara
  agregat tidak memiliki migration execution marker;
- tidak ada Prisma connection error marker atau secret marker pada records
  tersebut.

Request logs bukan build log lengkap, sehingga pemeriksaan ini mencatat runtime
log evidence dan deployment Ready, bukan klaim bahwa seluruh raw build log
telah dicetak.

Accounting: migration deploy = 0, migration resolve = 0.

## 17. Error sanitization

Unauthorized sync responses tidak mencetak credential, connection string,
authorization header, stack trace, atau provider response; hanya shape
response dan status yang direkam.

Agregasi 100 request-log records:

| Signal | Count/result |
| --- | --- |
| Server-error records | 0 |
| Error/fatal records | 0 |
| Secret material marker | false |
| Raw Prisma connection marker | false |
| Migration execution marker | false |

Tidak ada controlled 500 scenario yang dipicu.

Result: **PASS dengan scope terbatas pada probe dan log sample**.

## 18. Security headers

Header yang terlihat pada /, /login, redirected /dashboard, dan
/api/auth/session:

| Header | Value |
| --- | --- |
| Strict-Transport-Security | max-age=31536000 |
| Content-Security-Policy | absent |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| X-Frame-Options | DENY |
| Permissions-Policy | camera=(), microphone=(), geolocation=() |

Basic header gate: **PASS**. CSP absent dicatat sebagai **REVIEW**, bukan
alasan untuk menambah konfigurasi secara otomatis pada phase ini.

## 19. Legacy authentication verification

Live Auth.js provider discovery hanya menunjukkan credentials. Local
Phase 6C static/security/build checks juga PASS untuk arsitektur
Auth.js Credentials → Prisma → PostgreSQL/Supabase.

Tidak ada indikasi provider Supabase Auth atau Resend pada public runtime
probe. Artefak database PasswordResetToken yang dipertahankan tidak
dianggap sebagai bukti password recovery aktif.

Result: **PASS pada evidence source/runtime dan minimum authenticated flow**.

## 20. Findings

### F-6D-01 — Production Auth E2E credential unavailable (RESOLVED)

Credential Production tersedia melalui file lokal yang di-ignore Git, target
E2E adalah domain Production, dan sequence wajib berhasil. Value credential
tidak dicatat atau ditampilkan. AUTH_TEST_SECRET kemudian tersedia dan
supplemental signed operator-role check juga PASS tanpa login ulang.

Admin login, authenticated session, dashboard minimum read, refresh, logout,
dan guest protection setelah logout telah diberi PASS melalui satu sequence.

### F-6D-02 — Deployment source provenance (RESOLVED)

Metadata Production terbaru menunjuk
Adhitya-RZEN/dashboard.energi-primer, ref NextJs, commit 09363e... Checkout
lokal menunjuk remote repository DASHBOARD-BATU-BARA-PLN-JERANJANG dan branch
NextJs; local HEAD terbaru adalah commit 09363e739d5dc4ca5931724bd63d1c21ca293ca6
dan deployed commit tersedia pada local Git object database dengan hash yang
identik.

Operator telah mengonfirmasi bahwa perbedaan nama repository adalah rename
yang disengaja. Dengan branch, commit, critical file, dan runtime yang
konsisten, tidak ada evidence source drift.

### F-6D-03 — Live Cron schedule mismatch (RESOLVED)

Sebelum Phase 6D-C, deployment aktif melaporkan 0 1 * * * dan workspace
melaporkan */15 * * * *. Phase 6D-C mengubah hanya energiprimer-next/vercel.json
menjadi 0 22 * * * dan deployment Production terbaru sekarang melaporkan nilai
yang sama. Tidak ada remaining Cron mismatch.

### F-6D-04 — Production/Preview value separation not proven (MEDIUM / REVIEW)

Nama secret server tercatat pada scope Production dan Preview. Vercel CLI
menyembunyikan value dan pemeriksaan ini sengaja tidak melakukan env pull.
Nama yang sama tidak membuktikan value sama, tetapi juga tidak membuktikan
database/credential Preview sudah terisolasi.

### F-6D-05 — CSP absent (LOW / REVIEW)

Header CSP tidak terlihat pada public responses. Header web-security lainnya
terpasang. Tidak ada konfigurasi CSP baru yang ditambahkan karena phase ini
melarang patch tanpa defect acceptance yang sudah dikonfirmasi.

## 21. Incidents

Tidak ada incident database, migration, sync, credential exposure, atau
unexpected write yang teramati pada Phase 6D. Successful Auth.js login
menghasilkan satu expected authentication write yang tidak disertai mutation
lain. Satu percobaan deployment CLI sebelumnya berstatus ERROR dan tidak
menjadi alias Production aktif; deployment operator terbaru berstatus READY dan
menjadi target Production aktif.

Tidak ada env pull, secret output, migration, atau operasi database lain.
Deployment Phase 6D-C hanya membawa koreksi schedule pada vercel.json.

## 22. Remediation

Urutan tindakan operator sebelum acceptance Phase 6D:

1. [COMPLETED — Phase 6D-D] Operator mengonfirmasi bahwa repository Vercel
   dashboard.energi-primer adalah rename/canonical source untuk workspace ini;
   branch NextJs dan commit Production 09363e... juga sama dengan local HEAD.
2. [COMPLETED — Phase 6D-C] Rekonsiliasi schedule Cron dan deploy koreksi
   melalui change window/operator deployment. Nilai final workspace dan
   Production adalah 0 22 * * *.
3. [COMPLETED — Phase 6D-D] Designated Production test admin digunakan melalui
   file lokal yang di-ignore Git dengan target Production; credential tidak
   dicetak.
4. [COMPLETED — Phase 6D-D] Satu auth E2E Production dijalankan: login,
   session, refresh, dashboard read, logout, dan guest protection. Tidak ada
   login loop.
5. Lakukan value-level separation review untuk Production/Preview tanpa
   mencetak value; khususnya database, Auth.js, Cron, dan Google credentials.
6. Jika CSP diwajibkan oleh release policy, lakukan hardening dalam phase
   terpisah setelah deficiency dikonfirmasi.

Phase 6E tidak dimulai otomatis.

## 23. Database write accounting

| Activity | Database write | Classification |
| --- | ---: | --- |
| Public GET /, /login, /dashboard, /api/auth/session | 0 observed | EXPECTED read-only |
| Auth.js providers/CSRF GET | 0 observed | EXPECTED read-only |
| Missing/wrong Cron bearer | 0 observed | EXPECTED denied before sync |
| Public JavaScript fetches | 0 observed | EXPECTED read-only |
| Vercel metadata/log inspection | 0 | EXPECTED read-only |
| Valid admin login | 1 expected auth write | users.last_login_at may update |
| Correct-secret sync | NOT TESTED | Potential business/registry writes; not approved |
| Migration/schema operation | 0 | PROHIBITED and not run |

Total non-authentication database writes observed during Phase 6D: **0**.
Authentication write accounting: **1 expected successful login write**;
timestamp value was not directly queried or modified.

## 24. Final acceptance matrix

| Check | Result | Evidence |
| --- | --- | --- |
| Production deployment | PASS | Vercel deployment target Production, Ready |
| Next.js framework detection | PASS | Vercel Framework Preset Next.js |
| Production domain | PASS | Canonical alias attached to active deployment |
| / | PASS | HTTP 200 on canonical domain |
| /login | PASS | HTTP 200 and login/password form present |
| Guest /dashboard protection | PASS | HTTP 307 to /login |
| Admin login | PASS | One successful Production login |
| Auth.js session | PASS | Authenticated session and refresh preserved |
| Admin authorization | PASS | Session role admin accepted |
| Logout | PASS | Session removed; dashboard redirected after logout |
| Database read | PASS (minimum) | Authenticated dashboard returned HTTP 200 |
| Dashboard rendering | PASS (minimum) | Overview marker rendered; granular KPI semantics not changed |
| Client/server secret boundary | PASS (limited) | 2 HTML pages and 10 JS assets clean |
| Production env names | PASS | Required names listed without values |
| AUTH_URL | PARTIAL | Name present; value intentionally not read |
| Production provenance | PASS | Operator-confirmed rename; local HEAD equals Production commit |
| Cron configuration | PASS | Active Production and workspace both use 0 22 * * * |
| Cron authentication | PARTIAL | Missing/wrong bearer denied; correct bearer not run |
| Google configuration | PARTIAL | Names present; values/discovery not tested |
| Google sync | NOT TESTED | Authorized write-capable path not invoked |
| Sync idempotency | NOT TESTED | No production sync run |
| Error sanitization | PASS (limited) | Safe 401 shape; 100 log records clean |
| Migration execution | PASS (limited) | No migration command run or marker observed |
| Database writes | PASS for observed scope | 0 observed; write-capable paths not run |
| Build | PASS | Deployment Ready and local production build PASS |
| Security headers | PASS basic / CSP REVIEW | HSTS, nosniff, Referrer, X-Frame, Permissions present |
| Legacy auth absence | PASS (limited) | Credentials provider only; local static checks PASS |

## 25. Final Phase 6D status

**PHASE 6D STATUS: PASS WITH LIMITED REVIEW**

Production public routing, Auth.js endpoints, negative Cron authorization,
deployment readiness, public client/server boundary, corrected Production Cron
schedule, provenance, and the minimum authenticated E2E passed. Remaining
items are limited review: Production/Preview secret-value separation and CSP.

Phase 6D-C substatus: **PASS WITH BLOCKED VERIFICATION**.  
Phase 6D-D substatus: **PASS WITH LIMITED REVIEW**.

No schema change, migration, sync, or destructive operation was made. One
expected Auth.js authentication write may have updated users.last_login_at.

## Source Provenance Reconciliation

Pemeriksaan ini memperbarui evidence dengan deployment Production terbaru yang
aktif setelah Phase 6D-C. Deployment aktif berasal dari ref NextJs dan
memiliki schedule Cron yang sudah dikoreksi.

Pada Phase 6D-D operator mengonfirmasi bahwa repository Vercel adalah rename
yang disengaja dari repository lokal. Pemeriksaan tidak melakukan fetch, pull,
push, merge, reset, perubahan setting Vercel, migration, atau perubahan
database.

## Local Repository Identity

| Field | Value |
| --- | --- |
| Local repository root | D:/TUGAS/DASHBOARD-BATU-BARA-PLN-JERANJANG |
| origin repository | Adhitya-RZEN/DASHBOARD-BATU-BARA-PLN-JERANJANG |
| Local branch | NextJs |
| Local HEAD | 09363e739d5dc4ca5931724bd63d1c21ca293ca6 |
| Last local commit | 09363e7 Merge branch 'NextJs' of GitHub repository into NextJs |

Remote URL diperiksa dengan sanitization; tidak ada authentication material
yang dicatat.

## Vercel Repository Identity

| Field | Value |
| --- | --- |
| Vercel project | projek-rzen/dashboard-energi-primer |
| Vercel repository | Adhitya-RZEN/dashboard.energi-primer |
| Vercel branch | NextJs |
| Production commit | 09363e739d5dc4ca5931724bd63d1c21ca293ca6 |
| Commit verification | metadata reports unverified; SHA equality verified locally |
| Production deployment | dpl_9sMiBr6141Yfs3mPDSqnJL9NV6hA |
| Deployment state | READY / Production |
| Canonical alias | dashboard-energi-primer.vercel.app |
| Root Directory | energiprimer-next |

Metadata diambil dari deployment Production terbaru, bukan URL Preview.

## Branch Comparison

| Item | Local | Vercel | Result |
| --- | --- | --- | --- |
| Branch | NextJs | NextJs | MATCH by name |
| Repository | DASHBOARD-BATU-BARA-PLN-JERANJANG | dashboard.energi-primer | MISMATCH |

Nama branch yang sama tidak cukup untuk membuktikan repository dan source
commit yang sama.

## Commit Comparison

| Item | Local | Vercel | Result |
| --- | --- | --- | --- |
| HEAD/deployment commit | 09363e739... | 09363e739... | MATCH |
| Deployment commit in local Git object database | present as local HEAD | same object | MATCH |
| Automatic fetch/pull | not run | not applicable | SAFE |

Perintah git cat-file terhadap commit Vercel menghasilkan object yang tersedia
sebagai local HEAD. Tidak ada fetch atau pull yang diperlukan. Karena working
tree source bersih terhadap HEAD, critical file comparison dapat dilakukan
terhadap commit yang sama.

## Critical File Comparison

| File/area | Local workspace | Vercel current deployment | Result |
| --- | --- | --- | --- |
| package.json | present; no Resend dependency | same Production commit | MATCH |
| package-lock.json | present; no Resend dependency | same Production commit | MATCH |
| next.config.ts | present | same Production commit; Next.js runtime detected | MATCH |
| vercel.json | sync path, schedule 0 22 * * * | sync path, schedule 0 22 * * * | MATCH |
| Auth.js architecture | src/auth.ts and Auth.js route present | /api/auth/providers exposes credentials provider | MATCH by commit/runtime |
| Dashboard route | protected dashboard route present and local build PASS | dashboard output present in READY deployment | MATCH by commit/runtime; data not tested |
| Auth API route | local Auth.js API route present | api/auth output present | MATCH by commit/runtime |
| Google sync route | local route present with cron boundary | api/sync/google-sheets output present | MATCH by commit/runtime; authorized sync not run |
| prisma/schema.prisma | present | same Production commit | MATCH |
| prisma/production/schema.prisma | present | same Production commit | MATCH |

Kesamaan route/runtime di atas tidak menggantikan perbandingan commit langsung.

## Phase 6C Remediation Verification

### Local evidence

- package.json dan package-lock.json tidak memiliki dependency Resend;
- directory legacy forgot-password, reset-password, dan src/lib/mail tidak
  memiliki source file tracked/aktif;
- tidak ada reference AUTH_MAILER, RESEND_API_KEY, atau RESEND_FROM_EMAIL
  pada source aktif;
- safe-error implementation tersedia;
- static Auth/security, lint, TypeScript, build, dan environment gates Phase
  6C telah PASS.

### Vercel runtime/build evidence

- deployment output berstatus READY;
- deployment output tidak memiliki route forgot-password, reset-password,
  atau resend;
- GET /forgot-password dan GET /reset-password/phase6d-probe returned 404;
- GET /api/auth/providers returned 200 dengan provider credentials saja;
- /login tidak memiliki legacy marker;
- 10 JavaScript assets Production terbaru tidak memiliki marker Resend,
  forgot-password, reset-password, server environment, atau credential material;
- unauthorized sync returned safe HTTP 401 JSON shape.

Result: **SOURCE CONSISTENT**.

Commit Production tersedia sebagai local HEAD dengan hash identik. Runtime
Production juga menunjukkan seluruh remediation Phase 6C yang diperiksa.

## Cron Source Comparison

| Source | Path | Schedule | Result |
| --- | --- | --- | --- |
| Local workspace vercel.json | /api/sync/google-sheets | 0 22 * * * | final workspace value |
| Vercel current deployment metadata | /api/sync/google-sheets | 0 22 * * * | deployed value |

Branch name sekarang sama-sama NextJs dan repository berbeda telah
dikonfirmasi operator sebagai rename yang disengaja. Schedule tidak lagi
berbeda: workspace dan deployment aktif sama-sama menggunakan 0 22 * * *.

Classification: **MATCH; source commit equality verified**.

## Source Provenance Decision

Keputusan Phase 6D-D mengikuti Case A — VERIFIED:

**F-6D-02 STATUS: RESOLVED**

Alasan:

1. operator mengonfirmasi bahwa perbedaan nama repository adalah rename yang
   disengaja;
2. branch lokal dan Vercel sama-sama NextJs;
3. local HEAD dan Production commit sama-sama
   09363e739d5dc4ca5931724bd63d1c21ca293ca6;
4. commit Production tersedia di local Git object database;
5. critical files pada commit tersebut konsisten dengan runtime Production;
6. schedule Cron lokal dan Production sama-sama 0 22 * * *;
7. tidak ditemukan evidence source drift pada public runtime atau build.

**PHASE 6D-D PROVENANCE: VERIFIED**

Authenticated Production E2E telah dijalankan tepat satu kali. Tidak ada login
ulang; supplemental authorization check dilakukan terpisah tanpa session admin.

## Phase 6D-C Result

Catatan: bagian ini adalah snapshot hasil Phase 6D-C sebelum credential
Production tersedia. Hasil authenticated E2E terbaru pada Phase 6D-D di bawah
ini menjadi hasil final.

### 1. Cron Schedule

Previous workspace: */15 * * * *  
Previous active Production: 0 1 * * *  
Final workspace and Production: 0 22 * * *

22:00 UTC sama dengan 06:00 WITA pada hari berikutnya. Deployment terbaru
Production menggunakan schedule final tersebut.

### 2. Code Change

Hanya energiprimer-next/vercel.json yang diubah, tepat satu baris schedule.
Tidak ada perubahan source, schema, migration, data, atau konfigurasi lain.

### 3. Regression

| Check | Result |
| --- | --- |
| npm run lint | PASS |
| npx tsc --noEmit --incremental false | PASS |
| npm run sync:verify-cron-auth | PASS |
| npm run sync:verify-preview-write-safety | PASS |
| npm run build | PASS |
| JSON schedule parse | PASS |
| Git diff | PASS — hanya perubahan schedule yang dimaksud |

Perubahan kemudian dibuat dalam commit terfokus.

### 4. Deployment

Production deployment: **PASS**  
Framework: Next.js  
Deployment ID: dpl_9sMiBr6141Yfs3mPDSqnJL9NV6hA  
Deployment URL: dashboard-energi-primer-ews0odvph-projek-rzen.vercel.app  
Canonical URL: dashboard-energi-primer.vercel.app  
Branch: NextJs  
Vercel commit: 09363e739d5dc4ca5931724bd63d1c21ca293ca6  
Ready state: READY  
Cron metadata: /api/sync/google-sheets at 0 22 * * *

GET /login: **PASS**, HTTP 200, login/password form tersedia, tanpa platform
404. Guest GET /dashboard juga tetap diarahkan ke /login.

### 5. Cron Security

Missing secret dan invalid bearer: **PASS** — keduanya HTTP 401 dengan JSON
shape aman. Authorized endpoint test: **BLOCKED** — production CRON_SECRET
tidak tersedia secara aman pada runner; endpoint sync bersifat write-capable
dan tidak dipanggil.

### 6. Authentication

Production admin login: **BLOCKED — production credential unavailable to runner.**
Guest dashboard protection: **PASS**. Authenticated admin E2E dan logout:
**BLOCKED** karena credential Production tidak tersedia.

### 7. Database Safety

Production migration executed: NO  
Schema changed: NO  
Migration resolve executed: NO  
Database reset: NO  
Destructive operation: NO  
Production DB writes observed: 0; valid auth dan authorized sync tidak
dijalankan.

### 8. Git

Commit: 27006b4  
Message: fix: schedule production sheets sync at 06:00 WITA

Metadata deployment Production menggunakan commit Vercel 09363e..., bukan
commit lokal 27006b4. Catatan ini mempertahankan finding provenance F-6D-02.

### 9. Final Status

**PHASE 6D-C STATUS: PASS WITH BLOCKED VERIFICATION**

Overall Phase 6D tetap **BLOCKED** karena authenticated Production E2E belum
dapat dilakukan. Provenance source F-6D-02 sudah direkonsiliasi pada Phase
6D-D; value-level separation Production/Preview masih menjadi review. Phase 6E
tidak dimulai.

## PHASE 6D-D RESULT

### 1. Production Provenance

Local repository: Adhitya-RZEN/DASHBOARD-BATU-BARA-PLN-JERANJANG  
Vercel repository: Adhitya-RZEN/dashboard.energi-primer  
Local branch: NextJs  
Vercel branch: NextJs  
Local HEAD: 09363e739d5dc4ca5931724bd63d1c21ca293ca6  
Production deployment: dpl_9sMiBr6141Yfs3mPDSqnJL9NV6hA  
Production commit: 09363e739d5dc4ca5931724bd63d1c21ca293ca6  
Provenance classification: **VERIFIED**

Operator mengonfirmasi bahwa perbedaan nama repository adalah rename yang
disengaja. Branch sama, commit Production tersedia di local Git object database
dan hash-nya identik dengan local HEAD, critical files konsisten, serta tidak
ada evidence source drift pada runtime Production.

### 2. Production Deployment

Deployment: **PASS**  
Status: READY  
Production URL: https://dashboard-energi-primer.vercel.app  
Framework: Next.js

Deployment aktif adalah dpl_9sMiBr6141Yfs3mPDSqnJL9NV6hA pada target Production.

### 3. Cron

Local: 0 22 * * *  
Production: 0 22 * * *  
06:00 WITA: **PASS**

Path yang diverifikasi adalah /api/sync/google-sheets. Nilai 0 22 * * * berarti
22:00 UTC atau 06:00 WITA pada hari berikutnya.

### 4. Public Runtime

| Check | Result | Evidence |
| --- | --- | --- |
| /login | PASS | HTTP 200; login/password form tersedia |
| /api/auth/providers | PASS | HTTP 200; hanya provider credentials |
| Guest /dashboard protection | PASS | HTTP 307 menuju /login |
| Forgot-password route | PASS | HTTP 404 |
| Reset-password route | PASS | HTTP 404 |
| Public secret boundary | PASS | 10 JavaScript assets dan public HTML tidak memiliki marker secret |

Anonymous /api/auth/session juga returned HTTP 200 tanpa session user.

### 5. Authentication E2E

| Check | Result |
| --- | --- |
| Production admin login | PASS |
| Authenticated session | PASS |
| Dashboard | PASS |
| Refresh/session persistence | PASS |
| Logout | PASS |
| Guest access after logout | PASS |

Satu successful login sequence dijalankan menggunakan credential Production
dari file lokal yang di-ignore Git. Tidak ada login retry, cookie, token, atau
password yang dicetak.

### 6. Database

Migration executed: NO  
Schema changed: NO  
Database reset: NO  
Destructive operation: NO  
Expected authentication write: **YES — one expected login write**  
Other database writes: **0 observed; authorized sync not tested**

Dashboard authenticated read berhasil dengan HTTP 200 dan overview marker.
Tidak ada direct database mutation atau migration command.

### 7. Google Sheets / Cron

Missing secret: **PASS** — HTTP 401  
Wrong secret: **PASS** — HTTP 401  
Authorized sync: **NOT TESTED**

NOT TESTED — write-capable operation not approved. CRON_SECRET Production
tidak dibaca atau digunakan.

### 8. Production/Preview Environment

Required variable names/scopes: **PASS**  
Value-level separation: **PARTIAL**

Nama variable wajib tersedia pada scope Production dan Preview. Value tidak
dibaca, dibandingkan, atau dicetak; tidak ada vercel env pull.

### 9. Regression

Lint: **PASS**  
TypeScript: **PASS**  
Build: **PASS**

Script sync:verify-cron-auth dan sync:verify-preview-write-safety juga PASS.

### 10. Write Accounting

| Operation | Writes |
| --- | ---: |
| Public probes | 0 |
| Cron negative tests | 0 |
| Admin login | 1 expected authentication write |
| Dashboard read | 0 |
| Logout | 0 |
| Authorized sync | 0 — not tested |
| Migration | 0 |
| Schema change | 0 |

## Phase 6D-D Final Status

**PHASE 6D-D: PASS WITH LIMITED REVIEW**

Provenance Production sudah **VERIFIED** dan seluruh pemeriksaan publik,
negative Cron auth, environment metadata, regression, dan authenticated
Production E2E PASS. Remaining review terbatas pada value-level
Production/Preview separation dan CSP. Phase 6E belum dimulai.

## Phase 6D-D E2E Recheck

Production authenticated E2E diulang khusus pada 2026-09-03. Prasyarat
credential diperiksa tanpa menampilkan value:

- AUTH_TEST_ADMIN_EMAIL pada process environment: ABSENT
- AUTH_TEST_ADMIN_PASSWORD pada process environment: ABSENT
- AUTH_TEST_BASE_URL pada process environment: ABSENT
- .env.e2e.local: field admin credential tersedia dan target Production;
  AUTH_TEST_SECRET tersedia

Hasil E2E minimum: **PASS**. Supplemental signed operator-role check: **PASS**.

Evidence tersanitasi: tepat satu credentials callback HTTP 302, satu signout
HTTP 302, authenticated session HTTP 200, dashboard HTTP 200, dan request
setelah logout kembali HTTP 307 ke /login. Supplemental operator request juga
ditolak ke /login dengan databaseWrites 0. Tidak ada login retry, session
cookie, token, atau password yang dicetak. Satu expected Auth.js write dapat
memperbarui users.last_login_at; tidak ada write lain yang dijalankan.
