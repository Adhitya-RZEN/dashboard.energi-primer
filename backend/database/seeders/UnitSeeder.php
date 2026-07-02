<?php

namespace Database\Seeders;

use App\Models\Unit;
use Illuminate\Database\Seeder;

class UnitSeeder extends Seeder
{
    /**
     * Seed the units table.
     * Harus konsisten dengan nilai kolom "Unit" di semua file CSV:
     * "Unit 1", "Unit 2", "Unit 3"
     */
    public function run(): void
    {
        $units = [
            ['code' => 'PLTU-1', 'name' => 'Unit 1', 'status' => true],
            ['code' => 'PLTU-2', 'name' => 'Unit 2', 'status' => true],
            ['code' => 'PLTU-3', 'name' => 'Unit 3', 'status' => true],
        ];

        foreach ($units as $unit) {
            Unit::query()->updateOrCreate(
                ['code' => $unit['code']],
                $unit
            );
        }
    }
}
