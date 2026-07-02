<?php

namespace App\Http\Controllers;

use App\Models\CoalConsumption;
use App\Models\CoalStock;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index()
    {
        // ── Referensi tanggal: pakai date terbaru di DB ──────────────────
        $latestDbDate = CoalConsumption::max('date') ?? date('Y-m-d');         // e.g. "2025-12-31"

        $reqMonth = request('month');
        $reqYear  = request('year');

        if ($reqMonth && $reqYear) {
            $refDate = Carbon::createFromDate($reqYear, $reqMonth, 1)->endOfMonth();
            $effectiveLatestDate = CoalConsumption::whereYear('date', $reqYear)
                                                  ->whereMonth('date', $reqMonth)
                                                  ->max('date') ?? $refDate->toDateString();
        } else {
            $refDate = Carbon::parse($latestDbDate);
            $effectiveLatestDate = $latestDbDate;
            $reqMonth = $refDate->format('m');
            $reqYear  = $refDate->format('Y');
        }

        $monthStart = $refDate->copy()->startOfMonth()->toDateString();
        $monthEnd   = $refDate->copy()->endOfMonth()->toDateString();
        $prevStart  = $refDate->copy()->subMonth()->startOfMonth()->toDateString();
        $prevEnd    = $refDate->copy()->subMonth()->endOfMonth()->toDateString();
        $monthLabel = $refDate->locale('id')->isoFormat('MMMM YYYY');

        $filterMonth = $reqMonth;
        $filterYear  = $reqYear;

        // ── KPI 1: Total Konsumsi bulan ini ──────────────────────────────
        $totalConsumption = (float) CoalConsumption::whereBetween('date', [$monthStart, $monthEnd])
            ->sum('coal_used');
        $prevConsumption  = (float) CoalConsumption::whereBetween('date', [$prevStart, $prevEnd])
            ->sum('coal_used');
        $consumptionTrend = $prevConsumption > 0
            ? round((($totalConsumption - $prevConsumption) / $prevConsumption) * 100, 1)
            : 0;

        // ── KPI 2: Rata-rata Efisiensi Boiler ────────────────────────────
        $avgEfficiency  = round((float) CoalConsumption::whereBetween('date', [$monthStart, $monthEnd])
            ->avg('boiler_efficiency'), 2);
        $prevEfficiency = round((float) CoalConsumption::whereBetween('date', [$prevStart, $prevEnd])
            ->avg('boiler_efficiency'), 2);
        $efficiencyTrend = round($avgEfficiency - $prevEfficiency, 2);

        // ── KPI 3: Rata-rata Heat Rate ────────────────────────────────────
        $avgHeatRate  = (int) round((float) CoalConsumption::whereBetween('date', [$monthStart, $monthEnd])
            ->avg('heat_rate'));
        $prevHeatRate = (int) round((float) CoalConsumption::whereBetween('date', [$prevStart, $prevEnd])
            ->avg('heat_rate'));
        $heatRateTrend = $avgHeatRate - $prevHeatRate;      // negatif = lebih baik

        // ── KPI 4: Stock Batu Bara (terbaru) ─────────────────────────────
        $latestStock       = CoalStock::orderBy('date', 'desc')->first();
        $maxStockCapacity  = 70000; // ton
        $stockPct          = $latestStock
            ? min(100, round(($latestStock->closing_stock / $maxStockCapacity) * 100))
            : 0;

        // ── Sparkline konsumsi: 7 hari terakhir ──────────────────────────
        $sevenDayStart = Carbon::parse($effectiveLatestDate)->subDays(6)->toDateString();
        $sparklineRaw  = CoalConsumption::selectRaw('date, SUM(coal_used) as total')
            ->whereBetween('date', [$sevenDayStart, $effectiveLatestDate])
            ->groupBy('date')
            ->orderBy('date')
            ->pluck('total')
            ->map(fn ($v) => (float) $v)
            ->toArray();

        $maxSpark  = max($sparklineRaw ?: [1]);
        $sparkline = array_map(fn ($v) => max(10, (int) round($v / $maxSpark * 100)), $sparklineRaw);
        while (count($sparkline) < 7) {
            array_unshift($sparkline, 15);
        }

        // ── Sparkline heat rate: 7 hari terakhir ─────────────────────────
        $hrRaw = CoalConsumption::selectRaw('date, AVG(heat_rate) as avg_hr')
            ->whereBetween('date', [$sevenDayStart, $effectiveLatestDate])
            ->groupBy('date')
            ->orderBy('date')
            ->pluck('avg_hr')
            ->map(fn ($v) => (float) $v)
            ->toArray();

        $maxHr    = max($hrRaw ?: [1]);
        $minHr    = min($hrRaw ?: [0]);
        $range    = ($maxHr - $minHr) ?: 1;
        $hrSparkline = array_map(
            fn ($v) => max(10, (int) round(($v - $minHr) / $range * 100)),
            $hrRaw
        );
        while (count($hrSparkline) < 7) {
            array_unshift($hrSparkline, 50);
        }

        // ── Performa unit (tanggal terbaru) ───────────────────────────────
        $unitPerformance = DB::table('coal_consumption as cc')
            ->join('units as u', 'u.id', '=', 'cc.unit_id')
            ->where('cc.date', $effectiveLatestDate)
            ->select(['u.name as unit_name', 'cc.coal_used', 'cc.boiler_efficiency', 'cc.heat_rate', 'cc.sfc'])
            ->orderBy('u.name')
            ->get();

        // ── Aktivitas terbaru (5 record terakhir berbeda tanggal+unit) ────
        // Kita batasi aktivitas terbaru berdasarkan monthEnd agar filter berguna
        $recentActivity = DB::table('coal_consumption as cc')
            ->join('units as u', 'u.id', '=', 'cc.unit_id')
            ->where('cc.date', '<=', $effectiveLatestDate)
            ->select(['cc.date', 'u.name as unit_name', 'cc.coal_used', 'cc.boiler_efficiency', 'cc.heat_rate'])
            ->orderBy('cc.date', 'desc')
            ->orderBy('u.name')
            ->limit(5)
            ->get();

        // ── Tabel monitoring bawah (5 record terakhir, join quality) ─────
        $monitoringTable = DB::table('coal_consumption as cc')
            ->join('units as u', 'u.id', '=', 'cc.unit_id')
            ->leftJoin('coal_quality as cq', function ($join) {
                $join->on('cq.unit_id', '=', 'cc.unit_id')
                     ->on('cq.date', '=', 'cc.date');
            })
            ->where('cc.date', '<=', $effectiveLatestDate)
            ->select([
                'cc.date', 'u.name as unit_name',
                'cq.gar', 'cq.moisture', 'cq.ash', 'cq.sulfur',
                'cc.coal_used', 'cc.heat_rate', 'cc.boiler_efficiency',
            ])
            ->orderBy('cc.date', 'desc')
            ->orderBy('u.name')
            ->limit(5)
            ->get();

        $totalMonitoringCount = CoalConsumption::count();

        return view('dashboard.index', compact(
            'effectiveLatestDate', 'monthLabel', 'filterMonth', 'filterYear',
            'totalConsumption', 'consumptionTrend', 'sparkline',
            'avgEfficiency', 'efficiencyTrend',
            'avgHeatRate', 'heatRateTrend', 'hrSparkline',
            'latestStock', 'stockPct', 'maxStockCapacity',
            'unitPerformance', 'recentActivity',
            'monitoringTable', 'totalMonitoringCount'
        ));
    }
}
