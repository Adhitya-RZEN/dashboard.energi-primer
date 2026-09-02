# Phase 6A - Migration Reconciliation

Tanggal audit: 2026-09-02  
Repository: `energiprimer-next`  
Target: Supabase PostgreSQL, database `postgres`, schema `public`

Audit ini dilakukan read-only terhadap migration state dan schema target. Phase
ini tidak menjalankan `prisma migrate deploy`, `prisma migrate resolve`,
`prisma migrate reset`, `prisma db push`, DDL/DML destruktif, atau operasi data
lainnya.

## 1. Executive Summary

Kesimpulan Phase 5 bahwa checksum belum jelas telah dijelaskan melalui forensik
line ending. Nilai SHA-256 `309D...` yang dicatat Phase 5 adalah hash working
copy Windows dengan CRLF. Setelah line ending dinormalisasi ke LF, hash SQL
production menjadi `f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c`,
persis sama dengan checksum pada `_prisma_migrations` dan blob Git.

Evidence database dan Prisma menunjukkan bahwa:

- `prisma/production/migrations/20260901130000_production_schema_baseline`
  adalah migration yang selesai diterapkan ke Supabase.
- `prisma/production/schema.prisma` dan SQL baseline menghasilkan schema yang
  sama dengan schema Supabase saat ini.
- Root history adalah Laravel-derived/legacy history dan tidak tercatat pada
  database Supabase. Root history tidak aman untuk dijalankan terhadap target
  tersebut.
- Tidak ada checksum repair atau history repair yang diperlukan untuk state
  saat ini.
- Repository belum memiliki workflow deployment migration yang aktif. Status
  migration production dapat diverifikasi, tetapi command deploy belum
  didefinisikan sebagai build/CI/Vercel workflow.

**Final Phase 6A status: CONDITIONALLY RESOLVED.** State current production
dan provenance artifact sudah dapat dipertanggungjawabkan; keputusan owner untuk
meratifikasi production history dan menetapkan workflow migration masih
diperlukan sebelum perubahan schema berikutnya atau release automation.

## 2. Repository Migration Histories

### Root history - `prisma/migrations/`

Root history berangkat dari asumsi bahwa tabel Laravel existing sudah ada.
Migration baseline-nya sendiri hanya marker no-op; migration sesudahnya bersifat
additive.

| Order | Migration | SQL/target | Klasifikasi | Inventory |
| --- | --- | --- | --- | --- |
| 1 | `0_baseline_existing_laravel_schema` | `migration.sql`; existing Laravel `public` schema | baseline/no-op | 0 table, 0 index; hanya komentar |
| 2 | `20260830140000_add_dashboard_import_domain` | `migration.sql`; existing Laravel DB | additive schema | 9 table, 14 index; import/staging/normalized domain |
| 3 | `20260830150000_add_coal_receipts` | `migration.sql`; existing Laravel DB | additive schema | 1 table, 2 index; coal receipt monthly grain |
| 4 | `20260830160000_add_sheets_sync_state` | `migration.sql`; existing Laravel DB | additive schema | 5 table, 10 index; sync registry/state |
| 5 | `20260830170000_add_sync_schema_snapshot` | `migration.sql`; existing Laravel DB | additive schema | 1 `ADD COLUMN`; `sync_worksheets.schema_snapshot` |

Total root history: 5 migration directories, 15 additive tables, 26 additive
indexes, dan satu additive column. Root directory tidak memiliki
`migration_lock.toml` pada working tree.

Root baseline SQL secara eksplisit menyatakan bahwa database sudah memiliki
tabel dan data Laravel serta marker harus ditandai applied sebelum migration
additive berikutnya dilacak. Itu tidak cocok dengan kondisi awal Supabase pada
Phase 21E, yang memiliki zero application tables.

### Production history - `prisma/production/migrations/`

| Order | Migration | SQL/schema target | Klasifikasi | Inventory |
| --- | --- | --- | --- | --- |
| 1 | `20260901130000_production_schema_baseline` | `prisma/production/schema.prisma` + `migration.sql`; clean Supabase application schema | full production baseline | 30 table, 270 column, 40 index, 30 primary key, 19 foreign key |

