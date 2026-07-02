<?php

namespace Database\Seeders;

use App\Models\PowerGeneration;
use App\Models\Unit;
use Illuminate\Database\Seeder;

class PowerGenerationSeeder extends Seeder
{
    /**
     * Baca database/data/power_generation.csv dan insert ke tabel power_generation.
     *
     * Header CSV: Date, Unit, Average Load (MW), Power Generation (MWh)
     */
    public function run(): void
    {
        $csvPath = database_path('data/power_generation.csv');

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
            [$date, $unitName, $avgLoad, $powerGen] = $row;

            $unitId = $unitMap[$unitName] ?? null;
            if (! $unitId) {
                continue;
            }

            $batch[] = [
                'unit_id'          => $unitId,
                'date'             => $date,
                'average_load'     => $avgLoad !== '' ? (float) $avgLoad   : null,
                'power_generation' => $powerGen !== '' ? (float) $powerGen : null,
                'created_at'       => $now,
                'updated_at'       => $now,
            ];

            if (count($batch) >= 200) {
                PowerGeneration::query()->upsert(
                    $batch,
                    ['unit_id', 'date'],
                    ['average_load', 'power_generation', 'updated_at']
                );
                $batch = [];
            }
        }

        if (! empty($batch)) {
            PowerGeneration::query()->upsert(
                $batch,
                ['unit_id', 'date'],
                ['average_load', 'power_generation', 'updated_at']
            );
        }

        fclose($handle);

        $this->command->info('PowerGenerationSeeder: selesai.');
    }
}
