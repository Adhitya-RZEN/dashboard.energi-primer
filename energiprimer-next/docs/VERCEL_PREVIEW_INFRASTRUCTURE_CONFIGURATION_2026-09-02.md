# Phase 22G.1 — Vercel Preview Infrastructure Configuration

> HISTORICAL / NON-ACTIVE (Phase 6C, 2026-09-02): Mail/recovery configuration
> references below are not active provisioning instructions.

Tanggal: 2026-09-02  
Scope: konfigurasi infrastruktur Vercel Preview tanpa deployment.  
Production Supabase, Production PostgreSQL, dan Production deployment tidak disentuh.

## Vercel Project

- Project target: dashboard-energi-primer.
- Project ditemukan pada scope Vercel aktif.
- Root Directory: energiprimer-next.
- Node.js Version: 24.x.
- Repository lokal belum memiliki .vercel/project.json dan belum ter-link secara lokal.
- Deployment Preview: belum dilakukan.

## Repository Link

Requirement Phase 22G.1:

    github.com/Adhitya-RZEN/dashboard.energi-primer

Hasil audit lokal:

- Perbandingan remote repository lokal terhadap repository requirement: MISMATCH.
- Branch aktif lokal: NextJs.
- Nilai remote aktual tidak ditampilkan.
- Vercel CLI tidak menyediakan verifikasi Git linkage lengkap pada inspeksi yang dijalankan.
- Tidak ada perubahan terhadap remote repository atau branch karena perubahan tersebut memerlukan approval manual.

Status: **BLOCKED — REPOSITORY_LINK_NEEDS_MANUAL_VERIFICATION**.

## Framework Configuration

- Root Directory sudah sesuai: energiprimer-next.
- Node.js 24.x memenuhi requirement project >=22.0.0.
- Vercel Framework Preset saat ini terbaca sebagai Other, bukan Next.js.
- Build command yang tersedia: npm run vercel-build atau npm run build.
- Tidak ada perubahan setting framework yang dilakukan secara otomatis.

Status: **NEEDS MANUAL CONFIGURATION**.

## Preview Environment

Environment variable Preview diperiksa hanya berdasarkan nama/status. Nilai tidak ditampilkan.

Perubahan aman yang dilakukan:

- NEXT_PUBLIC_SUPABASE_URL ditambahkan hanya ke environment Preview.
- NEXT_PUBLIC_SUPABASE_ANON_KEY ditambahkan hanya ke environment Preview.
- Kedua variable berasal dari environment E2E/non-production yang telah lolos pemeriksaan marker dan URL consistency.
- Tidak ada service-role key yang ditambahkan ke browser configuration.
- Tidak ada variable Production yang diubah.

Catatan:

- Vercel environment listing masih memiliki variable legacy AUTH_* dan RESEND_* yang tidak digunakan oleh runtime Supabase Auth saat ini. Variable tersebut tidak dihapus otomatis.
- DATABASE_URL tercatat pada Production dan Preview, tetapi target nilainya tersembunyi sehingga belum dapat diklasifikasikan non-production.
- CRON_SECRET dan Google Sheets variables juga tercatat pada Production dan Preview. Karena Preview tidak membutuhkan Google Sheets untuk smoke test, variable tersebut memerlukan review manual agar Preview tidak memakai credential Production.
- DASHBOARD_DATA_SOURCE belum tercantum; source memiliki default postgres, tetapi konfigurasi eksplisit tetap direkomendasikan.

## Supabase Auth Configuration

- Preview Auth target yang diset adalah Supabase E2E/non-production.
- NEXT_PUBLIC_SUPABASE_URL: SET pada Preview.
- NEXT_PUBLIC_SUPABASE_ANON_KEY: SET pada Preview.
- Supabase service-role key tidak diperlukan oleh browser login dan tidak ditambahkan.
- Existing E2E admin tetap menjadi user test; tidak ada user baru dibuat.
- Production Supabase Auth tidak digunakan.

Status Auth environment: **PASS untuk variable public; redirect masih pending deployment**.

## Preview Database Configuration

Preview wajib menggunakan PostgreSQL non-production yang dapat dijangkau Vercel dan memiliki schema/data dashboard.

Hasil:

- DATABASE_URL tercatat untuk Preview.
- Nilai connection string tidak dibaca atau ditampilkan.
- Target database belum dapat dibuktikan sebagai non-production.
- Reachability dari Vercel belum dapat diuji karena belum ada deployment.
- Tidak ada fallback ke Production.
- Tidak ada database write, migration, seed, import, atau sync.

Status: **BLOCKED — PREVIEW_DATABASE_TARGET_UNVERIFIED**.

Operator harus mengganti atau mengonfirmasi Preview DATABASE_URL melalui Vercel Dashboard dengan datasource non-production remote. Jangan menggunakan localhost, 127.0.0.1, atau Production PostgreSQL.

## Redirect Configuration

Preview callback URL belum dapat ditentukan karena deployment belum dilakukan.

Status:

    PREVIEW_CALLBACK_URL_PENDING_DEPLOYMENT

Setelah URL Preview tersedia, tambahkan callback yang tepat hanya pada Supabase E2E project. Jangan mengubah redirect settings Supabase Production.

## Cron Configuration

