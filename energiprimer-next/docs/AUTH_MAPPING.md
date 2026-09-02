# Laravel Audit — Authentication and Authorization Mapping

> HISTORICAL REFERENCE (Phase 6C, 2026-09-02): Laravel recovery/mail entries
> are not active Next.js flows. The active boundary is Auth.js Credentials →
> Prisma → PostgreSQL/Supabase; see `docs/AUTH_IMPLEMENTATION.md`.

## Ringkasan

Authentication menggunakan Laravel session guard `web` + Eloquent provider `App\Models\User`. Tidak ada registration route. Seluruh area dashboard, data, monitoring, laporan, pengaturan, logout, dan change password hanya dapat diakses user ber-role `admin`.

## Model user

File: `backend/app/Models/User.php`

- Table: `users`.
- Hidden: `password`, `remember_token`.
- Fillable: `name`, `email`, `password`, `role`, `last_login_at`.
- Cast: `email_verified_at` dan `last_login_at` datetime; `password` hashed.
- Tidak ada implementasi email verification.

## Flow login/logout

1. Guest membuka `GET /login`.
2. `POST /login` memvalidasi `email` sebagai email dan `password` sebagai string.
3. `Auth::attempt` mensyaratkan email/password valid dan `role = admin`.
4. Session diregenerasi; `last_login_at` disimpan.
5. Redirect ke intended URL atau `dashboard.overview`.
6. `POST /logout` menjalankan logout, invalidate session, regenerate CSRF token, lalu redirect ke login.

Response login gagal generik: “Email atau password tidak valid.”

## Password recovery dan change password

| Flow            | Laravel implementation                                                     | Validasi/aturan                                                   | Penyimpanan                                                      |
| --------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| Forgot password | Cari email case-insensitive dan role admin, lalu `Password::sendResetLink` | `email` required + email                                          | `password_reset_tokens`; response sama untuk email dikenal/tidak |
| Reset password  | Native broker `Password::reset` setelah memastikan email milik admin       | token, email, password required + confirmed + minimum 12 karakter | password hashed; remember token baru; invalidasi session         |
| Change password | Cek password saat ini dengan `Hash::check`, simpan password baru           | current password required; password confirmed + minimum 12        | invalidasi seluruh database session user; logout paksa           |

Reset token berlaku 60 menit dan throttle broker 60 detik. Route POST terkait juga memakai throttle `6,1` (enam request per menit). Mailer default `.env.example` adalah `log`, sehingga email reset lokal ditulis ke log, bukan dikirim ke SMTP.

## Authorization

`EnsureAdmin::handle()` melakukan `abort_unless($request->user()?->role === 'admin', 403)`. Tidak ada policy, gate, permission table, atau permission package. Role yang terlihat adalah `admin` dan `operator`, tetapi semua route aplikasi yang terdaftar mensyaratkan admin.

`AdminUserSeeder` membaca `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, mewajibkan password minimal 12 karakter, membuat/memperbarui satu admin secara idempotent, lalu menurunkan admin lain menjadi `operator`.

## Session dan CSRF

- Default `.env.example`: `SESSION_DRIVER=database` dan table `sessions`.
- Lifetime: 120 menit; HTTP-only; SameSite `lax`; secure otomatis di production.
- Form POST Blade memakai `@csrf`.
- Change/reset password menghapus session database user dan melakukan re-authentication.

## UI auth

Blade views:

- `auth/login.blade.php`
- `auth/forgot-password.blade.php`
- `auth/reset-password.blade.php`
- `auth/change-password.blade.php`
- layout: `resources/views/layouts/auth.blade.php`

UI menampilkan login admin, forgot/reset password, dan change password. Pesan error/status berasal dari session flash dan validation errors.

## Target Next.js — belum diimplementasikan

Target implementasi memerlukan keputusan arsitektur sebelum coding:

- Server-side session cookie/httpOnly atau identity provider eksternal.
- Penyimpanan user/role di PostgreSQL dan mekanisme hash password.
- CSRF/session strategy bila memakai form mutation.
- Pengiriman email reset password di production.
- Middleware route protection untuk admin.

Dependency Next.js auth **NEEDS REVIEW**; project baru belum memiliki dependency authentication dan sesuai instruksi audit tidak ada yang ditambahkan.

## Risiko migrasi

1. Role check hanya string `admin`, tanpa permission granular; meniru behavior apa adanya berisiko bila kebutuhan operator berbeda.
2. Seeder dapat menurunkan semua admin lain menjadi operator; behavior ini harus disetujui sebelum dipertahankan.
3. `.env.example` berisi nilai kredensial admin yang tampak nyata. Jangan memindahkan password tersebut ke repository/Next.js; rotasi jika pernah digunakan.
4. Password reset bergantung pada mailer dan token database; belum ada keputusan delivery service.
5. Session database dan invalidasi lintas sesi perlu diuji bila frontend/backend dipisah.
6. `email_verified_at` tersedia di schema tetapi tidak dipakai sebagai syarat login. **NEEDS REVIEW** apakah verifikasi email memang tidak diperlukan.
