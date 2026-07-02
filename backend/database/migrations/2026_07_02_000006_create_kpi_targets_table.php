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
        Schema::create('kpi_targets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('unit_id')->constrained('units')->cascadeOnDelete();
            $table->date('date');
            $table->decimal('target_sfc', 8, 2)->nullable();
            $table->decimal('actual_sfc', 8, 2)->nullable();
            $table->decimal('target_heat_rate', 8, 2)->nullable();
            $table->decimal('actual_heat_rate', 8, 2)->nullable();
            $table->timestamps();

            $table->unique(['unit_id', 'date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kpi_targets');
    }
};
