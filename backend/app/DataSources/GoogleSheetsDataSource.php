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
    private const COL_HOP_3UNIT      = 34; // AJ
    private const COL_HOP_2UNIT      = 35; // AK
    private const COL_HOP_1UNIT      = 36; // AL

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
    public function getDashboardData(int $month, int $year, ?int $day = null): array
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

    $totalRow = $rows[self::ROW_TOTAL_INDEX] ?? [];
    $row52 = $rows[self::ROW_BIOMASSA_PENERIMAAN_BULANAN_INDEX] ?? [];
    $row56 = $rows[self::ROW_TARGET_BIOMASSA_INDEX] ?? [];
    $realisasiRow = $rows[self::ROW_REALISASI_KUMULATIF_INDEX] ?? [];

    // Jika $day diberikan (filter manual), gunakan itu. Jika tidak, fallback ke tanggal hari ini.
    $targetDay = $day ?? (int) date('j');
    $todayRowIndex = $this->findTodayRow($rows, $targetDay);
    $dailyRow = $todayRowIndex !== null ? ($rows[$todayRowIndex] ?? []) : [];

    $actualDay = $todayRowIndex !== null
        ? ($this->parseDay($rows[$todayRowIndex][0] ?? null) ?? ($todayRowIndex + 1))
        : $targetDay;
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
        'daily_series'    => $this->parseDailySeries($rows, $month, $year),
        'meta' => [
            'month'         => $month,
            'year'          => $year,
            'day'           => $targetDay,
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
    private function findTodayRow(array $rows, int $targetDay): ?int
{
    foreach ($rows as $i => $row) {
        if ($i >= 31) break; // lewati row 42 (total)
        $dayValue = $this->parseDay($row[0] ?? null);
        if ($dayValue === null) continue;
        if ($dayValue === $targetDay) {
            return $i;
        }
    }

    // Fallback: cari baris terakhir yang ada datanya
    for ($i = 30; $i >= 0; $i--) {
        if ($this->parseDay($rows[$i][0] ?? null) !== null) {
            Log::info("[GoogleSheetsDataSource] Tanggal ({$targetDay}) tidak ditemukan, fallback ke baris " . ($i + 11));
            return $i;
        }
    }

    return null;
}

    /**
     * Worksheet menyimpan tanggal sebagai "01 Juli 2026", bukan angka 1.
     */
    private function parseDay(mixed $raw): ?int
    {
        if ($raw === null || trim((string) $raw) === '') return null;

        if (is_int($raw) || is_float($raw) || is_numeric((string) $raw)) {
            $day = (int) $raw;
            return $day >= 1 && $day <= 31 ? $day : null;
        }

        $text = trim((string) $raw);
        if (preg_match('/^(\d{4})[-\/]\d{1,2}[-\/](\d{1,2})$/', $text, $matches)) {
            $day = (int) $matches[2];
            return $day >= 1 && $day <= 31 ? $day : null;
        }

        if (preg_match('/^(\d{1,2})(?:\s|[-\/])/', $text, $matches)) {
            $day = (int) $matches[1];
            return $day >= 1 && $day <= 31 ? $day : null;
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

        if (is_int($raw) || is_float($raw)) return (float) $raw;

        // Handle format angka dengan titik/koma (mis. "1.234,56" atau "1234.56")
        $cleaned = trim((string) $raw);
        $cleaned = str_replace([' ', "\u{00A0}"], '', $cleaned);
        $lastComma = strrpos($cleaned, ',');
        $lastDot = strrpos($cleaned, '.');

        if ($lastComma !== false && $lastDot !== false) {
            if ($lastComma > $lastDot) {
                $cleaned = str_replace('.', '', $cleaned);
                $cleaned = str_replace(',', '.', $cleaned);
            } else {
                $cleaned = str_replace(',', '', $cleaned);
            }
        } elseif ($lastComma !== false) {
            $cleaned = str_replace(',', '.', $cleaned);
        } elseif ($lastDot !== false) {
            // In the worksheet, values such as 70.020 mean 70,020.
            $parts = explode('.', $cleaned);
            $fraction = end($parts);
            if (count($parts) > 1 && strlen($fraction) === 3) {
                $cleaned = str_replace('.', '', $cleaned);
            }
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
            'pemakaian_bulanan'         => $this->val($totalRow, self::COL_BIOMASSA_PEMAKAIAN_BULANAN),
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
        $hop3Unit = $this->val($dailyRow, self::COL_HOP_3UNIT);
        $hop2Unit = $this->val($dailyRow, self::COL_HOP_2UNIT);
        $hop1Unit = $this->val($dailyRow, self::COL_HOP_1UNIT);

        // Status HOP sesuai arsitektur: <10=merah, 10-<15=kuning, ≥15=hijau
        $hopStatus = match(true) {
            $hop3Unit < 10  => 'danger',
            $hop3Unit < 15  => 'warning',
            default    => 'success',
        };

        $hopLabel = match($hopStatus) {
            'danger'  => 'Kritis',
            'warning' => 'Perhatian',
            default   => 'Aman',
        };

        $statusFor = static fn (float $hop): string => match(true) {
            $hop < 10 => 'danger',
            $hop < 15 => 'warning',
            default => 'success',
        };
        $labelFor = static fn (string $status): string => match($status) {
            'danger' => 'Kritis',
            'warning' => 'Perhatian',
            default => 'Aman',
        };
        $hop3Status = $hopStatus;
        $hop2Status = $statusFor($hop2Unit);
        $hop1Status = $statusFor($hop1Unit);

        return [
            'stock_batubara' => $this->val($dailyRow, self::COL_STOCK_BATUBARA),
            'hop'              => $hop3Unit,
            'hop_status'       => $hop3Status,
            'hop_label'        => $hopLabel,
            'hop_3unit'        => $hop3Unit,
            'hop_2unit'        => $hop2Unit,
            'hop_1unit'        => $hop1Unit,
            'hop_status_3unit' => $hop3Status,
            'hop_status_2unit' => $hop2Status,
            'hop_status_1unit' => $hop1Status,
            'hop_label_3unit'  => $labelFor($hop3Status),
            'hop_label_2unit'  => $labelFor($hop2Status),
            'hop_label_1unit'  => $labelFor($hop1Status),
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
        $target = $this->targetValue($row56, self::COL_REALISASI_KUMULATIF);
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
     * Target dapat datang sebagai "70.020" atau "70,020".
     * Keduanya harus dibaca sebagai 70.020 ton, bukan 70,02 ton.
     */
    private function targetValue(array $row, int $colIndex): float
    {
        $raw = trim((string) ($row[$colIndex] ?? ''));
        $value = $this->val($row, $colIndex);

        if ($value > 0 && $value < 1000 && preg_match('/^\d{1,3}[\.,]\d{3}$/', $raw)) {
            return (float) str_replace([',', '.'], '', $raw);
        }

        return $value;
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
            'daily_series'  => [],
            'batubara'   => [
                'penerimaan_bulanan' => 0, 'unit1_harian' => 0,
                'unit2_harian' => 0, 'unit3_harian' => 0, 'pemakaian_harian' => 0,
            ],
            'stock'      => [
                'stock_batubara' => 0,
                'hop' => 0, 'hop_status' => 'danger', 'hop_label' => 'Kritis',
                'hop_3unit' => 0, 'hop_2unit' => 0, 'hop_1unit' => 0,
                'hop_status_3unit' => 'danger', 'hop_status_2unit' => 'danger', 'hop_status_1unit' => 'danger',
                'hop_label_3unit' => 'Kritis', 'hop_label_2unit' => 'Kritis', 'hop_label_1unit' => 'Kritis',
            ],
            'solar'      => ['pemakaian_harian' => 0, 'pemakaian_bulanan' => 0, 'penerimaan_bulanan' => 0],
            'target_biomassa' => ['target' => self::TARGET_BIOMASSA_TON, 'realisasi_kumulatif' => 0, 'kumulatif' => 0, 'progress' => 0, 'sisa' => self::TARGET_BIOMASSA_TON],
            'meta'       => ['month' => 0, 'year' => 0, 'month_name' => '', 'fetched_at' => now()->toDateTimeString()],
        ];
    }
    
    private function parseDailySeries(array $rows, int $month, int $year): array
    {
        $series = [];
        foreach ($rows as $i => $row) {
            if ($i >= self::ROW_TOTAL_INDEX) break; // stop sebelum row 42 (total)
            $day = $this->parseDay($row[0] ?? null);
            if ($day === null) continue;
            $date = sprintf('%04d-%02d-%02d', $year, $month, $day);

            $series[] = [
                'date'               => $date,
                'day'                => $day,
                'biomassa_unit1'     => $this->nullableVal($row, self::COL_BIOMASSA_UNIT1_HARIAN),
                'biomassa_unit2'     => $this->nullableVal($row, self::COL_BIOMASSA_UNIT2_HARIAN),
                'biomassa_unit3'     => $this->nullableVal($row, self::COL_BIOMASSA_UNIT3_HARIAN),
                'biomassa_pemakaian' => $this->sumNullableValues([
                    $this->nullableVal($row, self::COL_BIOMASSA_UNIT1_HARIAN),
                    $this->nullableVal($row, self::COL_BIOMASSA_UNIT2_HARIAN),
                    $this->nullableVal($row, self::COL_BIOMASSA_UNIT3_HARIAN),
                ]),
                'batubara_pemakaian' => $this->nullableVal($row, self::COL_BATUBARA_PEMAKAIAN_HARIAN),
                'batubara_unit1'     => $this->nullableVal($row, self::COL_BATUBARA_UNIT1_HARIAN),
                'batubara_unit2'     => $this->nullableVal($row, self::COL_BATUBARA_UNIT2_HARIAN),
                'batubara_unit3'     => $this->nullableVal($row, self::COL_BATUBARA_UNIT3_HARIAN),
                'stock_batubara'     => $this->nullableVal($row, self::COL_STOCK_BATUBARA),
                'hop'                => $this->nullableVal($row, self::COL_HOP_3UNIT),
                'hop_3unit'          => $this->nullableVal($row, self::COL_HOP_3UNIT),
                'hop_2unit'          => $this->nullableVal($row, self::COL_HOP_2UNIT),
                'hop_1unit'          => $this->nullableVal($row, self::COL_HOP_1UNIT),
                'solar_pemakaian'    => $this->nullableVal($row, self::COL_SOLAR_PEMAKAIAN_HARIAN),
                'solar_penerimaan'   => $this->nullableVal($row, self::COL_SOLAR_PENERIMAAN_BULANAN),
            ];
        }
        return $series;
    }

    /**
     * Ambil nilai harian tanpa mengubah sel kosong menjadi angka nol.
     * Nilai nol yang memang ada di worksheet tetap dikembalikan sebagai 0.0.
     */
    private function nullableVal(array $row, int $colIndex): ?float
    {
        $raw = $row[$colIndex] ?? null;
        $text = trim((string) $raw);
        if ($raw === null || $text === '' || in_array($text, ['-', '–', '—'], true)) return null;

        return $this->val($row, $colIndex);
    }

    /**
     * Jumlahkan nilai nullable. Jika seluruh unit kosong, hasilnya tetap null.
     */
    private function sumNullableValues(array $values): ?float
    {
        $present = array_filter($values, static fn ($value) => $value !== null);
        if ($present === []) return null;

        return array_sum($present);
    }
}
