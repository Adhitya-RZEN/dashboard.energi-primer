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
        Schema::create('coal_stock', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            $table->decimal('opening_stock', 12, 2)->default(0);
            $table->decimal('received', 12, 2)->default(0);
            $table->decimal('consumed', 12, 2)->default(0);
            $table->decimal('closing_stock', 12, 2)->default(0);
            $table->timestamps();

            $table->unique('date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('coal_stock');
    }
};
