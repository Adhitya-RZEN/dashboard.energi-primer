<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('coal_consumption', function (Blueprint $table) {
            $table->id();
            $table->foreignId('unit_id')->constrained('units')->cascadeOnDelete();
            $table->date('date');
            $table->decimal('coal_used', 12, 2)->nullable();
            $table->decimal('sfc', 8, 2)->nullable();
            $table->decimal('heat_rate', 8, 2)->nullable();
            $table->decimal('boiler_efficiency', 5, 2)->nullable();
            $table->timestamps();

            $table->unique(['unit_id', 'date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('coal_consumption');
    }
};
