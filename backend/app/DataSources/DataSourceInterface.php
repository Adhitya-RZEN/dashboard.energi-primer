<?php

namespace App\DataSources;

interface DataSourceInterface
{
    /**
     * Ambil seluruh data KPI dashboard untuk bulan, tahun, dan (opsional) hari tertentu.
     *
     * @param int      $month  Bulan (1–12)
     * @param int      $year   Tahun (mis. 2026)
     * @param int|null $day    Tanggal (1–31). Null = pakai tanggal hari ini (default lama).
     */
    public function getDashboardData(int $month, int $year, ?int $day = null): array;
}