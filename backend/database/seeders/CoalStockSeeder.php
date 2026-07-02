<?php

namespace Database\Seeders;

use App\Models\CoalStock;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class CoalStockSeeder extends Seeder
{
    /**
     * Seed the coal_stock table with a simple 7-day sample.
     */
    public function run(): void
    {
        $opening = 10000;

        for ($i = 6; $i >= 0; $i--) {
            $date = Carbon::today()->subDays($i);
            $received = 500;
            $consumed = 450;
            $closing = $opening + $received - $consumed;

            CoalStock::query()->updateOrCreate(
                ['date' => $date->toDateString()],
                [
                    'opening_stock' => $opening,
                    'received' => $received,
                    'consumed' => $consumed,
                    'closing_stock' => $closing,
                ]
            );

            $opening = $closing;
        }
    }
}
