# Dashboard Monitoring Data

## Deskripsi

Dashboard Monitoring Data merupakan aplikasi berbasis web yang digunakan untuk memonitor data dari Spreadsheet Online (Google Sheets atau Microsoft Excel Online) secara otomatis.

Sistem akan melakukan sinkronisasi data secara berkala menggunakan API resmi dari penyedia spreadsheet, menyimpan data ke PostgreSQL, kemudian menyajikannya dalam bentuk dashboard interaktif.

---

## Tujuan

- Monitoring data secara real-time (berdasarkan interval sinkronisasi)
- Visualisasi data dalam bentuk grafik
- Menyediakan laporan yang mudah dipahami
- Mengurangi proses input data secara manual

---

## Fitur

- Dashboard Monitoring
- KPI Summary
- Grafik Monitoring
- Tabel Data
- Filter Data
- Auto Synchronization
- Export Data
- Authentication
- Role Management

---

## Teknologi

| Layer | Teknologi |
|--------|-----------|
| Frontend | Blade + Bootstrap 5 |
| Backend | Laravel 12 |
| Database | PostgreSQL |
| Scheduler | Laravel Scheduler |
| Queue | Laravel Queue |
| Spreadsheet | Google Sheets / Microsoft Excel |
| API | Google Sheets API / Microsoft Graph API |

---

## High Level Architecture

```text
Spreadsheet Online
        │
        ▼
Google Sheets API / Microsoft Graph API
        │
        ▼
Laravel Backend
        │
        ▼
Service Layer
        │
        ▼
Repository Layer
        │
        ▼
PostgreSQL
        │
        ▼
Dashboard Website
```

---

## Folder Structure

```
app/
routes/
resources/
database/
storage/
public/
```

---

## Development Status

- [x] Project Planning
- [x] UI Design
- [x] Backend Development
- [ ] API Integration
- [ ] Dashboard
- [ ] Deployment