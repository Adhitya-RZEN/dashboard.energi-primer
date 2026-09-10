# Dashboard Layout Specification
## Monitoring Efisiensi Batu Bara
### PT PLN Indonesia Power UBP Jeranjang

---

# Version

v0.1 (Initial Wireframe)

---

# Tujuan Dashboard

Dashboard ini digunakan oleh Tim Energi Primer untuk melakukan monitoring data efisiensi batu bara. Fokus utama dashboard adalah memberikan tampilan data yang mudah dibaca, cepat dipahami, dan siap dikembangkan menjadi dashboard analitik lengkap.

Pada versi awal ini hanya dibuat layout tanpa visualisasi data maupun filter.

---

# Design Principles

- Clean
- Enterprise
- Professional
- Simple
- Data First
- Easy to Read
- Responsive

---

# Color Palette

## Primary

| Nama | Hex |
|------|------|
| Primary Blue | #005BAC |

---

## Secondary

| Nama | Hex |
|------|------|
| Dark Blue | #0D47A1 |

---

## Background

| Nama | Hex |
|------|------|
| Background | #F5F7FA |

---

## Surface

| Nama | Hex |
|------|------|
| Card | #FFFFFF |

---

## Border

| Nama | Hex |
|------|------|
| Border | #E5E7EB |

---

## Typography

| Nama | Hex |
|------|------|
| Primary Text | #1F2937 |
| Secondary Text | #6B7280 |

---

## Status

Success

#22C55E

Warning

#F59E0B

Danger

#EF4444

Info

#3B82F6

---

# Typography

Font Family

Inter

Alternatif

- Poppins
- Nunito Sans

---

Ukuran

| Element | Size |
|---------|------|
| Dashboard Title | 28px |
| Section Title | 22px |
| Card Title | 18px |
| Body | 14px |
| Small Text | 12px |

---

# Border Radius

12px

---

# Shadow

Box Shadow

0 4px 12px rgba(0,0,0,.08)

---

# Grid System

Desktop

12 Columns

Sidebar Width

260px

Top Navbar

72px

Content Padding

24px

Gap

20px

---

# Layout Structure

```
+--------------------------------------------------------------+
| Navbar                                                       |
+--------------------------------------------------------------+

+-----------+--------------------------------------------------+
| Sidebar   |                                                  |
|           |                                                  |
|           |               Main Content                       |
|           |                                                  |
|           |                                                  |
|           |                                                  |
+-----------+--------------------------------------------------+

                 Footer
```

---

# Navigation Bar

Komponen

- Logo PLN
- Brand utama: Energi Primer
- Subtitle brand: Team
- Notification (Future)
- User Profile
- Logout

Tinggi

72px

---

# Sidebar

Menu Utama

- Overview
- Biomassa
- Batubara
- Solar
- Stok Batubara
- Target & Kinerja

Sistem (ADMIN)

- User Management
- Audit Log

Pengaturan tidak ditampilkan sebagai navigasi utama. Profil dan perubahan
password tetap tersedia melalui menu akun pada navbar.

Future

- Hak Akses
- Riwayat

---

# Breadcrumb

Contoh

Dashboard > Monitoring

---

# Header

Berisi

Judul halaman

Contoh

Monitoring Efisiensi Batu Bara

Deskripsi singkat halaman

Contoh

Menampilkan data monitoring efisiensi batu bara berdasarkan data operasional.

---

# Main Content

Versi awal

Kosong

Placeholder

```
Content Area

Future:
- KPI Cards
- Charts
- Tables
- Filters
```

---

# Footer

© 2026
PT PLN Indonesia Power UBP Jeranjang

---

# Responsive

Desktop

Sidebar tetap tampil.

Tablet

Sidebar dapat collapse.

Mobile

Sidebar berubah menjadi Drawer.

---

# Future Components

## KPI Cards

Contoh

- Total Konsumsi Batu Bara
- Efisiensi Boiler
- Heat Rate
- Kalori Batu Bara
- Stock Batu Bara

---

## Charts

- Line Chart
- Bar Chart
- Pie Chart
- Area Chart

---

## Tables

Monitoring Data

Kolom

- Tanggal
- Unit
- Kalori
- Moisture
- Ash
- Sulfur
- Pemakaian
- Heat Rate
- Efisiensi

---

## Filter

- Rentang Tanggal
- Unit PLTU
- Shift
- Supplier
- Jenis Batu Bara

---

## Search

Global Search

---

## Export

