<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KpiTarget extends Model
{
    protected $table = 'kpi_targets';

    protected $fillable = [
        'unit_id',
        'date',
        'target_sfc',
        'actual_sfc',
        'target_heat_rate',
        'actual_heat_rate',
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
            'target_sfc' => 'decimal:2',
            'actual_sfc' => 'decimal:2',
            'target_heat_rate' => 'decimal:2',
            'actual_heat_rate' => 'decimal:2',
        ];
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }
}
