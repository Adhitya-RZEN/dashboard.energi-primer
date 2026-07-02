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

Route::get('/', [DashboardController::class, 'index'])->name('dashboard');
Route::get('/monitoring', [MonitoringController::class, 'index'])->name('monitoring');
Route::get('/data-batu-bara', [CoalDataController::class, 'index'])->name('data-batu-bara');
Route::get('/laporan', [LaporanController::class, 'index'])->name('laporan');
Route::get('/pengaturan', [PengaturanController::class, 'index'])->name('pengaturan');
