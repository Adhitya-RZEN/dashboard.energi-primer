<?php

namespace App\DataSources;

use Google\Client as GoogleClient;
use Google\Service\Sheets as GoogleSheets;
use Illuminate\Support\Facades\Log;

/**
 * GoogleSheetsDataSource
 *
 * Mengambil data KPI dari Google Spreadsheet menggunakan Google Sheets API v4.
 *
 * Struktur Worksheet:
 *   - Format nama: [Bulan][TahunPendek]-BB  (mis. Januari26-BB)
 *   - B11:B41  → Tanggal 1-31
 *   - Row 11–41 → Data harian
 *   - Row 42    → Total bulanan
 *
 * Satu request mengambil B11:CO59 (seluruh data sekaligus).
 * Row 59 kolom CO berisi Realisasi Kumulatif biomassa.
 *
 * PT PLN Indonesia Power UBP Jeranjang
 */
class GoogleSheetsDataSource implements DataSourceInterface
{
    private GoogleSheets $service;
    private string $spreadsheetId;

    // ── Nama bulan dalam Bahasa Indonesia ─────────────────────────────
    private const MONTH_NAMES = [
        1  => 'Januari',
        2  => 'Februari',
        3  => 'Maret',
        4  => 'April',
        5  => 'Mei',
        6  => 'Juni',
        7  => 'Juli',
        8  => 'Agustus',
        9  => 'September',
        10 => 'Oktober',
        11 => 'November',
        12 => 'Desember',
    ];

    // ── Indeks kolom relatif terhadap kolom B (index 0 = kolom B) ─────
    //    Range: B11:CJ42 → kolom B = index 0, C = 1, D = 2, …
    //    Rumus: 'A'=0, 'B'=1, … → kolIndex = ord($col) - ord('A')
    //    Karena range dimulai dari B: relIndex = absIndex - 1

    // Kolom BIOMASSA
    private const COL_BIOMASSA_PENERIMAAN_BULANAN = 17; // S
    private const COL_BIOMASSA_PEMAKAIAN_BULANAN = 27; // AC
    private const COL_BIOMASSA_UNIT1_HARIAN = 18; // T
    private const COL_BIOMASSA_UNIT2_HARIAN = 21; // W
    private const COL_BIOMASSA_UNIT3_HARIAN = 24; // Z
    private const COL_BATUBARA_PEMAKAIAN_BULANAN = 26; // AB

    // Kolom BATUBARA
    private const COL_BATUBARA_PENERIMAAN_BULANAN = 7; // I
    private const COL_BATUBARA_UNIT1_HARIAN = 17; // S
    private const COL_BATUBARA_UNIT2_HARIAN = 20; // V
    private const COL_BATUBARA_UNIT3_HARIAN = 23; // Y
    private const COL_BATUBARA_PEMAKAIAN_HARIAN = 26; // AB

    // Kolom STOCK
    private const COL_STOCK_BATUBARA = 28; // AD
    private const COL_HOP            = 34; // AJ

    // Kolom SOLAR
    private const COL_SOLAR_PEMAKAIAN_HARIAN  = 86; // CJ
    private const COL_SOLAR_PENERIMAAN_BULANAN = 79; // CC

    // Kolom TARGET & REALISASI BIOMASSA
    private const COL_REALISASI_KUMULATIF = 91; // CO

    // Rows
    private const ROW_TOTAL_INDEX = 31; // row 42 (42-11)
    private const ROW_BIOMASSA_PENERIMAAN_BULANAN_INDEX = 41; // row 52 (52-11)
    private const ROW_TARGET_BIOMASSA_INDEX = 45; // row 56 (56-11)
    private const ROW_REALISASI_KUMULATIF_INDEX = 48; // row 59 (59-11)

    // Target statis sementara
    private const TARGET_BIOMASSA_TON = 70020;

    public function __construct()
    {
        $credentialsPath = config('google.sheets.credentials_path');
        $this->spreadsheetId = config('google.sheets.spreadsheet_id');

        $client = new GoogleClient();
        $client->setApplicationName('Dashboard Energi Primer — PLN Jeranjang');
        $client->setScopes([GoogleSheets::SPREADSHEETS_READONLY]);
        $client->setAuthConfig($credentialsPath);

        // Abaikan verifikasi SSL lokal (menghindari cURL error 60 di Windows)
        $guzzleClient = new \GuzzleHttp\Client(['verify' => false]);
        $client->setHttpClient($guzzleClient);

        $this->service = new GoogleSheets($client);
    }

