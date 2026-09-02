# Supabase Auth E2E Results — 2026-09-02

> HISTORICAL / NON-ACTIVE (Phase 6C, 2026-09-02): These results describe an
> earlier Supabase Auth scope and are not the current authentication contract.

## Status

`FAIL`

Core Playwright spec sudah dibuat, ditemukan, dan berhasil dijalankan menggunakan Chrome sistem melalui konfigurasi Playwright. Eksekusi live mencapai aplikasi, tetapi alur login gagal karena submit form diproses sebagai navigasi GET kembali ke halaman login.

## Ringkasan Eksekusi

| Item | Hasil |
| --- | --- |
| Test file | `e2e/supabase-auth.spec.ts` |
| Test discovered | 5 |
| Passed | 1 |
| Failed | 4 |
| Skipped | 0 |
| Environment marker | `non-production` — PASS |
| Supabase target | E2E/non-production — PASS dari guard environment |
| Production access | Tidak dilakukan |
| Provisioning user | Tidak dilakukan |
| Database writes | 0 |
| Deployment | Tidak dilakukan |

Test unauthenticated PASS. Empat test yang membutuhkan login gagal pada tahap submit form; halaman kembali ke `/login` dan tidak pernah mencapai `/dashboard`. Karena login tidak berhasil, authorization, session persistence, dan logout tidak dapat diverifikasi.

## Test yang Dibuat

1. Redirect user unauthenticated dari `/dashboard` ke `/login` dengan parameter protection yang sesuai source.
2. Login admin melalui form Supabase Auth aktual pada `/login`.
3. Authorization admin untuk mengakses `/dashboard`.
4. Persistensi session setelah reload.
5. Logout melalui UI dan verifikasi `/dashboard` kembali protected.

Selector yang digunakan berasal dari source aplikasi:

- heading login: `Login ke Energi Primer`;
- label email: `Email admin`;
- label password: `Password`;
- tombol login: `Login`;
- tombol logout: `Keluar`;
- heading dashboard: `Overview Energi Primer`.

Test membaca email dan password hanya dari `SUPABASE_AUTH_TEST_EMAIL` dan `SUPABASE_AUTH_TEST_PASSWORD` yang disediakan wrapper environment E2E. Tidak ada credential yang di-hardcode dan service-role key tidak digunakan dalam browser context.

## Root Cause yang Terverifikasi

Source `LoginForm` mendefinisikan `onSubmit` dengan `preventDefault()` dan seharusnya memanggil Supabase Auth sebelum `router.replace("/dashboard")`. Pada test live, setelah tombol login diklik browser melakukan navigasi native kembali ke `/login` dengan parameter form, sehingga handler client tidak aktif atau belum selesai terhidrasi ketika interaksi dilakukan. Akibatnya request login Supabase dan pemeriksaan role admin belum tercapai.

Pesan yang relevan telah disanitasi:

`page.waitForURL: Test timeout of 30000ms exceeded; navigation remained on /login`

Tidak ada nilai secret, password, token, connection string, atau private key yang dicatat dalam laporan ini.

## Validasi

| Validasi | Hasil |
| --- | --- |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| Syntax check wrapper E2E | PASS |
| Playwright test discovery | PASS — 5 test |
| `npm run auth:e2e` | FAIL — 1 passed, 4 failed pada login form |

## Perubahan Phase 22E.1

- Menambahkan `e2e/supabase-auth.spec.ts`.
- Memperbaiki mode Playwright pada `scripts/run-e2e-with-env.mjs` agar `npm run auth:e2e` menjalankan Playwright Test dengan subcommand `test`.
- Menambahkan channel Chrome sistem pada `playwright.config.ts` dan meneruskan environment path Windows yang diperlukan agar browser lokal dapat ditemukan.
- Menambahkan dokumentasi hasil ini.

Perubahan tersebut tidak mengubah authentication runtime, authorization, schema, API, business data, atau konfigurasi Production.

## Langkah Berikutnya yang Aman

Perlu dilakukan diagnosis/fix terpisah pada readiness hydration atau mekanisme submit login E2E. Jangan mengubah authentication architecture atau menambahkan bypass. Setelah penyebab client submit diperbaiki atau ditentukan, jalankan ulang:

```bash
npm run auth:e2e
```

Instalasi Chromium Playwright dicoba, tetapi ekstraksinya macet dan tidak menghasilkan executable lengkap. Test kemudian memakai Chrome sistem. Tidak ada provisioning, database write, atau akses Production yang dilakukan.

## Phase 22E.4 Update

### Readiness Fix

Login form sekarang memiliki readiness signal deterministik:

- `src/app/login/LoginForm.tsx` menggunakan `useSyncExternalStore` dengan snapshot server `false` dan snapshot client `true`;
- form mengekspos `data-auth-ready="true"` setelah client siap;
- tombol login disabled sebelum readiness tercapai atau ketika request sedang pending;
- tidak ada `waitForTimeout()` yang digunakan.

Playwright menunggu `data-auth-ready="true"` dan tombol login enabled sebelum mengisi dan submit form.

### Latest Full E2E Result

| Item | Hasil |
| --- | --- |
| Test discovered | 5 |
| Passed | 1 |
| Failed | 4 |
| Skipped | 0 |
| Native form navigation | Tidak terjadi lagi pada test login |
| Supabase Auth login | Handler login mencapai `/dashboard` dan authenticated shell tampil |
| Auth HTTP 400 | Tidak menjadi blocker pada latest full run |
| Dashboard rendering | 4 test gagal karena `Data Overview belum dapat dimuat` |
| Database writes | 0 |
| Production access | 0 |

Kegagalan terbaru terjadi saat assertion heading dashboard, setelah URL dashboard tercapai. Page dashboard mengembalikan `OverviewErrorState` ketika pembacaan data PostgreSQL gagal. Tidak ada perubahan database dilakukan untuk mengatasi hal ini.

Kesimpulan: race hydration sudah teratasi. Credential bukan blocker yang terverifikasi pada latest run; blocker berikutnya adalah kesiapan read-only data/dashboard pada environment E2E dan perlu diaudit terpisah tanpa mengubah production atau business data.
