# migration-plan.md

# Laravel Migration Plan

## Dashboard Monitoring Efisiensi Batu Bara

---

# Migration Order

Migration harus dibuat sesuai urutan berikut.

## Phase 1

Master Table

```
units
```

---

## Phase 2

Operational Table

```
coal_stock
```

---

## Phase 3

Monitoring Table

```
coal_quality
```

```
coal_consumption
```

```
power_generation
```

```
kpi_targets
```

---

## Phase 4

System Table

```
spreadsheet_import_logs
```

---

# Laravel Commands

## Unit

```bash
php artisan make:model Unit -m
```

---

## Coal Stock

```bash
php artisan make:model CoalStock -m
```

---

## Coal Quality

```bash
php artisan make:model CoalQuality -m
```

---

## Coal Consumption

```bash
php artisan make:model CoalConsumption -m
```

---

## Power Generation

```bash
php artisan make:model PowerGeneration -m
```

---

## KPI Target

```bash
php artisan make:model KpiTarget -m
```

---

## Spreadsheet Import Log

```bash
php artisan make:model SpreadsheetImportLog -m
```

---

# Migration Sequence

```
units

↓

coal_stock

↓

coal_quality

↓

coal_consumption

↓

power_generation

↓

kpi_targets

↓

spreadsheet_import_logs
```

---

# Seeder Sequence

```
UnitSeeder

↓

CoalStockSeeder

↓

CoalQualitySeeder

↓

CoalConsumptionSeeder

↓

PowerGenerationSeeder

↓

KpiTargetSeeder

↓

DatabaseSeeder
```

---

# Deployment Sequence

```
php artisan migrate

↓

php artisan db:seed

↓

php artisan serve
```

---

# Notes

Semua migration wajib menggunakan:

- Foreign Key
- Timestamp
- Soft Delete (opsional pada tabel operasional)
- Laravel Naming Convention