<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

/**
 * MonitoringController
 *
 * Fase 1: Halaman monitoring menampilkan placeholder
 * karena sumber data utama adalah Google Sheets (bukan DB).
 *
 * Fase 2: Refactor untuk menggunakan DatabaseDataSource
 * setelah migrasi ke PostgreSQL selesai.
 *
 * PT PLN Indonesia Power UBP Jeranjang
 */
class MonitoringController extends Controller
{
    public function index(Request $request)
    {
        $dateFrom = $request->get('date_from', date('Y-m-01'));
        $dateTo   = $request->get('date_to',   date('Y-m-d'));
        $unitId   = $request->get('unit_id');
        $kpiDate  = $dateTo;

        // Fase 1: tidak ada DB — kirim koleksi kosong ke view
        $units   = collect();
        $records = new LengthAwarePaginator([], 0, 15);

        return view('monitoring.index', [
            'units'          => $units,
            'latestDate'     => date('Y-m-d'),
            'dateFrom'       => $dateFrom,
            'dateTo'         => $dateTo,
            'unitId'         => $unitId,
            'kpiDate'        => $kpiDate,
            'kpiConsumption' => 0,
            'kpiEfficiency'  => 0,
            'kpiHeatRate'    => 0,
            'kpiStock'       => null,
            'records'        => $records,
            'phase1Notice'   => true,
        ]);
    }
}
