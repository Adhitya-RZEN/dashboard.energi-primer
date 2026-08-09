<?php

namespace App\DataSources;

/**
 * DataSourceInterface
 *
 * Kontrak yang harus diimplementasikan oleh semua sumber data.
 * Memungkinkan penggantian sumber data (Google Sheets → PostgreSQL)
 * tanpa mengubah Controller maupun View.
 *
 * PT PLN Indonesia Power UBP Jeranjang
 */
interface DataSourceInterface
{
    /**
     * Ambil seluruh data KPI dashboard untuk bulan dan tahun tertentu.
     *
     * @param int $month  Bulan (1–12)
     * @param int $year   Tahun (mis. 2026)
     * @return array {
     *   today_row: int|null,
     *   worksheet: string,
     *   biomassa: array,
     *   batubara: array,
     *   stock: array,
     *   solar: array,
     *   target_biomassa: array,
     *   meta: array
     * }
     */
    public function getDashboardData(int $month, int $year): array;
}
