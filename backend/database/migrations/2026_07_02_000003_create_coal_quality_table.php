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
        Schema::create('coal_quality', function (Blueprint $table) {
            $table->id();
            $table->foreignId('unit_id')->constrained('units')->cascadeOnDelete();
            $table->date('date');
            $table->decimal('gar', 8, 2)->nullable();
            $table->decimal('moisture', 5, 2)->nullable();
            $table->decimal('ash', 5, 2)->nullable();
            $table->decimal('sulfur', 5, 3)->nullable();
            $table->decimal('hgi', 5, 2)->nullable();
            $table->timestamps();

            $table->unique(['unit_id', 'date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('coal_quality');
    }
};