Production history memiliki `migration_lock.toml` dengan provider PostgreSQL.
SQL baseline hanya membuat schema/table/index/constraint yang diperlukan.
Static verifier tidak menemukan `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`,
`INSERT`, atau `CREATE TYPE`.

Kedua `schema.prisma` saat ini byte-identik pada working tree: 501 baris dan
SHA-256 `1919BD0616B232B1AF4E5BAE9A450B95E19F313414E1671E01A27B6FB9A08FD7`.

## 3. Database Migration State

Inspection dilakukan terhadap Supabase Direct Connection melalui child process;
connection string dan credential tidak dicatat.

| Field | Observed |
| --- | --- |
| Database | `postgres` |
| Role | `postgres` |
| Schema | `public` |
| PostgreSQL | 17.6 |
| Direct backend SSL | `true` |
| Public application tables | 30; plus `_prisma_migrations` |
| Migration rows | 1 |

### `_prisma_migrations`

| migration_name | checksum | finished_at | rolled_back_at | logs |
| --- | --- | --- | --- | --- |
| `20260901130000_production_schema_baseline` | `f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c` | `2026-09-01T12:08:42.361Z` | `NULL` | `NULL` |

Read-only command results:

- `prisma migrate status --schema prisma/production/schema.prisma`: exit 0,
  database schema up to date.
- `prisma migrate status --schema prisma/schema.prisma`: exit 1; 5 root
  migrations exist locally, last common migration is `null`, root history has
  pending entries, and the production baseline is absent from root history.
- No root migration row was found in the target database.

Internal reconciliation matrix:

| Repository migration | Database migration | Repository checksum | Database checksum | Status |
| --- | --- | --- | --- | --- |
| `0_baseline_existing_laravel_schema` | absent | not compared; no DB row | `-` | NOT APPLIED / legacy |
| `20260830140000_add_dashboard_import_domain` | absent | not compared; no DB row | `-` | NOT APPLIED / legacy |
| `20260830150000_add_coal_receipts` | absent | not compared; no DB row | `-` | NOT APPLIED / legacy |
| `20260830160000_add_sheets_sync_state` | absent | not compared; no DB row | `-` | NOT APPLIED / legacy |
| `20260830170000_add_sync_schema_snapshot` | absent | not compared; no DB row | `-` | NOT APPLIED / legacy |
| `20260901130000_production_schema_baseline` | present, finished, not rolled back | `f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c` after LF normalization | `f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c` | MATCH |

## 4. Checksum Forensics

### Mechanism and input

Pada Prisma 6.19.3 yang terpasang, migration checksum tervalidasi sebagai
SHA-256 lowercase hexadecimal atas isi `migration.sql` untuk migration
directory tersebut. Perbandingan CLI memperlakukan line ending CRLF dan LF
secara setara; evidence ini berasal dari hash byte variants dan hasil
`prisma migrate status` terhadap file working copy CRLF.

Input yang cocok dengan database adalah SQL body yang dimulai pada marker
`-- CreateSchema` di production migration. `migration_lock.toml`, nama schema
Prisma, dan keseluruhan file design dengan komentar header bukan input checksum
row tersebut.

### Byte/hash comparison

| Artifact | Bytes | Line ending | SHA-256 |
| --- | ---: | --- | --- |
| Working copy production `migration.sql` | 21,821 | 632 CRLF | `309d076106d4de2127733401909fffc1af77bf8cf8c92e7a324b68462ccf60af` |
| File sama setelah CRLF -> LF | 21,189 | LF | `f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c` |
| Git blob commit `2053890` | 21,189 | LF | `f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c` |
| Design artifact body mulai `-- CreateSchema`, LF-normalized | 21,189 | LF | `f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c` |
| Database recorded checksum | - | Prisma checksum | `f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c` |

Current working copy dan Git blob berbeda pada bytes karena `core.autocrlf=true`,
bukan karena SQL statement berubah. Setelah line ending dinormalisasi, body
design artifact dan production migration sama persis. Production
`migrate status` tetap PASS dengan working copy CRLF, yang mengonfirmasi bahwa
raw Windows SHA bukan pembanding yang tepat untuk checksum Prisma.

### Checksum interpretation