Source memiliki Vercel Cron:

    path: /api/sync/google-sheets
    schedule: 0 1 * * *

- Tidak ada cron yang dijalankan dalam phase ini.
- Tidak ada Google Sheets sync yang dijalankan.
- Preview tidak membutuhkan cron untuk Auth/dashboard smoke test.
- Operator harus memastikan Preview tidak menjalankan sync terhadap Production data.
- CRON_SECRET yang tercatat untuk Preview belum diverifikasi targetnya dan tidak digunakan oleh phase ini.

Status: **REVIEW — KEEP PREVIEW CRON DISABLED OR ISOLATED**.

## Google Sheets Configuration

- Dashboard Preview dapat menggunakan PostgreSQL dan tidak membutuhkan Google Sheets untuk smoke test.
- Google Sheets credentials tidak digunakan oleh phase ini.
- Google Sheets variables tercatat pada Preview, tetapi target credential tidak diverifikasi.
- Jangan menggunakan Production Google credential pada Preview.
- Jangan membuat dummy credential.
- Recommended status: GOOGLE_SHEETS_PREVIEW = NOT CONFIGURED/NOT ACTIVATED.

## Environment Variable Matrix

| Variable | Preview | Source | Environment | Status |
| --- | --- | --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | SET | Supabase E2E | Non-production | PASS |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | SET | Supabase E2E | Non-production | PASS |
| DATABASE_URL | SET, target unknown | PostgreSQL Preview | Must be non-production | BLOCKED |
| DASHBOARD_DATA_SOURCE | NOT SET | Application default | Recommended postgres | REVIEW |
| NEXT_PUBLIC_APP_URL | SET | Preview application URL | Preview | REVIEW until URL is confirmed |
| NEXT_PUBLIC_APP_NAME | SET | Application display | Preview | PASS |
| CRON_SECRET | SET | Cron protection | Target unverified | REVIEW |
| GOOGLE_SHEETS_SPREADSHEET_ID | SET | Sheets sync | Target unverified | NOT REQUIRED for Preview |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | SET | Sheets authentication | Target unverified | NOT REQUIRED for Preview |
| GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY | SET | Sheets authentication | Target unverified | NOT REQUIRED for Preview |
| GOOGLE_SHEETS_CREDENTIALS_PATH | SET | Local file alternative | Not suitable for Vercel | REVIEW |
| SUPABASE_DIRECT_URL | SET | Operator tooling | Not app runtime | NOT REQUIRED |
| SUPABASE_POOLER_URL | SET | Operator tooling | Not app runtime | NOT REQUIRED |
| AUTH_SECRET | SET | Legacy/unused runtime variable | Not used by Supabase Auth runtime | NOT REQUIRED |
| RESEND_API_KEY / RESEND_FROM_EMAIL | SET | Legacy/unused runtime variables | Not used by current recovery runtime | NOT REQUIRED |

Tidak ada nilai environment, password, key, token, atau connection string yang dicantumkan pada dokumen ini.

## Production Safety

| Operation | Result |
| --- | --- |
| Production Auth users created | 0 |
| Production Auth settings changed | 0 |
| Production database writes | 0 |
| Production migrations | 0 |
| Production seed/import/sync | 0 |
| Production deployment | 0 |
| Production environment variables changed | 0 |
| Preview deployment | 0 |

- .env.local tidak dibaca.
- Tidak ada Production DATABASE_URL yang digunakan.
- Penambahan environment hanya dilakukan pada Preview untuk dua variable public Supabase E2E.
- Tidak ada source authentication/business logic yang diubah.

## Validation

- ESLint: PASS.
- TypeScript: PASS.
- Vercel project inspection: PASS untuk project existence, Root Directory, dan Node.js version.
- Preview environment names: public Supabase variables terverifikasi SET setelah konfigurasi.
- Database runtime test: NOT RUN karena target non-production belum terverifikasi.
- Preview deployment: NOT RUN sesuai scope phase.

## Remaining Blockers

1. **PREVIEW_DATABASE_TARGET_UNVERIFIED** — DATABASE_URL Preview ada, tetapi target non-production dan reachability Vercel belum dapat dibuktikan tanpa deployment/runtime check.
2. **REPOSITORY_LINK_NEEDS_MANUAL_VERIFICATION** — remote lokal tidak cocok dengan repository requirement; remote/branch tidak diubah otomatis.
3. **FRAMEWORK_PRESET_NEEDS_MANUAL_CONFIGURATION** — Vercel masih melaporkan Framework Preset Other.
4. **PREVIEW_CALLBACK_URL_PENDING_DEPLOYMENT** — callback URL final belum tersedia.
5. Cron dan Google Sheets variables tercatat pada Preview, tetapi target credential tidak diverifikasi; Preview sync harus tetap tidak diaktifkan.

## Final Status

**BLOCKED — PREVIEW_DATABASE_TARGET_UNVERIFIED**

Phase 22G.1 belum mencapai READY_FOR_PREVIEW_DEPLOYMENT. Auth public environment Preview sudah dikonfigurasi, tetapi deployment harus menunggu verifikasi database non-production yang dapat dijangkau Vercel, repository linkage, framework preset Next.js, dan callback URL. Tidak ada deployment atau operasi Production yang dilakukan.
