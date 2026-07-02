<?php

namespace Database\Seeders;

use App\Models\CoalQuality;
use App\Models\Unit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class CoalQualitySeeder extends Seeder
{
    /**
     * Seed the coal_quality table with a simple 7-day sample per unit.
     */
    public function run(): void
    {
        Unit::query()->each(function (Unit $unit) {
            for ($i = 6; $i >= 0; $i--) {
                $date = Carbon::today()->subDays($i);

                CoalQuality::query()->updateOrCreate(
                    ['unit_id' => $unit->id, 'date' => $date->toDateString()],
                    [
                        'gar' => 4200,
                        'moisture' => 25.5,
                        'ash' => 8.2,
                        'sulfur' => 0.45,
                        'hgi' => 48,
                    ]
                );
            }
        });
    }
}
