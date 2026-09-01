# Sync Registry & Idempotency Hardening

Tanggal audit: 1 September 2026 (Asia/Makassar)
Environment: PostgreSQL lokal, database dashboard_pln
Scope data: Januari26-BB sampai Juli26-BB
Scope implementasi: automatic admission untuk worksheet BB setelah Juli26-BB
Status final: BLOCKED untuk gate verifikasi penuh; jalur kode auto-sync siap secara teknis dengan review registry historis yang masih terbuka.

## Objective

Phase ini memperkuat registry worksheet, identitas sumber, deteksi perubahan,
retry, lease concurrency, schema gate, dan keamanan scheduler. Tambahan
kebutuhan operasional adalah:

- worksheet baru setelah Juli26-BB dideteksi melalui discovery;
- worksheet yang valid, sudah jatuh tempo, dan bentuknya sama dengan Juli26-BB
  dapat diproses otomatis;
- worksheet yang belum jatuh tempo, bukan worksheet BB, duplicate period, atau
  berubah schema tidak boleh di-import otomatis;
- pemrosesan production/Supabase belum dijalankan pada Phase 17.

Tidak ada perubahan database schema, migration, prisma db push, full import,
production sync write, perubahan Google Sheets, perubahan Laravel, atau
deployment pada audit ini.

## Current Architecture

Alur yang digunakan:

    authorized cron request
            |
            v
    Google Sheets metadata discovery
            |
            +--> stable sheetId -> sync_worksheets registry
            |
            v
    automatic BB admission policy
            |
            +--> period due and after Juli26-BB
            +--> canonical Juli26-BB schema fingerprint
            +--> dynamic parser/import validation
            +--> stable-key duplicate detection
            |
            v
    change classifier (INSERT / UPDATE / SKIP)
            |
            +--> changed rows only -> existing transactional importer
            +--> unchanged rows -> no import write
            |
            v
    sync_row_states + sync_runs + worksheet status

Discovery tetap broad agar tab baru tidak terlewat. Importer tidak mengambil
semua hasil discovery secara otomatis: scheduler memakai policy automatic.
Juli26-BB adalah mapping/schema reference, bukan sumber nilai untuk periode
lain.

## Existing Sync Registry

Registry existing memakai tabel berikut:

| Registry | Peran |
| --- | --- |
| sync_sources | satu source Google Spreadsheet berdasarkan stable source key |
| sync_worksheets | satu baris per stable Google sheetId, judul mutable |
| sync_runs | audit per eksekusi: trigger, status, row counters, duration, error summary |
| sync_row_states | stable source key dan canonical content hash per worksheet |
| sync_schema_changes | perubahan schema yang menunggu review |
| spreadsheet_import_runs | provenance/import transaction dan checksum |
| spreadsheet_import_staging | raw/normalized staging dengan sumber worksheet dan row |

Hasil live read-only:

- 199 worksheet terdaftar pada spreadsheet;
- 55 worksheet memiliki format BB yang valid;
- 7 worksheet scope ditemukan tepat satu per period;
- Juli26-BB berstatus ACTIVE, memiliki 352 row states;
- Januari26-BB sampai Juni26-BB memiliki domain data hasil import, tetapi
  registry row-state/schema approval belum dipersistenkan.
- Audit metadata live pada 1 September 2026 belum menemukan worksheet BB yang
  sudah due setelah Juli26-BB (`dueAfterJuli=[]` dan `futureAfterCurrent=[]`).
  Artinya jalur automatic sudah tersedia, tetapi belum ada kandidat worksheet
  baru yang dapat diproses pada audit ini.

rowCount pada enam worksheet legacy bernilai metadata physical range (592),
bukan jumlah normalized plan rows. Nilai plan sebenarnya adalah 352, 319, 352,
341, 352, dan 341.

## Worksheet State

Status yang tersedia di schema existing adalah:

| Existing state | Makna operasional |
| --- | --- |
| DISCOVERED | metadata ditemukan, belum berhasil disetujui/sync |
| VALIDATED | plan lulus validasi sebelum commit |
| ACTIVE | worksheet berhasil diproses dan row state/schema snapshot tersedia |
| SCHEMA_REVIEW | import ditahan karena perubahan/ambiguity schema atau validasi |
| DISABLED | sengaja tidak diproses |
| MISSING | sebelumnya ada, tidak ditemukan pada discovery terakhir |
| ERROR | kegagalan read/commit terakhir |

