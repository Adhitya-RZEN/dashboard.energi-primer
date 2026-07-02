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
        Schema::create('spreadsheet_import_logs', function (Blueprint $table) {
            $table->id();
            $table->string('source');
            $table->unsignedInteger('imported_rows')->default(0);
            $table->string('status');
            $table->text('message')->nullable();
            $table->timestamp('imported_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('spreadsheet_import_logs');
    }
};
