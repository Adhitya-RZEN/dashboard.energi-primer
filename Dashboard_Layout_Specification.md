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
- Nama Dashboard
- Notification (Future)
- User Profile
- Logout

Tinggi

72px

---

# Sidebar

Menu

- Dashboard
- Monitoring
- Data Batu Bara
- Laporan
- Pengaturan

Future

- Hak Akses
- Riwayat
- Audit Log

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

End of Document