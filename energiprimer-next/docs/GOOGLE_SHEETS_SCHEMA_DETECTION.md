# Google Sheets Schema Detection

Status checkpoint: **S4 PASS**

Schema detection adalah guardrail sebelum incremental import. Perubahan
struktur source tidak mengubah Prisma schema dan tidak menjalankan migrasi
database operasional secara otomatis.

## Fingerprint

`buildSchemaSnapshot()` membangun snapshot versi 1 dari parser dynamic yang
sudah ada. Snapshot memuat:

- semantic label path;
- resource (`biomass`, `coal`, `solar`, atau `unknown`);
- unit dan unit number 1–3;
- flag total, stock, HOP, dan date;
- observed value type (`numeric`, `empty`, `text`, `mixed`);
- keberadaan date column.

Snapshot tidak memuat nomor baris, alamat cell, nilai bisnis, spreadsheet ID,
private key, atau access token. Kolom diurutkan secara canonical sebelum SHA-256
dibuat, sehingga perubahan urutan kolom saja tidak dianggap sebagai perubahan
schema.

## Lintas workbook

Persetujuan schema menggunakan profil mapping `BB_CANONICAL_V1`, bukan
`spreadsheet ID`. Snapshot `Juli26-BB` yang berstatus `ACTIVE` menjadi baseline
global untuk workbook Google baru. Workbook baru tetap dicatat sebagai sumber
terpisah untuk menjaga provenance, lalu `Juli26-BB`-nya dibaca satu kali dan
otomatis di-admit bila fingerprint-nya sama. Jika ada beberapa snapshot
canonical aktif dengan fingerprint berbeda, proses berhenti dan meminta review;
sistem tidak memilih salah satunya secara diam-diam.

## Klasifikasi

| Klasifikasi | Kondisi | Tindakan sync |
| --- | --- | --- |
| `NEW_SCHEMA` | Belum ada snapshot yang disetujui | Untuk sumber baru, gunakan profil `BB_CANONICAL_V1`; snapshot lokal hanya di-admit setelah fingerprint cocok. |
| `UNCHANGED` | Fingerprint sama | Lanjutkan change detection row. |
| `NEW_COLUMN` | Semantic column baru | Hentikan dan status `SCHEMA_REVIEW`. |
| `MISSING_COLUMN` | Column yang disetujui hilang | Hentikan dan status `SCHEMA_REVIEW`. |
| `RENAME_CANDIDATE` | Removed/added column memiliki struktur mirip | Hentikan dan minta review. |
| `TYPE_CHANGE` | Observed value type semantic column berubah pada mode strict | Hentikan dan minta review. |
| `SCHEMA_REVIEW` | Perubahan tidak dapat diklasifikasikan aman | Hentikan dan minta review. |

Jalur scheduler otomatis menggunakan mode kompatibilitas untuk perbandingan
lintas workbook: perubahan `numeric`, `empty`, `text`, atau `mixed` yang hanya
berasal dari isi sel tidak dianggap perubahan struktur. Header semantic,
keberadaan kolom, rename, duplicate, ambiguity, dan date column tetap harus
match. Validasi parser/import plan tetap berjalan terhadap nilai aktual.

Semua perubahan setelah snapshot pertama dicatat pada
`sync_schema_changes` dengan hash sebelumnya, hash saat ini, ringkasan klasifikasi,
dan snapshot aman untuk audit. Snapshot approved pada worksheet tidak diganti
saat review masih terbuka.

## Dampak operasional

Jika schema berubah, normalized data existing tidak dihapus atau diubah oleh
detektor. Worksheet diberi status `SCHEMA_REVIEW`; administrator perlu meninjau
mapping parser/import plan sebelum mengizinkan perubahan lanjutan.

Invalid worksheet title, parser error, field ambiguous, supplier tidak lengkap,
atau target yang tidak sesuai tetap ditangani oleh validasi import plan dan
memiliki jalur review terpisah.

## Database additive change

Kolom `sync_worksheets.schema_snapshot` ditambahkan dengan migration additive:

```text
prisma/migrations/20260830170000_add_sync_schema_snapshot/migration.sql
```

Migration hanya menambahkan kolom pada registry Phase 11. Tidak ada `DROP`,
`DELETE`, `prisma db push`, atau perubahan tabel Laravel/normalized existing.

## Verification

Static checks mencakup:

- initial schema → `NEW_SCHEMA`;
- schema identik → `UNCHANGED`;
- perubahan urutan kolom → tetap `UNCHANGED`;
- column baru → `NEW_COLUMN`;
- column hilang → `MISSING_COLUMN`;
- rename kandidat → `RENAME_CANDIDATE`;
- perubahan observed type → `TYPE_CHANGE`;
- mapping ambigu, duplicate header, dan empty header → `SCHEMA_REVIEW`.

