<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CoalConsumption extends Model
{
    protected $table = 'coal_consumption';

    protected $fillable = [
        'unit_id',
        'date',
        'coal_used',
        'sfc',
        'heat_rate',
        'boiler_efficiency',
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
            'coal_used' => 'decimal:2',
            'sfc' => 'decimal:2',
            'heat_rate' => 'decimal:2',
            'boiler_efficiency' => 'decimal:2',
        ];
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }
}
