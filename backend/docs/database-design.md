# Database Design
## Dashboard Monitoring Efisiensi Batu Bara PLN

---

# Overview

Database menggunakan PostgreSQL dengan Laravel Eloquent ORM.

## Entity Relationship

```
units
│
├── coal_quality
├── coal_consumption
├── power_generation
└── kpi_target

coal_stock
```

---

# Table : units

| Column | Type | Constraint |
|---------|------|------------|
| id | BIGINT | PK |
| code | VARCHAR(20) | UNIQUE |
| name | VARCHAR(100) | |
| status | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

---

# Table : coal_stock

| Column | Type |
|---------|------|
| id | BIGINT |
| date | DATE |
| opening_stock | DECIMAL(12,2) |
| received | DECIMAL(12,2) |
| consumed | DECIMAL(12,2) |
| closing_stock | DECIMAL(12,2) |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

---

# Table : coal_quality

| Column | Type |
|---------|------|
| id | BIGINT |
| unit_id | BIGINT FK |
| date | DATE |
| gar | DECIMAL(8,2) |
| moisture | DECIMAL(5,2) |
| ash | DECIMAL(5,2) |
| sulfur | DECIMAL(5,3) |
| hgi | DECIMAL(5,2) |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

---

# Table : coal_consumption

| Column | Type |
|---------|------|
| id | BIGINT |
| unit_id | BIGINT FK |
| date | DATE |
| coal_used | DECIMAL(12,2) |
| sfc | DECIMAL(8,2) |
| heat_rate | DECIMAL(8,2) |
| boiler_efficiency | DECIMAL(5,2) |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

---

# Table : power_generation

| Column | Type |
|---------|------|
| id | BIGINT |
| unit_id | BIGINT FK |
| date | DATE |
| average_load | DECIMAL(8,2) |
| power_generation | DECIMAL(12,2) |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

---

# Table : kpi_target

| Column | Type |
|---------|------|
| id | BIGINT |
| unit_id | BIGINT FK |
| date | DATE |
| target_sfc | DECIMAL(8,2) |
| actual_sfc | DECIMAL(8,2) |
| target_heat_rate | DECIMAL(8,2) |
| actual_heat_rate | DECIMAL(8,2) |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

---

# Relationships

- Unit 1:N CoalQuality
- Unit 1:N CoalConsumption
- Unit 1:N PowerGeneration
- Unit 1:N KpiTarget

---

# Development Flow

1. Migration
2. Model
3. Seeder
4. Import CSV
5. Dashboard
6. Google Sheets Integration