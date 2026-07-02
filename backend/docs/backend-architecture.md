# backend-architecture.md

# Backend Architecture

## Dashboard Monitoring Efisiensi Batu Bara

---

# Architecture Overview

```text
                     Google Sheets
                           │
                           ▼
                  Google Sheets API
                           │
                           ▼
                 Spreadsheet Service
                           │
                           ▼
                 Import Validation
                           │
                           ▼
                    PostgreSQL
                           │
             ┌─────────────┴──────────────┐
             ▼                            ▼
          Eloquent ORM               Dashboard Service
             │                            │
             └─────────────┬──────────────┘
                           ▼
                     Controller Layer
                           │
                           ▼
                      Blade Template
                           │
                           ▼
                        User Browser
```

---

# Folder Structure

```
app
│
├── Http
│   ├── Controllers
│   │
│   ├── DashboardController
│   ├── CoalController
│   ├── StockController
│   └── ReportController
│
├── Models
│   ├── Unit
│   ├── CoalStock
│   ├── CoalQuality
│   ├── CoalConsumption
│   ├── PowerGeneration
│   ├── KpiTarget
│   └── SpreadsheetImportLog
│
├── Services
│   ├── DashboardService
│   ├── SpreadsheetImportService
│   ├── KPIService
│   └── StockCalculationService
│
└── Helpers
```

---

# Request Flow

```
Browser

↓

Route

↓

Controller

↓

Service

↓

Model

↓

PostgreSQL

↓

Service

↓

Controller

↓

Blade

↓

Browser
```

---

# Import Flow

```
CSV

↓

SpreadsheetImportService

↓

Validation

↓

Database

↓

Dashboard
```

Future:

```
Google Sheets

↓

Google Sheets API

↓

SpreadsheetImportService

↓

Validation

↓

Database

↓

Dashboard
```

---

# Service Responsibility

## DashboardService

- Dashboard Summary
- KPI Card
- Dashboard Statistics

---

## SpreadsheetImportService

- Import CSV
- Import Google Sheets
- Data Validation
- Duplicate Checking

---

## KPIService

- KPI Calculation
- SFC
- Heat Rate
- Boiler Efficiency

---

## StockCalculationService

- Opening Stock
- Closing Stock
- Daily Stock
- Monthly Stock

---

# Development Roadmap

```
Migration

↓

Model

↓

Seeder

↓

Authentication

↓

Dashboard Layout

↓

Import CSV

↓

Google Sheets Integration

↓

Dashboard Monitoring

↓

Report

↓

Deployment
```

---

# Design Principles

- MVC Architecture
- Service Layer Pattern
- Repository-ready Structure
- REST API Ready
- Google Sheets Ready
- PostgreSQL Optimized
- Scalable for Multi-PLTU