SYNCED, BLOCKED, dan PARTIAL belum menjadi enum state worksheet tersendiri.
Status run sudah memiliki SUCCESS, PARTIAL, FAILED, dan LOCKED. Menambah state
persisted baru memerlukan migration additive dan approval manual; tidak
dilakukan di sini.

## Schema Approval

Juli26-BB digunakan sebagai canonical schema reference. Automatic admission
untuk worksheet setelah Juli26-BB memerlukan:

1. worksheet title cocok dengan pola bulan Indonesia + YY-BB;
2. period lebih besar dari Juli 2026 dan tidak lebih besar dari period UTC saat
   scheduler berjalan;
3. canonical schema snapshot Juli tersedia;
4. semantic schema fingerprint sama dengan canonical snapshot;
5. parser/import plan berstatus READY_FOR_IMPORT;
6. tidak ada duplicate stable source key.

Perubahan header, kolom hilang/tambah, rename ambigu, duplicate header, atau
perubahan observed value type menghasilkan SCHEMA_REVIEW. Reorder kolom yang
tidak mengubah semantic signature tidak dianggap perubahan.

## Mapping Version

Automatic path memiliki konstanta code-level:

    profile: BB_CANONICAL_V1
    version: 1
    reference: Juli26-BB

Versi tersebut belum disimpan sebagai kolom khusus pada sync_worksheets atau
sync_runs. Ini dicatat sebagai PROVENANCE_GAP; penambahan kolom atau tabel
mapping version membutuhkan schema review dan tidak dilakukan pada Phase 17.

## Source Identity

Identity dibuat deterministik dari canonical business fields, termasuk:

- entityType;
- periodStart atau readingDate;
- targetYear untuk target tahunan;
- unit canonical (Unit 1, Unit 2, Unit 3);
- supplier canonical token;
- unit pengukuran.

Nomor row dan alamat cell sengaja tidak masuk identity. Dengan demikian reorder
atau insert row di tengah worksheet tidak membuat record lama menjadi record
baru. Identity target menggunakan tahun target dan awal tahun sebagai period
canonical; identity cumulative memakai period snapshot.

Normalisasi unit hanya menerima Unit 1 sampai Unit 3. Tidak ada Unit 2 kedua
atau Unit di luar tiga unit yang dimasukkan otomatis.

## Content Hash

Content hash memakai stable identity dan normalized value. Untuk receipt
biomassa, supplierName juga menjadi bagian seed canonical agar perubahan nama
yang material dapat terdeteksi. Raw formatting, row number, dan cell address
tidak menyebabkan UPDATE palsu.

Worksheet content hash mengurutkan pasangan sourceKey:contentHash, sehingga
urutan physical row tidak memengaruhi checksum. Nilai NULL dan 0 tetap
berbeda.

Import plan sekarang membawa checksum deterministik. Successful import dengan
source, worksheet, range, period, dan checksum yang sama dapat direuse tanpa
membuat normalized transaction kedua.

## Insert Rule

INSERT hanya untuk stable source identity yang belum ada pada sync_row_states.
Nomor row bukan dasar INSERT. Row yang berubah posisi tetapi memiliki identity
lama tidak di-insert ulang.

## Update Rule

UPDATE hanya ketika stable identity sama tetapi canonical content hash berubah.
Changed rows saja yang dimasukkan ke write plan. Upsert existing normalized model
tetap menjadi proteksi database kedua.

## Skip Rule

SKIP ketika stable identity dan canonical content hash sama. Row SKIP tidak
masuk write plan dan tidak menghasilkan database write normalized.

## Retry Safety

Retry dibatasi dan dipisahkan:

- Google: rate limit, timeout, dan API 5xx yang transient;
- database: connection unavailable, operation/pool timeout, connection closed,
  dan transaction conflict/deadlock;
- authentication, permission, validation, schema, dan constraint error tidak
  diulang secara membabi buta.

Importer memakai transaction untuk staging, normalized upsert, dan status
successful import. Karena status import dan normalized writes commit atomically,
timeout setelah transaction commit dapat ditemukan kembali melalui checksum.
Tidak ada cascade delete atau delete propagation.

Keterbatasan: tabel spreadsheet_import_runs belum memiliki unique constraint
atas checksum. Lease melindungi orchestrator sync normal; pemanggilan importer
langsung secara bersamaan harus tetap diserialkan secara operasional sampai
constraint additive disetujui.

## Concurrency

