{{-- ============================================================
    Laporan — index.blade.php
    PT PLN Indonesia Power UBP Jeranjang
============================================================ --}}

@extends('layouts.app')

@section('title', 'Laporan')

@section('page-css')
  <link rel="stylesheet" href="{{ asset('css/laporan.css') }}" />
@endsection

@section('content')

  {{-- Breadcrumb --}}
  @include('components.breadcrumb', [
    'items' => [
      ['label' => 'Dashboard', 'url' => '/'],
      ['label' => 'Laporan', 'active' => true],
    ]
  ])

  {{-- Page Header --}}
  <header class="page-header">
    <p class="page-header__eyebrow">Energi Primer</p>
    <h1 class="page-header__title">Laporan Efisiensi Batu Bara</h1>
    <p class="page-header__desc">
      Generate dan unduh laporan monitoring efisiensi batu bara berdasarkan periode yang dipilih.
    </p>
  </header>

  {{-- ── Period Selector ── --}}
  <div class="period-selector">
    <div class="form-group">
      <label class="form-label" for="js-period-month">Bulan</label>
      <select class="form-control" id="js-period-month">
        <option value="06">Juni 2026</option>
        <option value="05">Mei 2026</option>
        <option value="04">April 2026</option>
        <option value="03">Maret 2026</option>
        <option value="02">Februari 2026</option>
        <option value="01">Januari 2026</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label" for="js-period-year">Tahun</label>
      <select class="form-control" id="js-period-year">
        <option value="2026">2026</option>
        <option value="2025">2025</option>
        <option value="2024">2024</option>
      </select>
    </div>
    <button class="btn btn-primary" id="js-generate-laporan">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      Generate Laporan
    </button>
  </div>

  {{-- ── Alert Info ── --}}
  <div class="alert alert--info mb-20">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px;">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <div>
      <strong>Mode Statis:</strong> Tombol Generate Laporan dan Download hanya sebagai demonstrasi tampilan.
      Fitur generate laporan otomatis akan tersedia pada Phase 3.
    </div>
  </div>

  {{-- ── Report Type Cards ── --}}
  <div class="section-divider mb-16">
    <span class="section-divider__label">Jenis Laporan</span>
    <div class="section-divider__line"></div>
  </div>

  <div class="laporan-grid mb-24">

    <div class="laporan-card" data-selectable>
      <div class="laporan-card__type">Bulanan</div>
      <div class="laporan-card__title">Laporan Efisiensi Bulanan</div>
      <div class="laporan-card__meta">Rekap konsumsi, efisiensi, dan kualitas per bulan</div>
      <div class="laporan-card__footer">
        <div class="laporan-card__icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <span class="report-status report-status--generated">● Tersedia</span>
      </div>
    </div>

    <div class="laporan-card" data-selectable>
      <div class="laporan-card__type">Mingguan</div>
      <div class="laporan-card__title">Laporan Operasional Mingguan</div>
      <div class="laporan-card__meta">Ringkasan data per minggu termasuk tren heat rate</div>
      <div class="laporan-card__footer">
        <div class="laporan-card__icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <span class="report-status report-status--generated">● Tersedia</span>
      </div>
    </div>

    <div class="laporan-card" data-selectable>
      <div class="laporan-card__type">Kualitas</div>
      <div class="laporan-card__title">Laporan Kualitas Batu Bara</div>
      <div class="laporan-card__meta">Analisis kalori, moisture, ash, dan sulfur per supplier</div>
      <div class="laporan-card__footer">
        <div class="laporan-card__icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
        <span class="report-status report-status--generated">● Tersedia</span>
      </div>
    </div>

  </div>

  {{-- ── Laporan History Table ── --}}
  <div class="section-divider mb-16">
    <span class="section-divider__label">Riwayat Laporan</span>
    <div class="section-divider__line"></div>
  </div>

  <div class="card card--no-hover">
    <div class="card__header">
      <div class="card__meta">
        <div class="card__title">Daftar Laporan Tersedia</div>
        <div class="card__subtitle">Laporan yang sudah digenerate dan siap diunduh</div>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Nama Laporan</th>
            <th>Jenis</th>
            <th>Periode</th>
            <th>Dibuat</th>
            <th>Dibuat Oleh</th>
            <th>Ukuran</th>
            <th>Status</th>
            <th style="text-align:center;">Aksi</th>
          </tr>
        </thead>
        <tbody>
          @forelse($monthlyReports as $report)
          <tr>
            <td style="font-weight:600;color:var(--text-heading);">Laporan Efisiensi {{ $report->period_label }}</td>
            <td>
              <span class="chip" style="background:var(--primary-light);color:var(--primary);font-size:11px;padding:2px 8px;">
                Bulanan
              </span>
            </td>
            <td>{{ $report->period_label }}</td>
            <td style="font-size:12px;color:var(--text-caption);">Otomatis</td>
            <td style="font-size:12px;">Sistem</td>
            <td style="font-size:12px;color:var(--text-caption);">-</td>
            <td>
              <span class="report-status report-status--generated">● Tersedia</span>
            </td>
            <td>
              <div class="d-flex gap-8 justify-center" style="justify-content:center;">
                <button class="btn btn-outline btn--sm" disabled title="Preview">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  Preview
                </button>
                <button class="btn btn-primary btn--sm" disabled title="Download">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Unduh
                </button>
              </div>
            </td>
          </tr>
          @empty
          <tr>
            <td colspan="8" style="text-align: center; color: var(--text-caption);">Belum ada laporan yang tersedia</td>
          </tr>
          @endforelse
        </tbody>
      </table>
    </div>

    <div class="pagination">
      <span class="pagination__info">Menampilkan {{ count($monthlyReports) }} laporan bulanan yang tersedia</span>
    </div>
  </div>

@endsection

@section('page-js')
  <script src="{{ asset('js/laporan.js') }}"></script>
@endsection