Phase 5 raw-hash comparison menghasilkan perbedaan yang nyata tetapi sudah
dijelaskan: **MISMATCH - EXPLAINED**. Tidak ada mismatch semantik pada checksum
Prisma current state dan tidak ada alasan untuk `migrate resolve`, mengedit SQL,
atau membuat migration palsu.

## 5. Production Schema Comparison

Schema production dibandingkan menggunakan dua jalur read-only:

1. `prisma migrate diff --from-url <Supabase Direct>` menuju
   `prisma/production/schema.prisma` menghasilkan empty migration.
2. Metadata verifier production membandingkan table, column, type, nullability,
   default, numeric precision/scale, primary key, foreign key/action, dan index.

| Object | Repository production baseline | Supabase current | Result |
| --- | ---: | ---: | --- |
| Application tables | 30 | 30 | MATCH |
| Public tables including `_prisma_migrations` | 30 + metadata | 31 | MATCH |
| Application columns | 270 | 270 | MATCH |
| Application indexes | 40 | 40 | MATCH |
| Application primary keys | 30 | 30 | MATCH |
| Foreign keys | 19 | 19 | MATCH |
| Enums | 0 | 0 | MATCH |
| Types/nullability/default/precision | exact artifact comparison | exact | MATCH |
| Foreign-key names/actions | exact artifact comparison | exact | MATCH |
| Prisma schema diff | empty migration | empty | MATCH |

Database row count yang sekarang populated tidak mengubah hasil schema parity;
itu adalah state data runtime setelah migration/data phase, bukan schema
mismatch.

**Schema parity: MATCH.** Tidak ada schema mutation dilakukan oleh Phase 6A.

## 6. Root vs Production History

| Aspect | Root History | Production History |
| --- | --- | --- |
| Origin | Laravel-derived baseline + additive Next.js migrations | Clean full production baseline |
| Intended DB | Existing Laravel/local PostgreSQL | Supabase clean application schema/current Supabase |
| Applied to current DB | No root row; status FAIL | One finished row; status PASS |
| Migration count | 5 directories | 1 directory |
| Current status | Last common `null`; production row missing locally | Up to date |
| Schema result against current DB | Not a safe deployment path | `migrate diff` empty; structural parity MATCH |
| Canonical candidate for Supabase | NO | YES |

### Root history safety answer

**Apakah root history aman digunakan terhadap Supabase current production? NO.**

Evidence-nya bukan asumsi nama folder: `_prisma_migrations` hanya berisi
production baseline, root status exit 1 dengan last common `null`, dan root
baseline adalah no-op yang mengasumsikan tabel Laravel sudah tersedia. Root
history tidak boleh dijalankan terhadap database Supabase yang sudah memiliki
30 application tables dan production metadata.

### Production history safety answer

**Production history aman untuk current Supabase baseline: YES, dengan syarat
workflow future tetap explicit dan owner-approved.** Migration yang tercatat
finished, checksum normalized match, status up to date, dan schema diff empty.
Ini tidak otomatis memberi izin untuk migration berikutnya atau cutover Vercel.

## 7. Git Provenance

### Repository facts

- Branch: `NextJs`; `origin/NextJs` menunjuk commit yang sama,
  `2053890 Production close`.
- Root migration files diperkenalkan oleh `60d0b81 Database and Source
  Changing` dan `cc05594 Mapping and render chart bug fix` pada 2026-08-30.
- Production schema, lock, dan baseline migration diperkenalkan bersama pada
  commit `2053890` oleh `Adhitya-RZEN` pada `2026-09-01 21:52:41 +0800`.
- Parent commit production (`cc05594`) belum memiliki path
  `prisma/production/`; Git tidak menunjukkan rename, edit setelah creation,
  atau history production baseline yang lebih tua.
- `prisma/production/schema.prisma` dan production migration SQL tidak berubah
  di working tree Phase 6A.

### WHO / WHEN / WHY

| Question | Evidence-backed answer |
| --- | --- |
| WHO | Git author production artifact: `Adhitya-RZEN`; database migration executed under role `postgres` menurut metadata. |
| WHEN | DB row selesai `2026-09-01T12:08:42.361Z` (`20:08:42.361 +0800`); Git artifact committed `21:52:41 +0800`. |
| WHY | Phase 21E report records that Supabase target had zero application tables, sehingga no-op Laravel baseline tidak sesuai; clean production baseline dipaketkan terpisah. |