sync_sources.lock_token dan lock_expires_at dipakai sebagai lease atomic
melalui conditional updateMany. Hanya satu sync source yang boleh memegang
lease aktif; lease diperbarui sebelum setiap worksheet. Run kedua menerima
status LOCKED dan tidak memulai pemrosesan worksheet.

Lease source-level cukup untuk scheduler saat ini. Locking architecture baru
tidak ditambahkan.

## Cron Security

/api/sync/google-sheets hanya menerima request dengan:

    Authorization: Bearer <CRON_SECRET>

Perbandingan secret constant-time, secret tidak dikembalikan atau dilog,
request tidak dapat memilih spreadsheet/range/database target, dan error route
dikembalikan generik. Cron memakai scope automatic, bukan scope all.

vercel.json tetap menjadwalkan endpoint setiap 15 menit. Deployment dan
konfigurasi secret production belum dilakukan.

## Partial Failure

Kegagalan per worksheet dikembalikan sebagai hasil worksheet dan memengaruhi
status run aggregate (PARTIAL bila sebagian berhasil, FAILED bila seluruh
selected worksheet gagal). Worksheet lain tidak otomatis diubah menjadi
FAILED. Row state hanya dipersistenkan setelah commit plan dan state update
berhasil.

Kegagalan commit menandai worksheet ERROR; schema/duplicate/validation issue
menandai SCHEMA_REVIEW. Error detail teknis tidak dikembalikan ke browser.

## Schema Change Gate

Gate canonical baru dibangun pada bb-policy.ts. Untuk worksheet setelah
Juli26-BB, schema dibandingkan terhadap snapshot Juli, bukan terhadap snapshot
worksheet baru yang belum approved. Ini mencegah worksheet baru melakukan
auto-approval terhadap schema-nya sendiri.

| Kondisi | Keputusan |
| --- | --- |
| Agustus26-BB due + schema sama | automatic admission |
| September26-BB saat period masih Agustus | NOT_YET_DUE |
| tab bukan pola BB | NOT_BB_WORKSHEET |
| schema canonical belum tersedia | CANONICAL_SCHEMA_UNAVAILABLE |
| header/kolom/type berubah | SCHEMA_REVIEW |

Tab yang diblokir tetap dapat terlihat di registry untuk operator review dan
tidak di-import otomatis.

## Provenance

Provenance existing yang tersedia:

- stable Google sheet source key dan worksheet key (sheetId);
- worksheet title dan source range;
- source row/cell pada staging/normalized domain records;
- period/date/unit/supplier canonical fields;
- schema hash/snapshot pada worksheet yang sudah diproses;
- content hash pada row state;
- sync run/import run dan aggregate counters.

Gap yang ditemukan:

- enam worksheet historical belum memiliki row states/schema snapshot;
- tujuh historical manual import run tidak memiliki checksum;
- mapping profile/version belum menjadi field persisted;
- status SYNCED/BLOCKED belum menjadi state worksheet khusus.

Gap tersebut tidak diperbaiki melalui migration otomatis.

## Observability

sync_runs merekam start/end, trigger, worksheet/row counters, duration, status,
dan safe error summary. sync_worksheets merekam last seen/sync, row count,
schema/content hash, dan status. API hanya mengembalikan aggregate counters.

Live audit menghasilkan:

- database writes: 0;
- import/sync write: tidak dipanggil;
- duplicate business groups: 0;
- orphan relations: 0;
- before/after database snapshot: identik.

Alert delivery eksternal untuk run FAILED/PARTIAL belum dikonfigurasi.

## Error Classification

Klasifikasi bounded yang ditambahkan untuk safe operational reporting:

NETWORK, AUTHENTICATION, PERMISSION, RATE_LIMIT, TIMEOUT, API, SCHEMA,
PARSER, VALIDATION, IDENTITY, DUPLICATE, DATABASE, BUSINESS_RULE, dan
CONCURRENCY.

Kategori dicatat tanpa exception message sensitif. Google authentication,
permission, rate limit, timeout, dan network dibedakan; database Prisma
dibedakan dari parser/schema/identity/duplicate berdasarkan type/code/context.

## Database Constraints

Constraint existing yang relevan:

