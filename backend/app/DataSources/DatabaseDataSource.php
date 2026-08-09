<?php

namespace App\DataSources;

/**
 * DatabaseDataSource — STUB untuk Fase 2
 *
 * Implementasi ini akan diisi pada Fase 2 ketika data
 * sudah disinkronkan ke PostgreSQL oleh scheduler.
 *
 * Untuk mengaktifkan: ubah binding di AppServiceProvider:
 *   GoogleSheetsDataSource::class → DatabaseDataSource::class
 *
 * PT PLN Indonesia Power UBP Jeranjang
 */
class DatabaseDataSource implements DataSourceInterface
{
    public function getDashboardData(int $month, int $year, ?int $day = null): array
    {
        // TODO: Fase 2 — implementasi query PostgreSQL
        throw new \RuntimeException('DatabaseDataSource belum diimplementasikan (Fase 2).');
    }
}
