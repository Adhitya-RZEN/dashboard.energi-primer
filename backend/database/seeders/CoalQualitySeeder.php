<?php

namespace Database\Seeders;

use App\Models\CoalQuality;
use App\Models\Unit;
use Illuminate\Database\Seeder;

class CoalQualitySeeder extends Seeder
{
    /**
     * Baca database/data/coal_quality.csv dan insert ke tabel coal_quality.
     *
     * Header CSV: Date, Unit, GAR, Moisture (%), Ash (%), Sulfur (%), HGI
     */
    public function run(): void
    {
        $csvPath = database_path('data/coal_quality.csv');

        if (! file_exists($csvPath)) {
            $this->command->warn("File tidak ditemukan: {$csvPath}");
            return;
        }

        // Cache unit name → id agar tidak query berulang
        $unitMap = Unit::query()
            ->pluck('id', 'name')
            ->toArray();

        $handle = fopen($csvPath, 'r');

        // Lewati baris header
        fgetcsv($handle);

        $batch = [];
        $now   = now();

        while (($row = fgetcsv($handle)) !== false) {
            [$date, $unitName, $gar, $moisture, $ash, $sulfur, $hgi] = $row;

            $unitId = $unitMap[$unitName] ?? null;
            if (! $unitId) {
                continue; // lewati baris jika unit tidak dikenal
            }

            $batch[] = [
                'unit_id'    => $unitId,
                'date'       => $date,
                'gar'        => $gar !== '' ? (float) $gar      : null,
                'moisture'   => $moisture !== '' ? (float) $moisture : null,
                'ash'        => $ash !== '' ? (float) $ash      : null,
                'sulfur'     => $sulfur !== '' ? (float) $sulfur   : null,
                'hgi'        => $hgi !== '' ? (float) $hgi      : null,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            // Insert per batch 200 baris agar tidak kehabisan memori
            if (count($batch) >= 200) {
                CoalQuality::query()->upsert(
                    $batch,
                    ['unit_id', 'date'],          // unique key
                    ['gar', 'moisture', 'ash', 'sulfur', 'hgi', 'updated_at']
                );
                $batch = [];
            }
        }

        // Flush sisa batch
        if (! empty($batch)) {
            CoalQuality::query()->upsert(
                $batch,
                ['unit_id', 'date'],
                ['gar', 'moisture', 'ash', 'sulfur', 'hgi', 'updated_at']
            );
        }

        fclose($handle);

        $this->command->info('CoalQualitySeeder: selesai.');
    }
}
