<?php

namespace Database\Seeders;

use App\Models\KpiTarget;
use App\Models\Unit;
use Illuminate\Database\Seeder;

class KpiTargetSeeder extends Seeder
{
    /**
     * Baca database/data/kpi_target.csv dan insert ke tabel kpi_targets.
     *
     * Header CSV: Date, Unit, Target SFC, Actual SFC, Target Heat Rate, Actual Heat Rate
     */
    public function run(): void
    {
        $csvPath = database_path('data/kpi_target.csv');

        if (! file_exists($csvPath)) {
            $this->command->warn("File tidak ditemukan: {$csvPath}");
            return;
        }

        $unitMap = Unit::query()
            ->pluck('id', 'name')
            ->toArray();

        $handle = fopen($csvPath, 'r');
        fgetcsv($handle); // lewati header

        $batch = [];
        $now   = now();

        while (($row = fgetcsv($handle)) !== false) {
            [$date, $unitName, $targetSfc, $actualSfc, $targetHr, $actualHr] = $row;

            $unitId = $unitMap[$unitName] ?? null;
            if (! $unitId) {
                continue;
            }

            $batch[] = [
                'unit_id'          => $unitId,
                'date'             => $date,
                'target_sfc'       => $targetSfc !== '' ? (float) $targetSfc  : null,
                'actual_sfc'       => $actualSfc !== '' ? (float) $actualSfc  : null,
                'target_heat_rate' => $targetHr !== '' ? (float) $targetHr   : null,
                'actual_heat_rate' => $actualHr !== '' ? (float) $actualHr   : null,
                'created_at'       => $now,
                'updated_at'       => $now,
            ];

            if (count($batch) >= 200) {
                KpiTarget::query()->upsert(
                    $batch,
                    ['unit_id', 'date'],
                    ['target_sfc', 'actual_sfc', 'target_heat_rate', 'actual_heat_rate', 'updated_at']
                );
                $batch = [];
            }
        }

        if (! empty($batch)) {
            KpiTarget::query()->upsert(
                $batch,
                ['unit_id', 'date'],
                ['target_sfc', 'actual_sfc', 'target_heat_rate', 'actual_heat_rate', 'updated_at']
            );
        }

        fclose($handle);

        $this->command->info('KpiTargetSeeder: selesai.');
    }
}
