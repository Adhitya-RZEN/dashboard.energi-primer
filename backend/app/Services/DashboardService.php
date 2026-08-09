<?php

namespace App\Services;

use App\DataSources\DataSourceInterface;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * DashboardService
 *
 * Lapisan bisnis antara DataSource dan Controller.
 * - Mengelola cache (TTL dari config)
 * - Memformat angka untuk konsumsi View
 * - Menghitung KPI turunan (progress bar, status warna, dsb.)
 *
 * PT PLN Indonesia Power UBP Jeranjang
 */
class DashboardService
{
    public function __construct(
        private readonly DataSourceInterface $dataSource
    ) {}

    /**
     * Ambil data dashboard yang sudah diformat, dengan cache.
     *
     * @param int $month  Bulan (1–12)
     * @param int $year   Tahun (mis. 2026)
     */
    public function getDashboard(int $month, int $year): array
    {
        $cacheKey = "dashboard_energi_primer_{$month}_{$year}";
        $ttl      = config('google.sheets.cache_ttl', 120);

        return Cache::remember($cacheKey, $ttl, function () use ($month, $year) {
            Log::info("[DashboardService] Cache miss — mengambil data dari DataSource (bulan={$month}, tahun={$year})");

            // Coba ambil data bulan yang diminta
            try {
                return $this->dataSource->getDashboardData($month, $year);
            } catch (\Exception $e) {
                Log::warning("[DashboardService] Sheet bulan={$month}, tahun={$year} tidak tersedia: " . $e->getMessage());
            }

            // Fallback: coba bulan-bulan sebelumnya (maks 12 bulan ke belakang)
            $fallbackMonth = $month;
            $fallbackYear  = $year;

            for ($i = 0; $i < 12; $i++) {
                $fallbackMonth--;
                if ($fallbackMonth < 1) {
                    $fallbackMonth = 12;
                    $fallbackYear--;
                }

                try {
                    Log::info("[DashboardService] Fallback ke bulan={$fallbackMonth}, tahun={$fallbackYear}");
                    $data = $this->dataSource->getDashboardData($fallbackMonth, $fallbackYear);

                    // Tandai bahwa ini data fallback agar UI bisa menampilkan notice
                    $fallbackMonthName = $data['meta']['month_name'] ?? '';
                    $data['fallback_notice'] = "Data bulan ini belum tersedia. Menampilkan data terakhir: {$fallbackMonthName} {$fallbackYear}.";
                    $data['meta']['is_fallback']       = true;
                    $data['meta']['requested_month']   = $month;
                    $data['meta']['requested_year']    = $year;

                    return $data;
                } catch (\Exception $e) {
                    Log::warning("[DashboardService] Fallback bulan={$fallbackMonth}, tahun={$fallbackYear} juga gagal: " . $e->getMessage());
                    continue;
                }
            }

            // Semua bulan gagal — lempar exception terakhir
            throw new \RuntimeException("Tidak dapat menemukan data sheet yang tersedia dalam 12 bulan terakhir.");
        });
    }

    /**
     * Hapus cache dashboard untuk bulan dan tahun tertentu.
     * Berguna untuk refresh manual (Fase 2).
     */
    public function clearCache(int $month, int $year): void
    {
        Cache::forget("dashboard_energi_primer_{$month}_{$year}");
    }

    // ── Format Helpers ─────────────────────────────────────────────────

    /**
     * Format angka ke format Indonesia: 1.234.567
     */
    public static function formatNumber(float $value, int $decimals = 0): string
    {
        return number_format($value, $decimals, ',', '.');
    }

    /**
     * Format angka ke satuan ton dengan angka Indonesia.
     */
    public static function formatTon(float $value): string
    {
        return self::formatNumber($value) . ' ton';
    }

    /**
     * Format persentase: 87,5%
     */
    public static function formatPct(float $value, int $decimals = 1): string
    {
        return number_format($value, $decimals, ',', '.') . '%';
    }

    /**
     * Hitung persentase stock relatif terhadap kapasitas.
     * Digunakan untuk progress bar Stock Batubara.
     */
    public static function stockPct(float $stock, float $capacity = 70000): int
    {
        if ($capacity <= 0) return 0;
        return (int) min(100, round(($stock / $capacity) * 100));
    }

    /**
     * Mapping status HOP ke kelas CSS.
     *
     * @param float $hop Nilai HOP dalam hari
     * @return string CSS class: danger | warning | success
     */
    public static function hopStatusClass(float $hop): string
    {
        return match(true) {
            $hop < 10  => 'danger',
            $hop < 15  => 'warning',
            default    => 'success',
        };
    }
}
