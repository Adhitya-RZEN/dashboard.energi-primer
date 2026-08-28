# Auth.js Regression Test — Phase 10A

Tanggal: 2026-08-28  
Scope: regression dan security review tanpa mengubah user/password production.

## Batasan test

AUTH_TEST_* tersedia untuk script scripts/verify-auth.mjs, tetapi script tersebut menjalankan login valid. Login valid memanggil update last_login_at, sehingga tidak dijalankan pada database existing dalam audit read-only ini. Forgot/reset/change password juga tidak dijalankan karena dapat membuat token atau mengubah user record.

Tidak ada credential, password, token, atau cookie value yang dicatat pada dokumen ini.

## Hasil test

| Test | Result | Notes |
| --- | --- | --- |
| Empty credentials | PASS | Server action menolak email/password kosong sebelum signIn. |
| Valid login | BLOCKED | Membutuhkan test account disposable; login valid memperbarui metadata login pada database. |
| Invalid password | BLOCKED | Jalur aman untuk mengujinya belum tersedia; throttle menyimpan counter pada tabel cache. |
| Nonexistent user | BLOCKED | Sama seperti invalid password; tidak dijalankan pada database existing. |
| Session creation/refresh | BLOCKED | Membutuhkan valid login dan cookie session. Konfigurasi JWT/maxAge telah diaudit. |
| Session expiration | BLOCKED | maxAge 120 menit diverifikasi dari konfigurasi; tidak menunggu expiry pada audit. |
| Logout | BLOCKED | Membutuhkan valid session; handler Auth.js dan sign-out path tersedia. |
| Protected route, no session | PASS | HTTP check ke protected routes tidak merender main-content dan mengirim NEXT_REDIRECT ke /login melalui streaming response Next.js. |
| Protected route, authenticated | BLOCKED | Membutuhkan valid session dari test environment. |
| Admin authorization | PASS (static) | proxy/ProtectedLayout/server actions memeriksa role === "admin" server-side. |
| Unauthorized role | PASS (static) | Role non-admin ditolak pada authorization callback dan protected layout. |
| Forgot-password page | PASS | HTTP page check berhasil; action tidak dipanggil. |
| Forgot-password action | BLOCKED | Action membuat atau memperbarui reset token. |
| Reset token validation | PASS (static) | Token dibandingkan menggunakan bcrypt, memiliki expiry 60 menit, dan dihapus setelah sukses. |
| Reset password update | BLOCKED | Akan mengubah password, remember token, updated timestamp, dan menghapus token. |
| Reused token | PASS (static) | Token dihapus dalam transaction setelah berhasil sehingga tidak dapat digunakan ulang. |

## HTTP smoke check yang aman

Server production lokal dijalankan dari hasil build pada port sementara. Request tanpa cookie ke route berikut diverifikasi:

- /dashboard
- /dashboard/biomassa
- /pengaturan
- /data-batu-bara
- /password/change

Semua menghasilkan streamed redirect ke /login dan tidak merender protected shell. /api/auth/session, /login, /forgot-password, dan halaman reset token invalid juga dapat diakses sesuai fungsi publiknya.

Catatan: pada response streaming App Router, status awal dapat berupa 200 dengan redirect instruction di RSC stream, bukan selalu HTTP 3xx. Browser Next.js menangani instruction tersebut. Test tidak menganggap status awal itu sebagai akses berhasil karena protected shell dan content tidak dirender.

## Server-side authorization review

- src/proxy.ts memeriksa admin untuk /dashboard.
- src/app/(protected)/layout.tsx memeriksa session dan admin sebelum merender shell.
- changePassword memeriksa session, role, user ID numeric, dan current password di server.
- Password reset hanya mencari user dengan role admin dan membandingkan token hash di server.
- Navigation visibility tidak menjadi satu-satunya authorization control.

## Temuan dan tindak lanjut

- **PASS WITH WARNINGS** untuk static boundary dan unauthenticated HTTP behavior.
- Full valid-login/logout/reset regression **BLOCKED** sampai tersedia database test/disposable user yang tidak terhubung ke production.
- Auth.js 5.0.0-beta.32 perlu keputusan upgrade dan regression test manual.
- Mail provider production belum tersedia; lihat MAIL_PROVIDER_READINESS.md.

## Cara menjalankan test lengkap pada environment aman

1. Sediakan database test terisolasi dan user test non-production.
2. Isi AUTH_TEST_BASE_URL, AUTH_TEST_ADMIN_EMAIL, AUTH_TEST_ADMIN_PASSWORD, dan AUTH_TEST_SECRET hanya pada environment test.
3. Jalankan npm run auth:verify.
4. Pastikan user test dan cache test dapat dibersihkan sesuai prosedur environment tersebut.

