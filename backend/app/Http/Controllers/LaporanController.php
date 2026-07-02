<?php

namespace App\Http\Controllers;

use App\Models\CoalConsumption;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class LaporanController extends Controller
{
    public function index(Request $request)
    {
        // ── Ambil semua bulan yang tersedia di DB ──────────────────────────
        $monthlyReports = DB::table('coal_consumption')
            ->selectRaw("
                TO_CHAR(date, 'YYYY-MM')        AS year_month,
                TO_CHAR(date, 'TMMonth YYYY')   AS period_label,
                EXTRACT(YEAR  FROM date)::int    AS year,
                EXTRACT(MONTH FROM date)::int    AS month,
                ROUND(SUM(coal_used)::numeric, 2)          AS total_coal,
                ROUND(AVG(boiler_efficiency)::numeric, 2)  AS avg_efficiency,
                ROUND(AVG(heat_rate)::numeric, 0)          AS avg_heat_rate,
                ROUND(AVG(sfc)::numeric, 2)                AS avg_sfc,
                COUNT(DISTINCT date)                       AS days_count
            ")
            ->groupByRaw("TO_CHAR(date, 'YYYY-MM'), TO_CHAR(date, 'TMMonth YYYY'), EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)")
            ->orderByRaw("TO_CHAR(date, 'YYYY-MM') DESC")
            ->get();

        // ── Ringkasan keseluruhan dataset ─────────────────────────────────
        $summary = DB::table('coal_consumption')->selectRaw("
            ROUND(SUM(coal_used)::numeric, 2)         AS grand_total_coal,
            ROUND(AVG(boiler_efficiency)::numeric, 2) AS overall_efficiency,
            ROUND(AVG(heat_rate)::numeric, 0)         AS overall_heat_rate,
            MIN(date)                                 AS earliest_date,
            MAX(date)                                 AS latest_date,
            COUNT(DISTINCT date)                      AS total_days
        ")->first();

        return view('laporan.index', compact('monthlyReports', 'summary'));
    }
}