- Excel
- CSV
- PDF

---

## Notification

Future

- Sync berhasil
- Sync gagal
- Data terbaru

---

# Data Source

Spreadsheet Online

↓

API

↓

Laravel Backend

↓

Scheduler

↓

PostgreSQL

↓

Dashboard

---

# Folder Recommendation

resources/

├── views/

├── dashboard/

│   ├── dashboard.blade.php

│   ├── monitoring.blade.php

│   ├── laporan.blade.php

│   └── settings.blade.php

---

# UI Components

Button

Primary

Secondary

Outline

Danger

---

Input

Text Field

Date Picker

Dropdown

Search

---

Cards

Default

Hover Effect

---

Table

Striped

Hover

Pagination

Sorting

---

Icons

Menggunakan Heroicons atau Lucide.

---

# Animation

Minimal

Fade In

Hover

Transition 200ms

Tidak menggunakan animasi berlebihan.

---

# Accessibility

- Kontras warna sesuai WCAG
- Font minimal 14px
- Keyboard Navigation
- Screen Reader Friendly

---

# Theme

Light Mode (Default)

Dark Mode (Future)

---

# UI Style

Enterprise Dashboard

Minimalis

Professional

Modern

Corporate

---

# Development Stack

Frontend

- HTML5
- CSS3
- Tailwind CSS
- Blade Laravel

Backend

- Laravel

Database

- PostgreSQL

Authentication

- Laravel Breeze

API

- Google Sheets API
- Microsoft Graph API (Opsional)

---

# Design Goals

✔ Mudah digunakan

✔ Cepat dipahami

✔ Responsif

✔ Konsisten

✔ Mudah dikembangkan

✔ Cocok untuk dashboard operasional PLN

---

# Roadmap

## Phase 1

- Layout Dashboard
- Sidebar
- Navbar
- Footer
- Placeholder

---

## Phase 2

- KPI Cards
- Charts
- Tables

---

## Phase 3

- Filter
- Export
- Search

---

## Phase 4

- Authentication
- Role Management
- Notification
- Audit Log

---

# Current UI Implementation

## Branding

Navbar dan halaman login menggunakan asset lokal `public/images/Logo_PLN.svg`
sebagai logo utama. Lockup brand menampilkan `Energi Primer` sebagai judul
utama dan `Team` sebagai subtitle.

## Navigation and Access

- Setiap item sidebar hanya menampilkan icon dan label utama; subtitle menu
  dihilangkan.
- State aktif sidebar mengikuti route saat ini dan page header/breadcrumb tetap
  menjadi konteks halaman.
- `Pengaturan` dihilangkan dari primary sidebar navigation.
- Route `/pengaturan` dan fungsi profil/password tetap dipertahankan melalui
  entry `Pengaturan Profil` pada menu akun.
- `User Management` dan `Audit Log` tetap tersedia untuk ADMIN dengan guard
  authorization yang sama.

## Overview Presentation

- KPI card Overview hanya menampilkan judul KPI, nilai, unit, dan konteks
  periode/status yang relevan; explanatory calculation text dan source text
  tidak ditampilkan.
- Panel informasi `Sumber aktif`/`Periode` dihapus dari presentation Overview.
- Filter tanggal/bulan/tahun dan sumber data tetap menjadi bagian dari logic
  dashboard dan tidak diubah.

## Validation and Task Status

- `npm.cmd run lint`: PASS.
- `npm.cmd run build`: PASS; seluruh route existing tetap masuk build output.
- `npm.cmd run user-management:ui:verify`: PASS.
- `npm.cmd run auth:security:verify`: PASS.
- `npm.cmd run authz:security:verify`: PASS.
- `npm.cmd run dashboard:verify-cutoff`: PASS.
- Local production smoke: `/login` 200 dengan branding baru; seluruh route
  protected yang diuji mengembalikan redirect 307 ke login tanpa session dan
  tidak menunjukkan runtime-error signature.
- `npm.cmd run auth:verify`: BLOCKED karena environment tidak menyediakan
  `AUTH_TEST_ADMIN_EMAIL` dan `AUTH_TEST_ADMIN_PASSWORD`; authenticated role
  E2E perlu dijalankan terpisah dengan credential test yang aman.

Status task: **PASS_WITH_REVIEW**. UI wajib telah diimplementasikan dan
verifikasi read-only/auth boundary lulus; authenticated ADMIN-vs-USER E2E
masih memerlukan environment credential test.

End of Document