| Domain | Constraint utama |
| --- | --- |
| Biomass receipt | periodStart + supplierCode unique |
| Biomass consumption | unitId + readingDate unique |
| Coal receipt | periodStart unique |
| Coal consumption | unitId + date unique |
| Coal stock | date unique |
| Solar receipt | periodStart unique |
| Solar consumption | readingDate unique |
| HOP | unitId + readingDate unique |
| Biomass target | targetYear unique |
| Cumulative snapshot | periodStart unique |
| Sync worksheet | sourceId + worksheetKey unique |
| Sync row state | worksheetId + sourceKey unique |
| Sync source | sourceKey dan provider + externalId unique |

Hasil live audit: duplicate business-key groups 0, orphan relations 0.

SCHEMA_RECOMMENDATION: evaluasi unique constraint additive untuk
spreadsheet_import_runs pada identitas import/checksum bila direct concurrent
imports perlu didukung. Jangan menerapkan tanpa migration review dan approval.

## Vercel Compatibility

Implementasi scheduler tetap server-side dan memakai Node runtime. Google client
memakai native fetch, bounded timeout, service-account credentials server-side,
dan cache process-local. Prisma memakai singleton module reuse. Route mengatur
maxDuration = 300.

Hal yang masih perlu diverifikasi pada deployment:

- Vercel plan harus mengizinkan durasi yang dipilih;
- PostgreSQL production harus memiliki connection pooling yang sesuai;
- credential Google harus dimasukkan sebagai environment secret, bukan file
  workstation;
- CRON_SECRET, DATABASE_URL, dan konfigurasi Google harus tersedia;
- jika Supabase menjadi PostgreSQL target, gunakan DATABASE_URL/pooler yang
  telah disetujui; tidak ada kode Supabase atau deployment yang dijalankan pada
  Phase 17.

## Test Strategy

Test dibagi menjadi:

1. pure in-memory fixture untuk identity, hash, classification, row reorder,
   duplicate, retry, dan automatic admission;
2. live read-only source/database audit untuk parity, duplicate/orphan, snapshot,
   dan Juli regression;
3. lint, TypeScript, Prisma validation, build, dan existing regression scripts.

No-write rule diterapkan untuk Phase 17. discoverGoogleSheetsWorksheets dan
runGoogleSheetsIncrementalSync adalah operasi write-capable pada registry/run;
keduanya tidak dipanggil dalam live no-write audit.

## Regression Results

### Dataset parity

| Item | Actual |
| --- | ---: |
| Worksheet scope | 7/7 terbaca |
| Verified normalized rows | 2.409 |
| Import plan READY_FOR_IMPORT | 7/7 |
| Source-vs-database domain parity | 7/7 PASS |
| Unit | Unit 1, Unit 2, Unit 3 |
| Unexpected duplicate groups | 0 |
| Orphans | 0 |
| Target biomassa | 70.020 ton |
| Database snapshot delta | 0 |

### Juli26-BB regression

Juli26-BB tetap memiliki 352 source rows, 352 persisted row states, schema
MATCH, dan read-only classifier result:

    INSERT = 0
    UPDATE = 0
    SKIP = 352
    FAILED = 0

### Full seven-worksheet idempotency

Pure fixture 2.409 row menghasilkan target berikut tanpa write:

    INSERT = 0
    UPDATE = 0
    SKIP = 2.409
    FAILED = 0

Namun registry database aktual belum dapat membuktikan target tersebut untuk
enam worksheet legacy. Read-only classifier aktual terhadap registry mencatat:

| Worksheet group | Insert candidates | Update | Skip | Row states |
| --- | ---: | ---: | ---: | ---: |
| Januari26-BB sampai Juni26-BB | 2.057 | 0 | 0 | 0 |
| Juli26-BB | 0 | 0 | 352 | 352 |

Angka 2.057 adalah dry-run candidate, bukan write. Ini terjadi karena domain
data historical ada, tetapi state registry belum direkonsiliasikan. Karena itu
full seven-worksheet idempotency belum PASS.

## Test Report

| Test | Expected | Actual | Database Write | Status |
| --- | --- | --- | ---: | --- |
| Existing row unchanged | SKIP = 1 | SKIP = 1 | 0 | PASS |
| New row | INSERT = 1 | INSERT = 1 | 0 | PASS |
| Changed row | UPDATE = 1 | UPDATE = 1 | 0 | PASS |
| Row reorder | existing identity retained | key/hash unchanged | 0 | PASS |
| New row inserted in middle | one insert, old rows skip | INSERT = 1, SKIP = 3 | 0 | PASS |
| Duplicate source | duplicate detected, no merge | 1 duplicate detected | 0 | PASS |
| Existing DB identity | no second insert | stable key matches staging/import record | 0 | PASS |
| Retry | bounded transient retry; no unsafe auth retry | static retry/classification PASS | 0 | PASS |
| Concurrent sync | one lease holder; other blocked | atomic lease design verified statically | 0 | PASS WITH REVIEW |
| Schema change | block and create review signal | auto-admission fixture blocks added/missing schema | 0 | PASS |
| Juli26 regression | 0/0/352/0 | 0/0/352/0 read-only | 0 | PASS |
| Full 7 worksheet idempotency | 0/0/2.409/0 | fixture target passes; actual registry 2.057/0/352/0 | 0 | BLOCKED |