`docs/SUPABASE_PHASE21E_SCHEMA_MIGRATION_REPORT_2026-09-01.md` dan source
`scripts/run-phase21e-schema-migration.mjs` merekam runner satu kali yang
menggunakan `prisma migrate deploy` pada child process, Direct Connection,
dan temporary staged migration. Runner mengambil SQL executable dari validated
Design Artifact mulai `-- CreateSchema`; body tersebut sekarang sama persis
dengan production migration setelah LF normalization.

Git tidak menyimpan shell transcript deployment atau salinan uncommitted yang
tepat pada detik migration dijalankan. Namun gap tersebut tidak menghasilkan
checksum ambiguity current state karena database checksum, Git blob, design
body, dan CLI status saling cocok.

**UNKNOWN:** exact pre-commit execution transcript dan byte copy yang berada di
staging directory saat deploy tidak tersedia di repository.  
**WHY:** database menyimpan migration name/checksum/status, bukan commit hash atau
shell transcript; production path baru masuk Git setelah target migration selesai.  
**EVIDENCE AVAILABLE:** finished `_prisma_migrations` row, exact normalized hash
match, empty `migrate diff`, Phase 21E report, dan guarded runner source.  
**RISK:** audit temporal yang membutuhkan bukti commit/artifact sebelum
`2026-09-01 20:08 +0800` tidak dapat dibuktikan hanya dari Git lokal.  
**NEXT REQUIRED EVIDENCE:** immutable deployment log/artifact archive dari
operator yang menjalankan Phase 21E, bila audit chain-of-custody formal wajib.  
**SAFE ACTION:** pertahankan production history dan jangan menjalankan history
repair; simpan checksum normalized dan log read-only pada setiap future release.

## 8. Deployment Migration Workflow

### Current repository/deployment audit

- `package.json` memiliki `build: next build`, tetapi tidak memiliki script
  migration deploy.
- `vercel.json` hanya menjadwalkan `/api/sync/google-sheets`; tidak menjalankan
  migration.
- Tidak ada `.github/workflows` pada repository ini.
- Build command tidak memilih `prisma/schema.prisma` atau
  `prisma/production/schema.prisma` untuk deploy migration.
- `supabase:production:migrate-status` adalah status check read-only yang
  explicit memakai `prisma/production/schema.prisma`.
- `scripts/run-phase21e-schema-migration.mjs` adalah guarded one-time operator
  runner, bukan workflow Vercel/CI. Ia memerlukan `--execute`, memakai temporary
  migration directory, dan tidak diekspos sebagai npm deployment script.

Required workflow answer:

```text
MIGRATION DEPLOYMENT WORKFLOW: UNDEFINED
```

| Item | Current answer |
| --- | --- |
| Current deployment migration command | UNDEFINED; tidak ada build/CI/Vercel auto-deploy |
| Current migration schema for status | `prisma/production/schema.prisma` |
| Current migration directory for status | `prisma/production/migrations/` |
| Migration schema/directory for automatic deploy | UNDEFINED; harus diputuskan owner |
| Database expected history | Production baseline `20260901130000_production_schema_baseline` |

Dokumentasi lama masih menjelaskan root Laravel baseline dan generic
`prisma migrate deploy` untuk future/local workflow. Dokumentasi tersebut tidak
boleh dibaca sebagai bukti bahwa Vercel saat ini menjalankan migration, dan perlu
penyelarasan setelah owner meratifikasi canonical history.

### Vercel risk

Karena tidak ada migration step pada build atau CI yang ditemukan, deploy aplikasi
baru tidak otomatis mengubah schema Supabase. Itu mengurangi risiko migration
otomatis yang salah, tetapi membuat schema/application compatibility bergantung
pada operator workflow yang belum didefinisikan. Menambahkan migration ke build
Vercel juga tidak boleh dilakukan tanpa approval karena dapat menjalankan DDL
pada production secara tidak terkontrol.

## 9. Canonical History Decision

```text
CANONICAL HISTORY CANDIDATE: B - PRODUCTION HISTORY
```

Alasan:

1. Satu-satunya row database yang selesai adalah production baseline.
2. Production baseline membuat seluruh 30 application tables yang dibutuhkan
   target clean Supabase.
