{{-- ============================================================
    Monitoring Real-time — index.blade.php
    PT PLN Indonesia Power UBP Jeranjang
============================================================ --}}

@extends('layouts.app')

@section('title', 'Monitoring')

@section('page-css')
  <link rel="stylesheet" href="{{ asset('css/monitoring.css') }}" />
@endsection

@section('content')

  {{-- Breadcrumb --}}
  @include('components.breadcrumb', [
    'items' => [
      ['label' => 'Dashboard', 'url' => '/'],
      ['label' => 'Monitoring', 'active' => true],
    ]
  ])

  {{-- Page Header --}}
  <header class="page-header">
    <p class="page-header__eyebrow">PT PLN Indonesia Power &middot; UBP Jeranjang</p>
    <h1 class="page-header__title">Monitoring Efisiensi Batu Bara</h1>
    <p class="page-header__desc">
      Pantau data operasional batu bara secara terperinci per unit, shift, dan periode waktu.
    </p>
    <div class="page-header__actions">
      <div class="live-indicator">
        <div class="live-dot"></div>
        Live Monitoring
      </div>
    </div>
  </header>

  {{-- Status Bar --}}
  @include('components.status-bar')

  {{-- ── Filter Bar ── --}}
  <form method="GET" action="{{ route('monitoring') }}" class="filter-bar mb-20">
    <span class="filter-bar__label">Filter</span>

    <input type="date" name="date_from" class="filter-input" value="{{ $dateFrom }}" aria-label="Tanggal mulai" />
    <input type="date" name="date_to" class="filter-input" value="{{ $dateTo }}" aria-label="Tanggal akhir" />

    <select name="unit_id" class="filter-select" aria-label="Unit PLTU">
      <option value="">Semua Unit</option>
      @foreach($units as $u)
        <option value="{{ $u->id }}" {{ $unitId == $u->id ? 'selected' : '' }}>{{ $u->name }}</option>
      @endforeach
    </select>

    <button type="submit" class="btn btn-primary btn--sm">
      Filter
    </button>
    <a href="{{ route('monitoring') }}" class="btn btn-outline btn--sm" id="js-filter-reset">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="1 4 1 10 7 10"/>
        <path d="M3.51 15a9 9 0 1 0 .49-3.6"/>
      </svg>
      Reset
    </a>
  </form>

  {{-- ── KPI Mini ── --}}
  <div class="monitor-kpi-grid">

    <div class="card animate-fade-in animate-delay-1">
      <div class="card__title" style="margin-bottom:8px;">Konsumsi ({{ \Carbon\Carbon::parse($kpiDate)->format('d M') }})</div>
      <div class="kpi-value" style="font-size:20px;">{{ number_format($kpiConsumption, 0, ',', '.') }} <span class="kpi-unit">ton</span></div>
      <div class="kpi-trend kpi-trend--neutral" style="margin-top:6px;">
        Total dari filter saat ini
      </div>
    </div>

    <div class="card animate-fade-in animate-delay-2">
      <div class="card__title" style="margin-bottom:8px;">Rata-rata Efisiensi</div>
      <div class="kpi-value" style="font-size:20px;">{{ number_format($kpiEfficiency, 1, ',', '.') }} <span class="kpi-unit">%</span></div>
      <div class="kpi-trend {{ $kpiEfficiency >= 85 ? 'kpi-trend--up' : 'kpi-trend--down' }}" style="margin-top:6px;">
        <div class="kpi-trend__icon">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="{{ $kpiEfficiency >= 85 ? '18 15 12 9 6 15' : '6 9 12 15 18 9' }}"/>
          </svg>
        </div>
        {{ $kpiEfficiency >= 85 ? 'Di atas' : 'Di bawah' }} target 85%
      </div>
    </div>

    <div class="card animate-fade-in animate-delay-3">
      <div class="card__title" style="margin-bottom:8px;">Avg. Heat Rate</div>
      <div class="kpi-value" style="font-size:20px;">{{ number_format($kpiHeatRate, 0, ',', '.') }} <span class="kpi-unit">kCal/kWh</span></div>
      <div class="kpi-trend {{ $kpiHeatRate <= 2700 ? 'kpi-trend--up' : 'kpi-trend--down' }}" style="margin-top:6px;">
        <div class="kpi-trend__icon">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="{{ $kpiHeatRate <= 2700 ? '18 15 12 9 6 15' : '6 9 12 15 18 9' }}"/>
          </svg>
        </div>
        {{ $kpiHeatRate <= 2700 ? 'Sesuai' : 'Lebih dari' }} target ≤ 2.700
      </div>
    </div>

    <div class="card animate-fade-in animate-delay-4">
      <div class="card__title" style="margin-bottom:8px;">Stock Akhir ({{ \Carbon\Carbon::parse($kpiStock?->date ?? $kpiDate)->format('d M') }})</div>
      <div class="kpi-value" style="font-size:20px;">{{ number_format($kpiStock?->closing_stock ?? 0, 0, ',', '.') }} <span class="kpi-unit">ton</span></div>
      <div class="kpi-trend kpi-trend--neutral" style="margin-top:6px;">
        Dari Coal Yard
      </div>
    </div>

  </div>

  {{-- ── Monitoring Table ── --}}
  <div class="section-divider mb-16">
    <span class="section-divider__label">Data Monitoring Terperinci</span>
    <div class="section-divider__line"></div>
  </div>

  <div class="card card--no-hover">
    <div class="card__header">
      <div class="card__meta">
        <div class="card__title">Tabel Monitoring Harian</div>
        <div class="card__subtitle">Data operasional batu bara per unit dan shift</div>
      </div>
      <div class="d-flex gap-8 flex-wrap">

        {{-- Shift buttons --}}
        <div class="shift-selector">
          <button class="shift-btn is-active">Semua</button>
          <button class="shift-btn">Shift A</button>
          <button class="shift-btn">Shift B</button>
          <button class="shift-btn">Shift C</button>
        </div>

        <button class="btn btn-outline btn--sm" disabled>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export Excel
        </button>
        <button class="btn btn-outline btn--sm" disabled>
          Export CSV
        </button>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="table table-monitoring">
        <thead>
          <tr>
            <th class="sortable" data-sort="">Tanggal</th>
            <th class="sortable" data-sort="">Unit</th>
            <th>Shift</th>
            <th>Supplier</th>
            <th class="sortable" data-sort="">Kalori (kCal/kg)</th>
            <th class="sortable" data-sort="">Moisture (%)</th>
            <th>Ash (%)</th>
            <th>Sulfur (%)</th>
            <th class="sortable" data-sort="">Pemakaian (ton)</th>
            <th class="sortable" data-sort="">Heat Rate</th>
            <th class="sortable" data-sort="">Efisiensi</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          @forelse($records as $row)
          <tr>
            <td>{{ \Carbon\Carbon::parse($row->date)->format('d M Y') }}</td>
            <td><strong style="color:var(--text-heading);">{{ $row->unit_name }}</strong></td>
            <td>All Shift</td>
            <td>Multiple</td>
            <td style="font-weight:600;">{{ $row->gar ? number_format($row->gar, 0, ',', '.') : '-' }}</td>
            <td>{{ $row->moisture ? number_format($row->moisture, 1, ',', '.') : '-' }}</td>
            <td>{{ $row->ash ? number_format($row->ash, 1, ',', '.') : '-' }}</td>
            <td>{{ $row->sulfur ? number_format($row->sulfur, 2, ',', '.') : '-' }}</td>
            <td style="font-weight:600;">{{ $row->coal_used ? number_format($row->coal_used, 0, ',', '.') : '-' }}</td>
            <td>{{ $row->heat_rate ? number_format($row->heat_rate, 0, ',', '.') : '-' }} kCal</td>
            <td>
              @if($row->boiler_efficiency >= 85)
                <span style="color:var(--success);font-weight:700;">{{ number_format($row->boiler_efficiency, 1, ',', '.') }}%</span>
              @elseif($row->boiler_efficiency >= 80)
                <span style="color:var(--warning);font-weight:700;">{{ number_format($row->boiler_efficiency, 1, ',', '.') }}%</span>
              @else
                <span style="color:var(--danger);font-weight:700;">{{ number_format($row->boiler_efficiency, 1, ',', '.') }}%</span>
              @endif
            </td>
            <td>
              @if($row->boiler_efficiency >= 85)
                <span class="tag tag--success">Normal</span>
              @elseif($row->boiler_efficiency >= 80)
                <span class="tag tag--warning">Perhatian</span>
              @else
                <span class="tag tag--danger">Bahaya</span>
              @endif
            </td>
          </tr>
          @empty
          <tr>
            <td colspan="12" style="text-align: center; color: var(--text-caption);">Data tidak ditemukan untuk filter tersebut.</td>
          </tr>
          @endforelse
        </tbody>
      </table>
    </div>

    {{-- Pagination --}}
    <div class="pagination">
      <span class="pagination__info">Menampilkan {{ $records->firstItem() }}–{{ $records->lastItem() }} dari {{ $records->total() }} data</span>
      {{ $records->links('vendor.pagination.custom') }}
    </div>
  </div>

@endsection

@section('page-js')
  <script src="{{ asset('js/monitoring.js') }}"></script>
@endsection