## Database Safety

Database snapshot sebelum dan sesudah live audit identik:

| Object | Before | After |
| --- | ---: | ---: |
| spreadsheet_import_runs | 12 | 12 |
| spreadsheet_import_staging | 3.919 | 3.919 |
| sync_sources | 1 | 1 |
| sync_worksheets | 199 | 199 |
| sync_runs | 8 | 8 |
| sync_row_states | 352 | 352 |
| sync_schema_changes | 0 | 0 |
| normalized/import/sync tables | 21 | 21 |

Tidak ada INSERT, UPDATE, DELETE, DROP, TRUNCATE, migration, db push, atau
migrate pada Phase 17.

BIOMASS_STOCK tetap OUT_OF_CURRENT_SCOPE dan tidak dimasukkan ke mapping,
database sync, KPI, atau chart.

## Known Limitations

1. Registry Jan-Jun belum memiliki row state/schema approval sehingga full
   idempotency gate belum dapat dinyatakan PASS.
2. Historical manual import runs tidak memiliki checksum; checksum berlaku
   untuk import/sync baru setelah hardening.
3. Mapping profile/version belum persisted.
4. spreadsheet_import_runs belum memiliki unique checksum constraint.
5. Discovery metadata physical row count berbeda dari normalized plan row count;
   keduanya memiliki makna berbeda dan tidak boleh disamakan.
6. Retry/concurrency live test yang menulis lease atau registry tidak dijalankan
   pada no-write audit ini; static fixtures dan audit code digunakan.
7. Alerting, production secret configuration, PostgreSQL pooler selection, dan
   Supabase/Vercel validation memerlukan deployment-stage review.
8. npm test belum tersedia sebagai script project.

## Production Recommendation

Sebelum mengaktifkan scheduler production:

1. lakukan controlled registry reconciliation untuk Januari-Juni dengan dry-run,
   approval schema snapshot, dan stable row-state seeding; jangan memakai row
   number sebagai identity;
2. ulangi audit sampai full scope menghasilkan INSERT=0, UPDATE=0,
   SKIP=2.409, FAILED=0;
3. review dan setujui rekomendasi unique checksum constraint bila direct
   concurrent importer diperlukan;
4. simpan mapping profile/version sebagai provenance hanya melalui perubahan
   schema additive yang disetujui;
5. evaluasi dependency finding Prisma deepmerge-ts secara terpisah—jangan
   menggunakan npm audit fix --force tanpa approval;
6. konfigurasi secret Google, DATABASE_URL, dan CRON_SECRET pada environment
   deployment; jangan commit file credential;
7. lakukan deployment-stage smoke test dengan database non-production terlebih
   dahulu.

## Final Status

| Gate | Status |
| --- | --- |
| Automatic future BB admission code | PASS |
| Deterministic identity/hash | PASS |
| Retry policy | PASS |
| Concurrency design | PASS WITH REVIEW (live no-write test tidak dilakukan) |
| Canonical schema gate | PASS |
| Cron authorization | PASS |
| Juli26 regression | PASS |
| Source/database parity 7 worksheet | PASS |
| Full 7 worksheet idempotency registry | BLOCKED |
| Database unchanged | PASS |
| No critical credential exposure | PASS |

PHASE 17 — SYNC HARDENING: BLOCKED

Blocker bukan kegagalan parser atau mismatch data. Blocker adalah registry
historis yang belum merekam state idempotensi untuk 2.057 row Januari-Juni,
sehingga sistem belum boleh mengklaim SKIP=2.409 pada full scope. Jalur cron
baru tetap aman: hanya worksheet BB setelah Juli yang due dan schema-compatible
yang diterima otomatis; worksheet schema drift/future/unrelated ditahan.

Tidak dilanjutkan ke Supabase, deployment, full import, atau Phase berikutnya.