Live check terhadap `Juli26-BB` memastikan snapshot schema tersimpan di registry
database lokal.

```bash
npm run sync:verify-schema
npm run sync:verify-schema -- --live
```

## Files utama

- `src/services/google-sheets/sync/schema-detection.ts`
- `src/services/google-sheets/sync/engine.ts`
- `scripts/verify-schema-detection.ts`
- `prisma/schema.prisma`

Jalur scheduler otomatis juga memverifikasi bahwa perubahan observed value type
lintas workbook tetap `UNCHANGED` selama struktur header dan date column sama.

## Agustus26-BB canonical recognition fix — 2026-09-15

Audit read-only menemukan dua penyebab yang terpisah dari business mapping:

1. Lookup canonical lama menggabungkan seluruh workbook. Production registry
   memiliki dua `Juli26-BB` aktif dengan hash berbeda, sehingga anchor Juli pada
   source yang juga memiliki `Agustus26-BB` ikut tertutup oleh hasil global
   `AMBIGUOUS`, lalu preflight melaporkannya sebagai
   `CANONICAL_SCHEMA_UNAVAILABLE`. Resolver sekarang memilih anchor Juli aktif
   dari source yang sama untuk worksheet eksplisit. Konflik pada source yang
   sama atau fallback global yang konflik tetap diblokir.
2. Agustus memiliki placeholder eksplisit `-` pada value dashboard Unit 1
   (`Y56`). Resolver sebelumnya melewati placeholder itu lalu membandingkan
   angka dari baris dashboard lain, sehingga menghasilkan `ambiguous_fields`.
   Placeholder sekarang dipertahankan sebagai `missing`; tidak ada angka dari
   baris lain yang ditebak dan mapping Unit 1/2/3 tidak berubah.

Schema v1 juga dinormalisasi untuk backward compatibility. Angka murni yang
terbawa ke `HeaderPath.labels` oleh sample cell, seperti `4.451`/`7.967` pada
label HSD, dikeluarkan dari fingerprint. Hash sekarang merepresentasikan
struktur semantic (header/path metadata dan date-column presence); observed
`valueType` tetap disimpan untuk strict diagnostics, tetapi tidak mengubah
structural hash. Snapshot registry lama dinormalisasi saat dibaca, sehingga
tidak diperlukan migration atau metadata write untuk recognition ini.

Hasil live exact read pada `A1:ZZ500`:

| Worksheet | Sheet ID | Header paths | Data rows | Schema hash | Parser |
| --- | ---: | ---: | ---: | --- | --- |
| `Juli26-BB` | `1692973815` | 108 | 31 | `2bed9745…` | all required fields resolved |
| `Agustus26-BB` | `321088799` | 108 | 31 | `2bed9745…` | Unit 1 explicit `-` is missing, not ambiguous |

Kedua worksheet menghasilkan 352 candidate records dan 352 valid records,
zero invalid rows, zero duplicate stable keys, dan mempertahankan dua warning
yang sudah menjadi perilaku parser: duplicate/typo Unit 2 pada blok current
ketiga dinormalisasi menurut urutan fisik, serta total konsumsi dashboard
dibandingkan dengan total semantic Unit 1–3. `Juli26-BB` dry-run menghasilkan
`schemaClassification=UNCHANGED`; `Agustus26-BB` menghasilkan
`schemaClassification=APPROVED`; keduanya `status=PASS` dengan
`write=NOT_EXECUTED`.

Registry Agustus masih terlihat sebagai `SCHEMA_REVIEW` pada dry-run karena
dry-run tidak memutasi registry. Karena record tersebut tidak memiliki approved
schema/hash dan current read lulus canonical validation, preflight
memperlakukan review itu sebagai retryable prospective admission. A production
retry resolves its open review and status atomically with the row-state/schema
transaction; non-retryable review states remain blocked.

Commands used:

```bash
npm.cmd run sync:verify-auto-admission
npm.cmd run dynamic:verify
npm.cmd run sync:verify-schema
npm.cmd run sheets:sync -- --worksheet="Juli26-BB" --production --dry-run
npm.cmd run sheets:sync -- --worksheet="Agustus26-BB" --production --dry-run
```

Semua check di atas lulus. Kedua dry-run hanya melakukan Google read dan
Production identity/registry SELECT; tidak ada registry, lease, sync-run,
staging, normalized-data, atau Google Sheets write.
