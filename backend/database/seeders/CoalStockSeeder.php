<?php

namespace Database\Seeders;

use App\Models\CoalStock;
use Illuminate\Database\Seeder;

class CoalStockSeeder extends Seeder
{
    /**
     * Baca database/data/coal_stock.csv dan insert ke tabel coal_stock.
     *
     * Header CSV: Date, Opening Stock, Received, Consumed, Closing Stock
     */
    public function run(): void
    {
        $csvPath = database_path('data/coal_stock.csv');

        if (! file_exists($csvPath)) {
            $this->command->warn("File tidak ditemukan: {$csvPath}");
            return;
        }

        $handle = fopen($csvPath, 'r');
        fgetcsv($handle); // lewati header

        $batch = [];
        $now   = now();

        while (($row = fgetcsv($handle)) !== false) {
            [$date, $openingStock, $received, $consumed, $closingStock] = $row;

            $batch[] = [
                'date'          => $date,
                'opening_stock' => $openingStock !== '' ? (float) $openingStock : null,
                'received'      => $received !== '' ? (float) $received      : null,
                'consumed'      => $consumed !== '' ? (float) $consumed      : null,
                'closing_stock' => $closingStock !== '' ? (float) $closingStock  : null,
                'created_at'    => $now,
                'updated_at'    => $now,
            ];

            if (count($batch) >= 200) {
                CoalStock::query()->upsert(
                    $batch,
                    ['date'],
                    ['opening_stock', 'received', 'consumed', 'closing_stock', 'updated_at']
                );
                $batch = [];
            }
        }

        if (! empty($batch)) {
            CoalStock::query()->upsert(
                $batch,
                ['date'],
                ['opening_stock', 'received', 'consumed', 'closing_stock', 'updated_at']
            );
        }

        fclose($handle);

        $this->command->info('CoalStockSeeder: selesai.');
    }
}
