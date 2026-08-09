<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes — Dashboard Monitoring Efisiensi Batu Bara
| PT PLN Indonesia Power UBP Jeranjang
|--------------------------------------------------------------------------
*/

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\MonitoringController;
use App\Http\Controllers\CoalDataController;
use App\Http\Controllers\LaporanController;
use App\Http\Controllers\PengaturanController;

Route::redirect('/', '/dashboard');

Route::prefix('dashboard')->group(function () {
    Route::get('/', [DashboardController::class, 'overview'])->name('dashboard.overview');
    Route::get('/biomassa', [DashboardController::class, 'biomassa'])->name('dashboard.biomassa');
    Route::get('/batubara', [DashboardController::class, 'batubara'])->name('dashboard.batubara');
    Route::get('/stok', [DashboardController::class, 'stok'])->name('dashboard.stok');
    Route::get('/solar', [DashboardController::class, 'solar'])->name('dashboard.solar');
    Route::get('/target', [DashboardController::class, 'target'])->name('dashboard.target');
});

Route::get('/monitoring', [MonitoringController::class, 'index'])->name('monitoring');
Route::get('/data-batu-bara', [CoalDataController::class, 'index'])->name('data-batu-bara');
Route::get('/laporan', [LaporanController::class, 'index'])->name('laporan');
Route::get('/pengaturan', [PengaturanController::class, 'index'])->name('pengaturan');
