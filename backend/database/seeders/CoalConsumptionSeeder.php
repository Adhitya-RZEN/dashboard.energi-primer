<?php

namespace Database\Seeders;

use App\Models\CoalConsumption;
use App\Models\Unit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class CoalConsumptionSeeder extends Seeder
{
    /**
     * Seed the coal_consumption table with a simple 7-day sample per unit.
     */
    public function run(): void
    {
        Unit::query()->each(function (Unit $unit) {
            for ($i = 6; $i >= 0; $i--) {
                $date = Carbon::today()->subDays($i);

                CoalConsumption::query()->updateOrCreate(
                    ['unit_id' => $unit->id, 'date' => $date->toDateString()],
                    [
                        'coal_used' => 450,
                        'sfc' => 0.55,
                        'heat_rate' => 2450,
                        'boiler_efficiency' => 87.5,
                    ]
                );
            }
        });
    }
}
