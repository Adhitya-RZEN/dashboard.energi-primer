# erd.md

# Entity Relationship Diagram (ERD)

## Dashboard Monitoring Efisiensi Batu Bara PLTU

---

## Overview

Database menggunakan PostgreSQL dengan Laravel Eloquent ORM.

Database dirancang agar mudah dikembangkan ketika nantinya sumber data berpindah dari Dummy CSV ke Google Sheets API tanpa mengubah struktur utama.

---

## Entity Relationship Diagram

```text
                         +------------------+
                         |      users       |
                         +------------------+
                                  |
                                  |
                           Authentication
                                  |
                                  ▼

                         +------------------+
                         |      units       |
                         +------------------+
                         | id (PK)          |
                         | code             |
                         | name             |
                         | status           |
                         +------------------+
                           ▲     ▲      ▲
                           │     │      │
        ┌──────────────────┘     │      └───────────────────┐
        │                        │                          │
        ▼                        ▼                          ▼

+------------------+    +--------------------+    +----------------------+
| coal_quality     |    | coal_consumption   |    | power_generation     |
+------------------+    +--------------------+    +----------------------+
| id               |    | id                 |    | id                   |
| unit_id (FK)     |    | unit_id (FK)       |    | unit_id (FK)         |
| date             |    | date               |    | date                 |
| gar              |    | coal_used          |    | average_load         |
| moisture         |    | sfc                |    | generation_mwh       |
| ash              |    | heat_rate          |    | capacity_factor      |
| sulfur           |    | boiler_efficiency  |    |                      |
| hgi              |    |                    |    |                      |
+------------------+    +--------------------+    +----------------------+
            ▲                    ▲                          ▲
            └──────────────┬─────┴───────────────┬──────────┘
                           │
                           ▼

                    +------------------+
                    |   kpi_targets    |
                    +------------------+
                    | id               |
                    | unit_id (FK)     |
                    | date             |
                    | target_sfc       |
                    | actual_sfc       |
                    | target_hr        |
                    | actual_hr        |
                    +------------------+

+------------------+
|   coal_stock     |
+------------------+
| id               |
| date             |
| opening_stock    |
| received         |
| consumed         |
| closing_stock    |
+------------------+

+------------------------------+
| spreadsheet_import_logs      |
+------------------------------+
| id                           |
| source                       |
| imported_rows                |
| status                       |
| message                      |
| imported_at                  |
+------------------------------+
```

---

## Relationship

| Parent | Child | Type |
|---------|--------|------|
| Unit | Coal Quality | One to Many |
| Unit | Coal Consumption | One to Many |
| Unit | Power Generation | One to Many |
| Unit | KPI Target | One to Many |

---

## Future Expansion

Database ini telah dipersiapkan untuk:

- Google Sheets API
- Microsoft Excel Import
- Multi PLTU
- Multi Supplier
- Historical Data
- Audit Log