3. `migrate status` production PASS dan root FAIL dengan no common migration.
4. `migrate diff` production schema terhadap database empty.
5. Artifact SQL, Git blob, design body, dan recorded checksum cocok setelah
   normalisasi line ending.
6. Root baseline no-op Laravel tidak merepresentasikan target Supabase awal
   maupun current migration state.

Root history tetap boleh dipertahankan sebagai history legacy/local yang
terpisah. Itu adalah separation by target, bukan alasan untuk merge, rename,
atau menghapus salah satu history.

**Canonical untuk Supabase: PRODUCTION.**  
**Canonical root legacy/local: ROOT, hanya untuk database yang memenuhi baseline
Laravel dan dengan workflow terpisah.**

## 10. Checksum Decision

```text
CHECKSUM STATUS: MISMATCH - EXPLAINED
```

| Required item | Decision |
| --- | --- |
| Expected canonical artifact | `prisma/production/migrations/20260901130000_production_schema_baseline/migration.sql`, LF-normalized SQL body |
| Observed database checksum | `f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c` |
| Phase 5 repository raw SHA | `309d076106d4de2127733401909fffc1af77bf8cf8c92e7a324b68462ccf60af` |
| Explanation | Windows working copy has 632 CRLF; Git blob/database comparison uses 632 LF lines |
| Evidence | normalized file hash = Git blob hash = DB checksum; production status PASS; diff empty |
| Risk | generic raw-byte verifier dapat false-fail pada Windows; bukan evidence schema/data corruption |
| Safe reconciliation method | Tidak melakukan reconciliation database; normalize line endings before forensic hash and use production path |
| Required owner approval | Ratifikasi canonical history/workflow untuk future changes; tidak diperlukan `resolve` untuk current row |

Tidak ada SQL migration yang diedit untuk mengejar checksum. Perubahan Phase 6A
hanya memperbaiki verifier agar memakai canonical path dan line-ending
normalization.

## 11. Verifier Assessment

| Verifier | Assessment | Evidence / action |
| --- | --- | --- |
| `db:verify-import-schema` | NEEDS UPDATE -> corrected | Sebelumnya hardcode tiga root migration dan FAIL pada target production. Sekarang package script memakai `--history=production`; script mendukung `--history=root` untuk legacy/local. Current run PASS dan menampilkan `allNewTablesEmpty: false` tanpa menganggap populated data sebagai migration failure. |
| `verify-supabase-production-schema.mjs` | NEEDS UPDATE / historical gate | Sekarang membaca production schema dan canonical SQL dengan LF normalization; structural parity dan checksum PASS. Invocation tetap FAIL hanya pada `unexpected business rows found after schema migration` karena verifier ini empty-target gate dan database sekarang memiliki 8,951 rows. Gate tidak dilonggarkan. |
| `verify-production-schema-baseline-design.mjs` | PASS | Static design artifact berada di luar migration directory; 30 model/table, 40 index, 19 FK, dan forbidden operation checks PASS. |
| `supabase:production:migrate-status` | PASS | Read-only status memakai production schema/directory; database up to date. |
| `run-phase21e-schema-migration.mjs` | BLOCKED by safety mode without `--execute` | Tidak dipanggil dengan `--execute` pada Phase 6A; historical runner bukan deployment automation. |

Perubahan verifier dilakukan karena evidence canonical sudah jelas dan tidak
menyentuh production data. Tidak ada perubahan yang dibuat hanya untuk
menyembunyikan status migration.

## 12. Risks

- Workflow deploy migration belum didefinisikan; future schema change dapat
  salah dibuat di root history atau dilewati saat release.
- Root dan production schema file saat ini sama, sehingga operator dapat salah
  mengira kedua migration directory interchangeable. Directory/history tetap
  berbeda secara provenance dan database state.
- Dokumen generic/local yang masih menyebut root `migrate deploy` dapat
  menyesatkan operator Supabase.
- Raw SHA tools yang tidak menormalisasi CRLF/LF akan menghasilkan false alarm
  pada Windows.
- Exact execution transcript sebelum commit production tidak ada di Git; audit
  chain-of-custody formal masih memerlukan artifact/log operator.
- Vercel live deployment, Preview target, dan cutover tetap berada pada blocker
  Phase 5; Phase 6A tidak mengubah atau memverifikasinya.
