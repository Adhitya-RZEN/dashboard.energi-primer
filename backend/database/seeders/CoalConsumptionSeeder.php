<?php

namespace Database\Seeders;

use App\Models\CoalConsumption;
use App\Models\Unit;
use Illuminate\Database\Seeder;

class CoalConsumptionSeeder extends Seeder
{
    /**
     * Baca database/data/coal_consumption.csv dan insert ke tabel coal_consumption.
     *
     * Header CSV: Date, Unit, Coal Used (Ton), SFC (kg/MWh), Heat Rate (kcal/kWh), Boiler Efficiency (%)
     */
    public function run(): void
    {
        $csvPath = database_path('data/coal_consumption.csv');

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
            [$date, $unitName, $coalUsed, $sfc, $heatRate, $boilerEff] = $row;

            $unitId = $unitMap[$unitName] ?? null;
            if (! $unitId) {
                continue;
            }

            $batch[] = [
                'unit_id'           => $unitId,
                'date'              => $date,
                'coal_used'         => $coalUsed !== '' ? (float) $coalUsed  : null,
                'sfc'               => $sfc !== '' ? (float) $sfc        : null,
                'heat_rate'         => $heatRate !== '' ? (float) $heatRate   : null,
                'boiler_efficiency' => $boilerEff !== '' ? (float) $boilerEff  : null,
                'created_at'        => $now,
                'updated_at'        => $now,
            ];

            if (count($batch) >= 200) {
                CoalConsumption::query()->upsert(
                    $batch,
                    ['unit_id', 'date'],
                    ['coal_used', 'sfc', 'heat_rate', 'boiler_efficiency', 'updated_at']
                );
                $batch = [];
            }
        }

        if (! empty($batch)) {
            CoalConsumption::query()->upsert(
                $batch,
                ['unit_id', 'date'],
                ['coal_used', 'sfc', 'heat_rate', 'boiler_efficiency', 'updated_at']
            );
        }

        fclose($handle);

        $this->command->info('CoalConsumptionSeeder: selesai.');
    }
}
