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

## Klasifikasi

| Klasifikasi | Kondisi | Tindakan sync |
| --- | --- | --- |
| `NEW_SCHEMA` | Belum ada snapshot yang disetujui | Boleh diproses bila import plan valid, lalu snapshot disimpan. |
| `UNCHANGED` | Fingerprint sama | Lanjutkan change detection row. |
| `NEW_COLUMN` | Semantic column baru | Hentikan dan status `SCHEMA_REVIEW`. |
| `MISSING_COLUMN` | Column yang disetujui hilang | Hentikan dan status `SCHEMA_REVIEW`. |
| `RENAME_CANDIDATE` | Removed/added column memiliki struktur mirip | Hentikan dan minta review. |
| `TYPE_CHANGE` | Observed value type semantic column berubah | Hentikan dan minta review. |
| `SCHEMA_REVIEW` | Perubahan tidak dapat diklasifikasikan aman | Hentikan dan minta review. |

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
