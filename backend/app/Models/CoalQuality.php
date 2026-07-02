<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CoalQuality extends Model
{
    protected $table = 'coal_quality';

    protected $fillable = [
        'unit_id',
        'date',
        'gar',
        'moisture',
        'ash',
        'sulfur',
        'hgi',
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
            'gar' => 'decimal:2',
            'moisture' => 'decimal:2',
            'ash' => 'decimal:2',
            'sulfur' => 'decimal:3',
            'hgi' => 'decimal:2',
        ];
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }
}
