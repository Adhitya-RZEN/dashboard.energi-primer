<?php

namespace App\Providers;

use App\DataSources\DataSourceInterface;
use App\DataSources\GoogleSheetsDataSource;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // ── Binding DataSource ──────────────────────────────────────────
        // Fase 1: Google Sheets sebagai sumber data utama.
        // Fase 2: Ganti GoogleSheetsDataSource → DatabaseDataSource
        //         tanpa mengubah Service, Controller, maupun View.
        $this->app->bind(
            DataSourceInterface::class,
            GoogleSheetsDataSource::class
        );
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
