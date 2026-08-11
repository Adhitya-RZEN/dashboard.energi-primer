<?php

namespace App\Http\Controllers;

use App\Services\DashboardService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * DashboardController
 *
 * Menerima request HTTP, memanggil DashboardService,
 * lalu mengirim data yang sudah diformat ke View.
 *
 * Tidak ada logika bisnis maupun query langsung di sini.
 *
 * PT PLN Indonesia Power UBP Jeranjang
 */
class DashboardController extends Controller
{
    public function __construct(
        private readonly DashboardService $dashboardService
    ) {}

 private function prepareDashboardData(Request $request): array
{
    // Ambil dari query string jika ada; kalau tidak, fallback ke session; kalau tidak ada juga, fallback ke default.
    $filterMonth = (int) ($request->input('month')
        ?? session('dashboard_filter_month')
        ?? date('n'));

    $filterYear = (int) ($request->input('year')
        ?? session('dashboard_filter_year')
        ?? date('Y'));

    $filterDay = $request->has('day')
        ? ($request->input('day') !== '' ? (int) $request->input('day') : null)
        : session('dashboard_filter_day'); // null jika belum pernah difilter

    $filterMonth = max(1, min(12, $filterMonth));
    $filterYear  = max(2024, min((int) date('Y') + 1, $filterYear));

    if ($filterDay !== null) {
        $daysInMonth = (int) \Carbon\Carbon::create($filterYear, $filterMonth, 1)->daysInMonth;
        $filterDay   = max(1, min($daysInMonth, $filterDay));
    }

    // Simpan kembali ke session supaya halaman lain ikut memakainya
    session([
        'dashboard_filter_month' => $filterMonth,
        'dashboard_filter_year'  => $filterYear,
        'dashboard_filter_day'   => $filterDay,
    ]);

    $data = null;
    $error = null;

    try {
        $data = $this->dashboardService->getDashboard($filterMonth, $filterYear, $filterDay);
    } catch (\Exception $e) {
        Log::error('[DashboardController] Gagal mengambil data: ' . $e->getMessage());
        $error = 'Gagal terhubung ke Google Sheets. Detail: ' . $e->getMessage();
    }

    if ($data === null) {
        $data = $this->emptyData($filterMonth, $filterYear);
    }

    $meta       = $data['meta'];
    $monthLabel = ($meta['month_name'] ?? '') . ' ' . ($meta['year'] ?? $filterYear);

    $biomassa = $data['biomassa'];
    $batubara = $data['batubara'];
    $stock = $data['stock'];
    $solar = $data['solar'];
    $targetBiomassa = $data['target_biomassa'];
    $chartSeries = $data['daily_series'] ?? [];

    $stockPct = DashboardService::stockPct($stock['stock_batubara'], 70000);
    $fallbackNotice = $data['fallback_notice'] ?? null;

    return compact(
        'filterMonth',
        'filterYear',
        'filterDay',
        'monthLabel',
        'error',
        'data',
        'biomassa',
        'batubara',
        'stock',
        'solar',
        'targetBiomassa',
        'stockPct',
        'fallbackNotice',
        'chartSeries'
    );
}

    public function overview(Request $request)
    {
        $viewData = $this->prepareDashboardData($request);
        return view('dashboard.overview', $viewData);
    }

    public function biomassa(Request $request)
    {
        $viewData = $this->prepareDashboardData($request);
        return view('dashboard.biomassa', $viewData);
    }

    public function batubara(Request $request)
    {
        $viewData = $this->prepareDashboardData($request);
        return view('dashboard.batubara', $viewData);
    }

    public function stok(Request $request)
    {
        $viewData = $this->prepareDashboardData($request);
        return view('dashboard.stok', $viewData);
    }

    public function solar(Request $request)
    {
        $viewData = $this->prepareDashboardData($request);
        return view('dashboard.solar', $viewData);
    }

    public function target(Request $request)
    {
        $viewData = $this->prepareDashboardData($request);
        return view('dashboard.target', $viewData);
    }

    // ── Helpers ────────────────────────────────────────────────────────

    private function emptyData(int $month, int $year): array
    {
        $monthNames = [
            1=>'Januari',2=>'Februari',3=>'Maret',4=>'April',5=>'Mei',6=>'Juni',
            7=>'Juli',8=>'Agustus',9=>'September',10=>'Oktober',11=>'November',12=>'Desember',
        ];

        return [
            'worksheet'  => ($monthNames[$month] ?? '') . substr($year, -2) . '-BB',
            'today_row'  => null,
            'today_date' => date('d F Y'),
            'biomassa'   => ['penerimaan_bulanan'=>0,'pemakaian_bulanan'=>0,'unit1_harian'=>0,'unit2_harian'=>0,'unit3_harian'=>0,'total_pemakaian_batubara_bulanan'=>0],
            'batubara'   => ['penerimaan_bulanan'=>0,'unit1_harian'=>0,'unit2_harian'=>0,'unit3_harian'=>0,'pemakaian_harian'=>0],
            'stock'      => ['stock_batubara'=>0,'hop'=>0,'hop_status'=>'danger','hop_label'=>'Kritis'],
            'solar'      => ['pemakaian_harian'=>0,'pemakaian_bulanan'=>0,'penerimaan_bulanan'=>0],
            'target_biomassa' => ['target'=>70020,'realisasi_kumulatif'=>0,'kumulatif'=>0,'progress'=>0,'sisa'=>70020],
            'meta'       => ['month'=>$month,'year'=>$year,'month_name'=>$monthNames[$month]??'','fetched_at'=>now()->toDateTimeString()],
        ];
    }
}
