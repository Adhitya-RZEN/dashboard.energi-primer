<?php

use App\Http\Controllers\Auth\ChangePasswordController;
use App\Http\Controllers\Auth\ForgotPasswordController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\ResetPasswordController;
use App\Http\Controllers\CoalDataController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\LaporanController;
use App\Http\Controllers\MonitoringController;
use App\Http\Controllers\PengaturanController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/* Public authentication routes. Registration is intentionally absent. */
Route::middleware('guest')->group(function (): void {
    Route::get('/login', [LoginController::class, 'create'])->name('login');
    Route::post('/login', [LoginController::class, 'store'])
        ->middleware('throttle:6,1')
        ->name('login.store');

    Route::get('/forgot-password', [ForgotPasswordController::class, 'create'])
        ->name('password.request');
    Route::post('/forgot-password', [ForgotPasswordController::class, 'store'])
        ->middleware('throttle:6,1')
        ->name('password.email');

    Route::get('/reset-password/{token}', [ResetPasswordController::class, 'create'])
        ->name('password.reset');
    Route::post('/reset-password', [ResetPasswordController::class, 'store'])
        ->middleware('throttle:6,1')
        ->name('password.store');
});

/* Authenticated admin routes. Existing dashboard URLs and names are kept. */
Route::middleware(['auth', 'admin'])->group(function (): void {
    Route::post('/logout', [LoginController::class, 'destroy'])->name('logout');

    Route::get('/password/change', [ChangePasswordController::class, 'edit'])
        ->name('password.edit');
    Route::post('/password/change', [ChangePasswordController::class, 'update'])
        ->name('password.update');

    Route::prefix('dashboard')->group(function (): void {
        Route::get('/', [DashboardController::class, 'overview'])->name('dashboard.overview');
        Route::get('/biomassa', [DashboardController::class, 'biomassa'])->name('dashboard.biomassa');
        Route::get('/batubara', [DashboardController::class, 'batubara'])->name('dashboard.batubara');
        Route::get('/stok', [DashboardController::class, 'stok'])->name('dashboard.stok');
        Route::get('/solar', [DashboardController::class, 'solar'])->name('dashboard.solar');
        Route::get('/target', [DashboardController::class, 'target'])->name('dashboard.target');
        Route::get('/filter/reset', function (Request $request) {
            session()->forget(['dashboard_filter_month', 'dashboard_filter_year', 'dashboard_filter_day']);

            return redirect($request->input('redirect', route('dashboard.overview')));
        })->name('dashboard.filter.reset');
    });

    Route::get('/monitoring', [MonitoringController::class, 'index'])->name('monitoring');
    Route::get('/data-batu-bara', [CoalDataController::class, 'index'])->name('data-batu-bara');
    Route::get('/laporan', [LaporanController::class, 'index'])->name('laporan');
    Route::get('/pengaturan', [PengaturanController::class, 'index'])->name('pengaturan');
});

Route::redirect('/', '/dashboard')->middleware(['auth', 'admin']);
