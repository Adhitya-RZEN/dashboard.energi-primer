<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CoalStock extends Model
{
    protected $table = 'coal_stock';

    protected $fillable = [
        'date',
        'opening_stock',
        'received',
        'consumed',
        'closing_stock',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'date' => 'date',
            'opening_stock' => 'decimal:2',
            'received' => 'decimal:2',
            'consumed' => 'decimal:2',
            'closing_stock' => 'decimal:2',
        ];
    }
}