- Tidak ada rollback/destructive strategy yang boleh diasumsikan dari migration
  history ini; perubahan salah harus ditangani melalui backup/clone dan owner
  approval.

## 13. Recommended Reconciliation Plan

Tidak ada reconciliation database yang aman atau diperlukan sekarang. Rencana
canonical yang direkomendasikan:

1. Owner meratifikasi `prisma/production/` sebagai canonical Supabase history
   dan menetapkan root history sebagai legacy/local-only.
2. Future production migrations dibuat dan direview di
   `prisma/production/migrations/`, dengan
   `prisma/production/schema.prisma` sebagai target schema. Root history tidak
   boleh menerima migration Supabase secara incidental.
3. Tetapkan workflow operator/CI terpisah yang menjalankan migration hanya pada
   change window yang disetujui, memakai Direct Connection yang sesuai; build
   Vercel hanya generate/build dan tidak menjalankan DDL.
4. Tambahkan preflight wajib: target identity, backup/restore evidence,
   `migrate status`, normalized checksum, schema diff, dan read-only post-check.
5. Selaraskan dokumentasi root-vs-production dan pertahankan opsi verifier
   `--history=root` hanya untuk target yang benar-benar legacy.
6. Pertimbangkan policy repository `*.sql` dengan EOL LF agar forensic hash
   Windows tidak membingungkan; ini tidak memerlukan edit isi migration SQL.
7. Jika owner ingin satu unified history, lakukan design/rehearsal pada
   disposable clone terlebih dahulu. Jangan merge, rename, menghapus history,
   `migrate resolve`, atau mengubah `_prisma_migrations` pada current production
   tanpa keputusan dan approval terpisah.

Safe action saat ini: tidak melakukan apa pun pada database migration metadata;
production row sudah konsisten dengan canonical artifact.

## 14. Required Owner Decisions

1. Setujui secara formal pilihan **B - Production history** sebagai canonical
   Supabase history.
2. Putuskan apakah root history dipelihara sebagai legacy/local history
   terpisah atau akan dianalisis ulang pada phase repository governance yang
   berbeda.
3. Tetapkan command, schema, directory, connection mode, approval gate, dan
   rollback/backup owner untuk future production migration.
4. Putuskan apakah workflow migration manual/CI akan dibuat; jangan
   mengaktifkan migration otomatis pada Vercel build berdasarkan report ini saja.
5. Setujui perubahan verifier Phase 6A dan dokumentasi yang perlu diselaraskan.
6. Selesaikan gate Vercel live/cutover Phase 5 sebelum menyatakan aplikasi
   release-ready secara keseluruhan.

## 15. Final Phase 6A Status

```text
Overall: CONDITIONALLY RESOLVED
Canonical history: PRODUCTION (candidate B)
Supabase migration state: PASS
Schema parity: PASS
Checksum: MISMATCH-EXPLAINED
Deployment migration workflow: UNDEFINED
Root history safe for Supabase: NO
Production history safe for Supabase: YES (current baseline; future changes require approval)
Verifier: NEEDS UPDATE (production mode corrected; empty-target historical gate retained)
Database writes: 0
Migration deploy: NOT RUN
Migration resolve: NOT RUN
Destructive operations: NONE
```

Files changed by Phase 6A:

- `scripts/verify-import-schema.mjs` - explicit `production`/`root` history mode.
- `scripts/verify-supabase-production-schema.mjs` - canonical production
  schema/migration input and LF-normalized checksum.
- `package.json` - `db:verify-import-schema` defaults to `--history=production`.
- `docs/PHASE6A_MIGRATION_RECONCILIATION_2026-09-02.md` - this report.

Migration SQL, Prisma schema, `_prisma_migrations`, production data, Vercel
configuration, credentials, dan authentication architecture tidak diubah oleh
Phase 6A.

Remaining decisions:

- owner ratification of production canonical history;
- future migration deployment workflow and backup/rollback ownership;
- documentation/governance for the intentionally separate root history;
- Vercel live/cutover approval from Phase 5.

Recommended next action: owner review report ini, ratifikasi canonical
production path, lalu buat/run hanya preflight workflow yang telah disetujui;
Jangan menjalankan `migrate resolve` atau root history terhadap Supabase.
