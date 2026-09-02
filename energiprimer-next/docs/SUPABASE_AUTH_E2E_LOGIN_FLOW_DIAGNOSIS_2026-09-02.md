# Phase 22E.10 — Supabase Auth E2E Login Flow Diagnosis

> HISTORICAL / NON-ACTIVE (Phase 6C, 2026-09-02): Supabase Auth/recovery
> references below are diagnostic evidence only.

Tanggal: 2026-09-02  
Mode: diagnostic read-only  
Status: **DIAGNOSED — SUPABASE_AUTH_RESPONSE**

## Executive Summary

Kegagalan empat test authenticated pada Phase 22E.9 tidak disebabkan oleh hydration, selector, credential, role, session logic, proxy, atau dashboard database.

Pada run di environment sandbox, browser berhasil membuat request `POST /auth/v1/token`, tetapi tidak menerima response dan melaporkan `net::ERR_NETWORK_ACCESS_DENIED`. Pada run yang sama dengan network outbound yang diizinkan secara terkontrol ke Supabase E2E:

- submit handler berjalan;
- `POST /auth/v1/token` mendapat status `200`;
- `GET /auth/v1/user` mendapat status `200`;
- Auth mengembalikan user;
- `SIGNED_IN` teramati;
- session cookie terbentuk (nama cookie saja diperiksa);
- user diotorisasi sebagai admin;
- navigasi ke `/dashboard` berhasil;
- focused existing login test lulus.

Root cause adalah pembatasan transport/network pada runner sandbox saat mengakses Supabase Auth E2E. Tidak ada perubahan authentication source atau database.

## Existing Architecture

- `src/app/login/LoginForm.tsx` adalah Client Component.
- Form menunggu hydration melalui `data-auth-ready="true"`.
- Submit memanggil `createClient().auth.signInWithPassword()`.
- Setelah sign-in, form memanggil `getUser()` dan memeriksa `app_metadata.role` melalui `isSupabaseAdmin()`.
- User admin diarahkan menggunakan `router.replace("/dashboard")` dan `router.refresh()`.
- `src/lib/supabase/client.ts` membuat browser client dari public Supabase URL dan anon key.
- `src/lib/supabase/server.ts` adalah server-only client berbasis cookie.
- `src/proxy.ts` membaca session server-side dengan `getUser()` dan memeriksa role admin untuk protected path.
- `src/app/(protected)/layout.tsx` melakukan pemeriksaan server-side melalui `getAuthenticatedAdmin()`.
- `/dashboard` membaca business data melalui Prisma/PostgreSQL lokal; Supabase E2E tidak menjadi business datasource.

## Diagnostic Method

Diagnostic dilakukan terhadap environment E2E melalui `npm run auth:e2e`, yang menggunakan `scripts/run-e2e-with-env.mjs` dan `.env.e2e.local`. Tidak ada `.env.local` fallback.

Observasi yang dipakai:

- state form dan hydration marker;
- submit button enabled state;
- `page` request/response event untuk pathname Auth saja;
- response status dan durasi tanpa body/header;
- `pageerror` dan console error/warning yang disanitasi;
- pathname navigation tanpa query string atau hash;
- event Auth `INITIAL_SESSION` dan `SIGNED_IN`;
- boolean presence session cookie tanpa membaca nilainya;
- hasil route protected dan dashboard UI.

Wait yang dipakai adalah event/state-based `waitForURL` dengan batas maksimum 10 detik pada diagnostic test. Tidak digunakan `waitForTimeout()`.

Instrumentation dan test diagnostic bersifat sementara, tidak mencetak credential/token/cookie value, dan telah dihapus setelah diagnosis.

## Login Form

| Tahap | Hasil |
| --- | --- |
| Login form loaded | PASS |
| React hydration selesai | PASS — `data-auth-ready=true` |
| Tombol Login enabled | PASS |
| Submit handler executed | PASS |
| `signInWithPassword()` executed | PASS |
| Sign-in result | PASS pada network-enabled E2E run |
| `getUser()` result | PASS — user tersedia |
| Admin authorization | PASS — role admin diterima |

Tidak ditemukan native form navigation sebagai penyebab pada run terbaru. Login handler mengambil alih submit sebagaimana dirancang.

## Supabase Auth Network

### Sandbox run

| Request | Result |
| --- | --- |
| `POST /auth/v1/token` | Request observed |
| Auth response | NOT OBSERVED |
| Browser error | `net::ERR_NETWORK_ACCESS_DENIED` |

Request berhenti pada transport browser sebelum response Auth diterima. Tidak ada request body, token, Authorization header, atau credential yang dicatat.

### Network-enabled E2E run

| Request | Status | Durasi observasi |
| --- | ---: | ---: |
| `POST /auth/v1/token` | 200 | 792 ms |
| `GET /auth/v1/user` | 200 | 176 ms |

Auth endpoint E2E dan credential test berhasil digunakan pada run ini. Tidak ada indikasi HTTP 400 pada run terbaru.

## Auth State

Event yang teramati dari browser client:

```text
INITIAL_SESSION
SIGNED_IN
```

Kesimpulan: Supabase Auth menghasilkan state `SIGNED_IN` pada network-enabled E2E run.

## Session State

Hasil pemeriksaan aman:

| Check | Result |
| --- | --- |
| Browser session established | YES |
| Session cookie name present | YES |
| Session cookie value read | NO |
| Token/session object printed | NO |
| User payload printed | NO |

`signInWithPassword()` mengembalikan user, `getUser()` mengembalikan user, dan state `SIGNED_IN` teramati. Ini membuktikan session browser terbentuk tanpa mengekspos session value.

## Navigation

Pathname yang teramati pada diagnostic run:

```text
/login
/login
/dashboard
```

Query string dan hash tidak dicatat. Navigasi ke `/dashboard` berhasil pada network-enabled run dan tidak terjadi redirect loop kembali ke `/login`.

Focused existing test `logs in through the Supabase Auth login form` juga lulus dengan hasil `1 passed`.

## Proxy / Server Authentication

Proxy dan protected layout tidak diubah. Pada network-enabled run:

- request setelah login tetap berada pada `/dashboard`;
- protected dashboard heading berhasil ditemukan oleh existing test;
- tidak terjadi redirect ke `/login`;
- role admin telah diterima sebelum `router.replace` dilakukan.

Dengan demikian server/proxy mengenali session authenticated dan otorisasi admin pada route protected berhasil. Tidak ada bukti redirect loop atau mismatch antara browser session dan server session.

## Dashboard Entry

Dashboard query telah lulus pada Phase 22E.9 terhadap PostgreSQL lokal:

- seluruh dependency dashboard tersedia;
- Prisma connection dan read probes lulus;
- `getPostgresOverviewData()` mengembalikan metric dan series yang diperlukan;
- business database tidak ditulis.

Pada Phase 22E.10, login-dependent focused test berhasil mencapai dashboard saat network Auth tersedia. Dashboard database bukan titik kegagalan login.

## Root Cause Classification

**DIAGNOSED — SUPABASE_AUTH_RESPONSE**

Kualifikasi root cause: **sandbox network transport blocked**.

Detail:

1. Submit handler tidak bermasalah.
2. Request Auth benar-benar dibuat.
3. Pada sandbox, response terblokir oleh `ERR_NETWORK_ACCESS_DENIED` sebelum status HTTP diterima.
4. Saat network E2E diizinkan, response Auth `200`, event `SIGNED_IN`, session, admin authorization, dan redirect semuanya berhasil.
5. Tidak ada perubahan source authentication yang diperlukan.

Kategori ini merujuk pada titik berhenti di run sandbox, bukan kegagalan Supabase Auth pada network-enabled run.

## Security Verification

- `.env.local` tidak dibaca.
- Hanya E2E environment melalui wrapper yang digunakan.
- Target Supabase adalah non-production/E2E.
- Service-role key tidak digunakan di browser.
- Tidak ada credential, token, cookie value, request body, atau Authorization header yang dicetak.
- Tidak ada user dibuat, dihapus, atau diubah.
- Tidak ada password atau `app_metadata` yang diubah.
- Tidak ada authentication bypass atau mock Auth.
- Instrumentation sementara sudah dihapus.
- Test diagnostic sementara sudah dihapus.

## Production Safety

| Operation | Result |
| --- | --- |
| Production Supabase access | 0 |
| Production database access | 0 |
| Production deployment | NOT RUN |
| Auth provisioning | NOT RUN |
| Migration/seed/import/sync | NOT RUN |
| Source authentication architecture change | NOT RUN |

## Database Write Audit

- Local PostgreSQL writes: **0**.
- Supabase business-data writes: **0**.
- Supabase Auth Admin API writes: **0**.
- Schema changes: **0**.
- Audit hanya menggunakan read-only connection/query dan Auth sign-in test pada environment E2E.

## Conclusion

Flow authentication aplikasi berjalan normal ketika runner dapat mencapai Supabase Auth E2E. Kegagalan Phase 22E.9 disebabkan network policy sandbox yang menolak request outbound, sehingga `page.waitForURL()` menunggu redirect yang tidak pernah terjadi.

Tidak ada alasan untuk mengubah `LoginForm`, Supabase client, proxy, authorization, schema, credential, atau business query berdasarkan diagnosis ini.

Validasi setelah cleanup:

- ESLint: PASS.
- TypeScript: PASS.
- Temporary instrumentation: REMOVED.
- Temporary diagnostic test: REMOVED.

## Recommended Next Phase

1. Jalankan full `npm run auth:e2e` pada runner/CI yang mengizinkan outbound HTTPS ke Supabase E2E.
2. Terapkan network allowlist untuk target E2E tanpa memberikan akses ke Production.
3. Pertahankan test readiness yang sudah ada dan jangan menambahkan fixed delay.
4. Jangan mengubah authentication source atau melakukan provisioning ulang.

Phase 22E.10 berhenti setelah diagnosis. Tidak ada fix otomatis yang diperlukan.
