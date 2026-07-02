<?php

namespace Database\Seeders;

use App\Models\Unit;
use Illuminate\Database\Seeder;

class UnitSeeder extends Seeder
{
    /**
     * Seed the units table.
     */
    public function run(): void
    {
        $units = [
            ['code' => 'PLTU-1', 'name' => 'PLTU Unit 1', 'status' => true],
            ['code' => 'PLTU-2', 'name' => 'PLTU Unit 2', 'status' => true],
        ];

        foreach ($units as $unit) {
            Unit::query()->updateOrCreate(['code' => $unit['code']], $unit);
        }
    }
}