    /**
     * Ambil seluruh data KPI untuk bulan dan tahun tertentu.
     */
    public function getDashboardData(int $month, int $year): array
    {
        $worksheetName = $this->buildWorksheetName($month, $year);
        $range         = config('google.sheets.data_range', 'B11:CO59');
        $fullRange     = "'{$worksheetName}'!{$range}";

        Log::info("[GoogleSheetsDataSource] Fetching: {$fullRange}");

        try {
            $response = $this->service->spreadsheets_values->get(
                $this->spreadsheetId,
                $fullRange
            );

            $rows = $response->getValues() ?? [];
        } catch (\Exception $e) {
            Log::error("[GoogleSheetsDataSource] API Error: " . $e->getMessage());
            throw $e;
        }

        if (empty($rows)) {
            return $this->emptyResponse($worksheetName);
        }

        // Row 42 = index 31 (total bulanan)
        $totalRow = $rows[self::ROW_TOTAL_INDEX] ?? [];
        $row52 = $rows[self::ROW_BIOMASSA_PENERIMAAN_BULANAN_INDEX] ?? [];
        $row56 = $rows[self::ROW_TARGET_BIOMASSA_INDEX] ?? [];
        $realisasiRow = $rows[self::ROW_REALISASI_KUMULATIF_INDEX] ?? [];

        // Cari baris hari ini
        $today    = (int) date('j'); // hari tanpa leading zero
        $todayRowIndex = $this->findTodayRow($rows, $today);
        $dailyRow = $todayRowIndex !== null ? ($rows[$todayRowIndex] ?? []) : [];

        // Tentukan tanggal yang sesuai dengan data yang diambil
        $actualDay = $todayRowIndex !== null ? ($todayRowIndex + 1) : $today;
        $monthName = self::MONTH_NAMES[$month] ?? '';
        $actualDate = str_pad($actualDay, 2, '0', STR_PAD_LEFT) . " {$monthName} {$year}";

        return [
            'worksheet'  => $worksheetName,
            'today_row'  => $todayRowIndex !== null ? ($todayRowIndex + 11) : null,
            'today_date' => $actualDate,
            'biomassa'   => $this->parseBiomassa($totalRow, $row52, $dailyRow),
            'batubara'   => $this->parseBatubara($totalRow, $dailyRow),
            'stock'      => $this->parseStock($dailyRow),
            'solar'      => $this->parseSolar($totalRow, $dailyRow),
            'target_biomassa' => $this->parseTargetBiomassa($row56, $realisasiRow),
            'meta' => [
                'month'         => $month,
                'year'          => $year,
                'month_name'    => self::MONTH_NAMES[$month] ?? '',
                'fetched_at'    => now()->toDateTimeString(),
            ],
        ];
    }

    // ── Private Helpers ────────────────────────────────────────────────

    /**
     * Bangun nama worksheet dari bulan dan tahun.
     * Contoh: month=1, year=2026 → "Januari26-BB"
     */
    private function buildWorksheetName(int $month, int $year): string
    {
        $monthName  = self::MONTH_NAMES[$month] ?? 'Januari';
        $shortYear  = substr((string) $year, -2); // 2026 → "26"
        return "{$monthName}{$shortYear}-BB";
    }

    /**
     * Cari index baris yang tanggalnya cocok dengan hari ini.
     * Baris dalam array: index 0 = row 11 = tanggal 1, dst.
     */
    private function findTodayRow(array $rows, int $today): ?int
    {
        foreach ($rows as $i => $row) {
            if ($i >= 31) break; // lewati row 42 (total)
            $cellValue = trim($row[0] ?? '');
            if ($cellValue === '' || $cellValue === null) continue;

            // Nilai bisa berupa angka tanggal atau string tanggal
            $dayValue = (int) $cellValue;
            if ($dayValue === $today) {
                return $i;
            }
        }

        // Fallback: cari baris terakhir yang ada datanya
        for ($i = 30; $i >= 0; $i--) {
            $val = trim($rows[$i][0] ?? '');
            if ($val !== '' && is_numeric($val)) {
                Log::info("[GoogleSheetsDataSource] Hari ini ({$today}) tidak ditemukan, fallback ke baris " . ($i + 11));
                return $i;
            }
        }

        return null;
    }

    /**
     * Ambil nilai numerik dari baris berdasarkan index kolom.
     * Return 0 jika kolom tidak ada atau bukan angka.
     */
    private function val(array $row, int $colIndex): float
    {
        $raw = $row[$colIndex] ?? null;
        if ($raw === null || $raw === '') return 0.0;

        // Handle format angka dengan titik/koma (mis. "1.234,56" atau "1234.56")
        $cleaned = str_replace(['.', ','], ['', '.'], (string) $raw);
        // Coba format lain jika hasilnya tidak valid
        if (!is_numeric($cleaned)) {
            $cleaned = str_replace(',', '', (string) $raw);
        }

        return is_numeric($cleaned) ? (float) $cleaned : 0.0;
    }

    /**
     * Jumlahkan nilai dari beberapa kolom dalam satu baris.
     */
    private function sumCols(array $row, int $startIndex, int $endIndex): float
    {
        $total = 0.0;
        for ($i = $startIndex; $i <= $endIndex; $i++) {
            $total += $this->val($row, $i);
        }
        return $total;
    }

    // ── KPI Parsers ────────────────────────────────────────────────────

