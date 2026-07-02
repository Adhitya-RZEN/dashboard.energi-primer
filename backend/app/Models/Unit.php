<?php

namespace App\Models;

use Database\Factories\UnitFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Unit extends Model
{
    /** @use HasFactory<UnitFactory> */
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'status',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => 'boolean',
        ];
    }

    public function coalQuality(): HasMany
    {
        return $this->hasMany(CoalQuality::class);
    }

    public function coalConsumption(): HasMany
    {
        return $this->hasMany(CoalConsumption::class);
    }

    public function powerGeneration(): HasMany
    {
        return $this->hasMany(PowerGeneration::class);
    }

    public function kpiTargets(): HasMany
    {
        return $this->hasMany(KpiTarget::class);
    }
}
