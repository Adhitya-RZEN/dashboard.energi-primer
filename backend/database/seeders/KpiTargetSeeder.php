<?php

namespace Database\Seeders;

use App\Models\KpiTarget;
use App\Models\Unit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class KpiTargetSeeder extends Seeder
{
    /**
     * Seed the kpi_targets table with a simple 7-day sample per unit.
     */
    public function run(): void
    {
        Unit::query()->each(function (Unit $unit) {
            for ($i = 6; $i >= 0; $i--) {
                $date = Carbon::today()->subDays($i);

                KpiTarget::query()->updateOrCreate(
                    ['unit_id' => $unit->id, 'date' => $date->toDateString()],
                    [
                        'target_sfc' => 0.52,
                        'actual_sfc' => 0.55,
                        'target_heat_rate' => 2400,
                        'actual_heat_rate' => 2450,
                    ]
                );
            }
        });
    }
}