    private function parseBiomassa(array $totalRow, array $row52, array $dailyRow): array
    {
        return [
            'penerimaan_bulanan'        => $this->val($row52, self::COL_BIOMASSA_PENERIMAAN_BULANAN),
            'pemakaian_bulanan'         => $this->val($dailyRow, self::COL_BIOMASSA_PEMAKAIAN_BULANAN),
            'unit1_harian'              => $this->val($dailyRow,  self::COL_BIOMASSA_UNIT1_HARIAN),
            'unit2_harian'              => $this->val($dailyRow,  self::COL_BIOMASSA_UNIT2_HARIAN),
            'unit3_harian'              => $this->val($dailyRow,  self::COL_BIOMASSA_UNIT3_HARIAN),
            'total_pemakaian_batubara_bulanan' => $this->val($totalRow, self::COL_BATUBARA_PEMAKAIAN_BULANAN),
        ];
    }

    private function parseBatubara(array $totalRow, array $dailyRow): array
    {
        return [
            'penerimaan_bulanan' => $this->val($totalRow, self::COL_BATUBARA_PENERIMAAN_BULANAN),
            'unit1_harian'       => $this->val($dailyRow,  self::COL_BATUBARA_UNIT1_HARIAN),
            'unit2_harian'       => $this->val($dailyRow,  self::COL_BATUBARA_UNIT2_HARIAN),
            'unit3_harian'       => $this->val($dailyRow,  self::COL_BATUBARA_UNIT3_HARIAN),
            'pemakaian_harian'   => $this->val($dailyRow,  self::COL_BATUBARA_PEMAKAIAN_HARIAN),
        ];
    }

    private function parseStock(array $dailyRow): array
    {
        $hop = $this->val($dailyRow, self::COL_HOP);

        // Status HOP sesuai arsitektur: <10=merah, 10-<15=kuning, ≥15=hijau
        $hopStatus = match(true) {
            $hop < 10  => 'danger',
            $hop < 15  => 'warning',
            default    => 'success',
        };

        $hopLabel = match($hopStatus) {
            'danger'  => 'Kritis',
            'warning' => 'Perhatian',
            default   => 'Aman',
        };

        return [
            'stock_batubara' => $this->val($dailyRow, self::COL_STOCK_BATUBARA),
            'hop'            => $hop,
            'hop_status'     => $hopStatus,
            'hop_label'      => $hopLabel,
        ];
    }

    private function parseSolar(array $totalRow, array $dailyRow): array
    {
        return [
            'pemakaian_harian'   => $this->val($dailyRow,  86), // CJ rel index
            'pemakaian_bulanan'  => $this->val($totalRow,  86), // CJ42
            'penerimaan_bulanan' => $this->val($totalRow,  79), // CC42
        ];
    }

    /**
     * Parse Target Biomassa.
     * Realisasi Kumulatif diambil dari row 59 kolom CO.
     * Progress = (Realisasi Kumulatif / Target) × 100
     */
    private function parseTargetBiomassa(array $row56, array $realisasiRow): array
    {
        $target = $this->val($row56, self::COL_REALISASI_KUMULATIF);
        if ($target <= 0) {
            $target = self::TARGET_BIOMASSA_TON; // Fallback jika target dari sheet 0 atau tidak terbaca
        }
        
        $kumulatif = $this->val($realisasiRow, self::COL_REALISASI_KUMULATIF);
        
        $progress = $target > 0 ? ($kumulatif / $target) * 100 : 0;
        
        return [
            'target'              => $target,
            'realisasi_kumulatif' => $kumulatif,
            'kumulatif'           => $kumulatif,
            'progress'            => min(100, $progress), // cap at 100%
            'sisa'                => max(0, $target - $kumulatif),
        ];
    }

    /**
     * Kembalikan struktur data kosong (ketika worksheet tidak ditemukan).
     */
    private function emptyResponse(string $worksheetName): array
    {
        return [
            'worksheet'  => $worksheetName,
            'today_row'  => null,
            'today_date' => date('d F Y'),
            'biomassa'   => [
                'penerimaan_bulanan'        => 0, 'pemakaian_bulanan' => 0,
                'unit1_harian' => 0, 'unit2_harian' => 0, 'unit3_harian' => 0,
                'total_pemakaian_batubara_bulanan' => 0,
            ],
            'batubara'   => [
                'penerimaan_bulanan' => 0, 'unit1_harian' => 0,
                'unit2_harian' => 0, 'unit3_harian' => 0, 'pemakaian_harian' => 0,
            ],
            'stock'      => ['stock_batubara' => 0, 'hop' => 0, 'hop_status' => 'danger', 'hop_label' => 'Kritis'],
            'solar'      => ['pemakaian_harian' => 0, 'pemakaian_bulanan' => 0, 'penerimaan_bulanan' => 0],
            'target_biomassa' => ['target' => self::TARGET_BIOMASSA_TON, 'realisasi_kumulatif' => 0, 'kumulatif' => 0, 'progress' => 0, 'sisa' => self::TARGET_BIOMASSA_TON],
            'meta'       => ['month' => 0, 'year' => 0, 'month_name' => '', 'fetched_at' => now()->toDateTimeString()],
        ];
    }
}
