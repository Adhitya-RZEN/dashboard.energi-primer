<?php

namespace Database\Factories;

use App\Models\Unit;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Unit>
 */
class UnitFactory extends Factory
{
    protected $model = Unit::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => 'UNIT-'.$this->faker->unique()->numberBetween(1, 999),
            'name' => 'Unit '.$this->faker->unique()->numberBetween(1, 999),
            'status' => true,
        ];
    }
}
