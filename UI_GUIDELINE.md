# UI_GUIDELINE.md

# UI Guideline

## Dashboard Monitoring Efisiensi Batu Bara

### PT PLN Indonesia Power UBP Jeranjang

---

# Purpose

Dokumen ini menjadi acuan desain antarmuka (UI) agar seluruh halaman dashboard memiliki tampilan yang konsisten, profesional, mudah digunakan, dan mudah dikembangkan.

Dokumen ini berlaku untuk seluruh halaman dashboard.

---

# Design Philosophy

Dashboard harus memenuhi prinsip berikut.

* Clean
* Enterprise
* Modern
* Data-Oriented
* Professional
* Minimal
* Responsive
* Accessible

Fokus utama dashboard adalah membantu pengguna membaca data secepat mungkin.

---

# Visual Style

Gunakan desain yang sederhana.

Hindari:

* warna terlalu mencolok
* animasi berlebihan
* terlalu banyak icon
* card yang berlebihan
* gradient mencolok

Prioritaskan ruang kosong (white space) agar dashboard mudah dibaca.

---

# Color System

## Primary

| Name    | Color   |
| ------- | ------- |
| Primary | #005BAC |

Digunakan untuk

* Tombol utama
* Active Menu
* Active Tab
* Link
* Highlight

---

## Secondary

| Name      | Color   |
| --------- | ------- |
| Secondary | #0D47A1 |

Digunakan untuk

* Hover
* Active Button

---

## Background

| Name       | Color   |
| ---------- | ------- |
| Background | #F5F7FA |

---

## Surface

| Name  | Color   |
| ----- | ------- |
| White | #FFFFFF |

Semua card menggunakan warna putih.

---

## Border

| Name   | Color   |
| ------ | ------- |
| Border | #E5E7EB |

---

## Text

| Name    | Color   |
| ------- | ------- |
| Heading | #1F2937 |
| Body    | #4B5563 |
| Caption | #9CA3AF |

---

## Status Color

### Success

#22C55E

### Warning

#F59E0B

### Danger

#EF4444

### Info

#3B82F6

---

# Typography

## Font

Primary

Inter

Alternative

* Poppins
* Nunito Sans

---

## Font Weight

Light

300

Regular

400

Medium

500

Semi Bold

600

Bold

700

---

## Font Size

| Component       | Size |
| --------------- | ---- |
| Dashboard Title | 28px |
| Page Title      | 24px |
| Section Title   | 20px |
| Card Title      | 18px |
| Body            | 14px |
| Small Text      | 12px |

---

# Spacing

Gunakan kelipatan 8.

8

16

24

32

40

48

---

## Padding

Card

20px

Container

24px

Section

32px

---

## Margin

Component

20px

Page

24px

---

# Border Radius

Button

10px

Card

12px

Input

10px

Modal

16px

---

# Shadow

Gunakan shadow ringan.

Default

0 4px 12px rgba(0,0,0,.08)

Hover

0 6px 20px rgba(0,0,0,.12)

---

# Layout

Gunakan Grid 12 Columns.

Sidebar

260px

Navbar

72px

Footer

60px

Content Padding

24px

Gap

20px

---

# Button

## Primary

Background

Primary Blue

Text

White

Radius

10px

Height

44px

---

## Secondary

Background

White

Border

Primary Blue

Text

Primary Blue

---

## Danger

Background

Red

Text

White

---

# Input

Semua input memiliki

Height

44px

Radius

10px

Padding Horizontal

16px

Border

1px

Placeholder

Gray

---

# Table

Header

Background

#F8FAFC

Text

Semi Bold

Body

White

Hover

#F1F5F9

Pagination

Bottom Right

Sorting

Enabled

---

# Card

Radius

12px

Background

White

Padding

20px

Shadow

Default Shadow

Hover

Sedikit naik menggunakan transform.

---

# Icon

Ukuran

20px

Alternatif

24px

Gunakan

* Heroicons
* Lucide

Jangan mencampur banyak style icon.

---

# Navigation

Sidebar

* Dashboard
* Monitoring
* Data Batu Bara
* Laporan
* Pengaturan

Navbar

* Logo
* Dashboard Title
* Notification
* User Profile

---

# Breadcrumb

Contoh

Dashboard

↓

Monitoring

↓

Detail

---

# Loading

Gunakan Skeleton Loading.

Hindari Spinner yang lama.

---

# Empty State

Jika data kosong tampilkan ilustrasi sederhana.

Pesan

"Tidak ada data yang tersedia."

---

# Error State

Gunakan icon warning.

Contoh

"Gagal mengambil data."

---

# Success State

Gunakan icon check.

Contoh

"Data berhasil diperbarui."

---

# Responsive

Desktop

≥1200px

Sidebar tetap.

---

Tablet

768px–1199px

Sidebar collapse.

---

Mobile

≤767px

Sidebar menjadi Drawer.

Card ditampilkan satu kolom.

---

# Animation

Durasi

200ms

Transition

Ease In Out

Hover

Scale 1.02

Tidak menggunakan animasi yang mengganggu.

---

# Accessibility

Minimum font

14px

Kontras

WCAG AA

Semua button memiliki focus state.

Keyboard Navigation

Didukung.

---

# Naming Convention

Gunakan nama yang konsisten.

Contoh

btn-primary

card-default

table-monitoring

sidebar-menu

page-header

dashboard-container

---

# UI Consistency Rules

Seluruh halaman wajib menggunakan:

* warna yang sama
* ukuran font yang sama
* border radius yang sama
* spacing yang sama
* icon yang sama
* button style yang sama
* card style yang sama

Tidak diperbolehkan membuat variasi baru tanpa alasan yang jelas.

---

# Future Improvement

* Dark Mode
* Compact Layout
* Multi Theme
* Dashboard Personalization
* Custom Widget

---

End of UI Guideline
