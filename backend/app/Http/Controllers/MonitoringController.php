<?php

namespace App\Http\Controllers;

use App\Models\CoalConsumption;
use App\Models\CoalStock;
use App\Models\Unit;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class MonitoringController extends Controller
{
    public function index(Request $request)
    {
        // Daftar unit untuk dropdown filter
        $units = Unit::orderBy('name')->get();

        // Referensi tanggal terbaru di DB
        $latestDate = CoalConsumption::max('date');
        $refDate    = Carbon::parse($latestDate);

        // ── Filter params ──────────────────────────────────────────────────
        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');
        $unitId   = $request->get('unit_id');

        // Default filter: tampilkan bulan terakhir
        if (! $dateFrom && ! $dateTo) {
            $dateFrom = $refDate->copy()->startOfMonth()->toDateString();
            $dateTo   = $latestDate;
        }

        // ── KPI hari terakhir (atau hari terpilih) ────────────────────────
        $kpiDate = $dateTo ?: $latestDate;

        $kpiQuery = CoalConsumption::where('date', $kpiDate);
        if ($unitId) {
            $kpiQuery->where('unit_id', $unitId);
        }

        $kpiRows = $kpiQuery->get();

        $kpiConsumption = $kpiRows->sum('coal_used');
        $kpiEfficiency  = round($kpiRows->avg('boiler_efficiency'), 2);
        $kpiHeatRate    = (int) round($kpiRows->avg('heat_rate'));

        // Stock terbaru
        $kpiStock = CoalStock::where('date', '<=', $kpiDate)->orderBy('date', 'desc')->first();

        // ── Tabel monitoring (join consumption + quality) ─────────────────
        $query = DB::table('coal_consumption as cc')
            ->join('units as u', 'u.id', '=', 'cc.unit_id')
            ->leftJoin('coal_quality as cq', function ($join) {
                $join->on('cq.unit_id', '=', 'cc.unit_id')
                     ->on('cq.date', '=', 'cc.date');
            })
            ->select([
                'cc.date', 'u.id as unit_id', 'u.name as unit_name',
                'cq.gar', 'cq.moisture', 'cq.ash', 'cq.sulfur', 'cq.hgi',
                'cc.coal_used', 'cc.sfc', 'cc.heat_rate', 'cc.boiler_efficiency',
            ]);

        if ($dateFrom) {
            $query->where('cc.date', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->where('cc.date', '<=', $dateTo);
        }
        if ($unitId) {
            $query->where('cc.unit_id', $unitId);
        }

        $records = $query
            ->orderBy('cc.date', 'desc')
            ->orderBy('u.name')
            ->paginate(15)
            ->withQueryString();

        return view('monitoring.index', compact(
            'units', 'latestDate', 'refDate',
            'dateFrom', 'dateTo', 'unitId',
            'kpiDate', 'kpiConsumption', 'kpiEfficiency', 'kpiHeatRate', 'kpiStock',
            'records'
        ));
    }
}
