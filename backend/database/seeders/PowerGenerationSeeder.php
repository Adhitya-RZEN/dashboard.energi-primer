<?php

namespace Database\Seeders;

use App\Models\PowerGeneration;
use App\Models\Unit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class PowerGenerationSeeder extends Seeder
{
    /**
     * Seed the power_generation table with a simple 7-day sample per unit.
     */
    public function run(): void
    {
        Unit::query()->each(function (Unit $unit) {
            for ($i = 6; $i >= 0; $i--) {
                $date = Carbon::today()->subDays($i);

                PowerGeneration::query()->updateOrCreate(
                    ['unit_id' => $unit->id, 'date' => $date->toDateString()],
                    [
                        'average_load' => 300,
                        'power_generation' => 7200,
                    ]
                );
            }
        });
    }
}
