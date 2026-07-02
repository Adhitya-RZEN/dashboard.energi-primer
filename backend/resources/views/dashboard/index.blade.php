{{-- ============================================================
    Dashboard Overview — index.blade.php
    PT PLN Indonesia Power UBP Jeranjang
============================================================ --}}

@extends('layouts.app')

@section('title', 'Dashboard')

@section('page-css')
  <link rel="stylesheet" href="{{ asset('css/dashboard.css') }}" />
@endsection

@section('content')

  {{-- Breadcrumb --}}
  @include('components.breadcrumb', [
    'items' => [
      ['label' => 'Dashboard', 'active' => true],
    ]
  ])

  {{-- Page Header --}}
  <header class="page-header">
    <p class="page-header__eyebrow">PT PLN Indonesia Power &middot; UBP Jeranjang</p>
    <h1 class="page-header__title">Dashboard Monitoring Efisiensi Batu Bara</h1>
    {{-- <p class="page-header__desc">
      Ringkasan data operasional batu bara secara keseluruhan. Membantu Tim Energi Primer
      memantau konsumsi, efisiensi, dan kualitas batu bara PLTU Jeranjang.
    </p> --}}
  </header>

  {{-- Status Bar --}}
  @include('components.status-bar')

  {{-- ── Filter Bar ── --}}
  <form method="GET" action="{{ url('/') }}" class="filter-bar mb-16" style="margin-top: 16px;">
    <span class="filter-bar__label">Periode</span>
    <select name="month" class="filter-select">
      @foreach(range(1, 12) as $m)
        @php $mPad = str_pad($m, 2, '0', STR_PAD_LEFT); @endphp
        <option value="{{ $mPad }}" {{ $filterMonth == $mPad ? 'selected' : '' }}>
          {{ \Carbon\Carbon::create(null, $m, 1)->locale('id')->isoFormat('MMMM') }}
        </option>
      @endforeach
    </select>
    <select name="year" class="filter-select">
      @for($y = date('Y') + 1; $y >= 2024; $y--)
        <option value="{{ $y }}" {{ $filterYear == $y ? 'selected' : '' }}>{{ $y }}</option>
      @endfor
    </select>
    <button type="submit" class="btn btn-primary btn--sm">Terapkan Filter</button>
    <a href="{{ url('/') }}" class="btn btn-outline btn--sm">Reset</a>
  </form>

  {{-- ── KPI Cards ── --}}
  <div class="section-divider mb-16">
    <span class="section-divider__label">Ringkasan KPI</span>
    <div class="section-divider__line"></div>
  </div>

  <div class="kpi-row animate-fade-in">

    {{-- KPI 1: Total Konsumsi --}}
    <div class="card animate-delay-1">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Total Konsumsi</div>
          <div class="card__subtitle">Batu Bara &middot; Bulan Ini</div>
        </div>
        <div class="card__icon" style="background:#EFF6FF;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="#2563EB" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
        </div>
      </div>
      <div class="kpi-value">
        <span data-counter="{{ $totalConsumption }}" data-suffix="" data-duration="1400">{{ number_format($totalConsumption, 0, ',', '.') }}</span>
        <span class="kpi-unit">ton</span>
      </div>
      <div class="kpi-label">Akumulasi {{ $monthLabel }}</div>
      <div class="kpi-trend {{ $consumptionTrend > 0 ? 'kpi-trend--up' : ($consumptionTrend < 0 ? 'kpi-trend--down' : 'kpi-trend--neutral') }}">
        @if($consumptionTrend !== 0)
        <div class="kpi-trend__icon">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="{{ $consumptionTrend > 0 ? '18 15 12 9 6 15' : '6 9 12 15 18 9' }}"/>
          </svg>
        </div>
        @endif
        {{ $consumptionTrend > 0 ? '+' : '' }}{{ number_format($consumptionTrend, 1, ',', '.') }}% dari bulan lalu
      </div>
      <div class="kpi-mini-bar" aria-hidden="true">
        @foreach($sparkline as $val)
        <div class="kpi-mini-bar__seg" data-h="{{ $val }}"></div>
        @endforeach
      </div>
    </div>

    {{-- KPI 2: Efisiensi Boiler --}}
    <div class="card animate-delay-2">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Efisiensi Boiler</div>
          <div class="card__subtitle">Rata-rata &middot; Hari Ini</div>
        </div>
        <div class="card__icon" style="background:#D1FAE5;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="#10B981" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
          </svg>
        </div>
      </div>
      <div class="kpi-value">
        <span data-counter="{{ $avgEfficiency }}" data-suffix="%" data-duration="1200">{{ number_format($avgEfficiency, 1, ',', '.') }}%</span>
      </div>
      <div class="kpi-label">Target: ≥ 85%</div>
      <div class="kpi-trend {{ $efficiencyTrend > 0 ? 'kpi-trend--up' : ($efficiencyTrend < 0 ? 'kpi-trend--down' : 'kpi-trend--neutral') }}">
        @if($efficiencyTrend !== 0.0)
        <div class="kpi-trend__icon">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="{{ $efficiencyTrend > 0 ? '18 15 12 9 6 15' : '6 9 12 15 18 9' }}"/>
          </svg>
        </div>
        @endif
        {{ $efficiencyTrend > 0 ? '+' : '' }}{{ number_format($efficiencyTrend, 1, ',', '.') }}% dari bulan lalu
      </div>
      <div class="progress-bar-wrap" aria-label="Efisiensi {{ number_format($avgEfficiency, 1, ',', '.') }}%">
        <div class="progress-bar-label">
          <span>Progress terhadap target</span>
          <span>{{ number_format($avgEfficiency, 1, ',', '.') }} / 85%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar__fill {{ $avgEfficiency >= 85 ? 'progress-bar__fill--success' : 'progress-bar__fill--warning' }}"
               data-width="{{ min(100, $avgEfficiency) }}" style="width:0%"></div>
        </div>
      </div>
    </div>

    {{-- KPI 3: Heat Rate --}}
    <div class="card animate-delay-3">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Heat Rate</div>
          <div class="card__subtitle">kCal/kWh &middot; Hari Ini</div>
        </div>
        <div class="card__icon" style="background:#FEF3C7;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="#F59E0B" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>
      </div>
      <div class="kpi-value">
        <span data-counter="{{ $avgHeatRate }}" data-duration="1300">{{ number_format($avgHeatRate, 0, ',', '.') }}</span>
        <span class="kpi-unit">kCal/kWh</span>
      </div>
      <div class="kpi-label">Target: ≤ 2.700 kCal/kWh</div>
      <div class="kpi-trend {{ $heatRateTrend < 0 ? 'kpi-trend--up' : ($heatRateTrend > 0 ? 'kpi-trend--down' : 'kpi-trend--neutral') }}">
        @if($heatRateTrend !== 0)
        <div class="kpi-trend__icon">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="{{ $heatRateTrend < 0 ? '18 15 12 9 6 15' : '6 9 12 15 18 9' }}"/>
          </svg>
        </div>
        @endif
        {{ $heatRateTrend < 0 ? 'Lebih baik' : 'Lebih buruk' }} dari bulan lalu
      </div>
      <div class="kpi-mini-bar" aria-hidden="true">
        @foreach($hrSparkline as $val)
        <div class="kpi-mini-bar__seg" style="background:{{ $val > 70 ? '#FDE68A' : '#F59E0B' }};" data-h="{{ $val }}"></div>
        @endforeach
      </div>
    </div>

    {{-- KPI 4: Stock Batu Bara --}}
    <div class="card animate-delay-4">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Stock Batu Bara</div>
          <div class="card__subtitle">Saat Ini &middot; Coal Yard</div>
        </div>
        <div class="card__icon" style="background:#DBEAFE;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="#3B82F6" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
      </div>
      <div class="kpi-value">
        <span data-counter="{{ $latestStock ? $latestStock->closing_stock : 0 }}" data-duration="1500">{{ number_format($latestStock ? $latestStock->closing_stock : 0, 0, ',', '.') }}</span>
        <span class="kpi-unit">ton</span>
      </div>
      <div class="kpi-label">Kapasitas: 20.000 ton</div>
      <div class="kpi-trend kpi-trend--neutral">
        Cukup untuk ≈ 8,5 hari operasi
      </div>
      <div class="progress-bar-wrap" aria-label="Stock {{ $stockPct }}%">
        <div class="progress-bar-label">
          <span>Kapasitas terisi</span>
          <span>{{ $stockPct }}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar__fill {{ $stockPct < 30 ? 'progress-bar__fill--danger' : ($stockPct < 60 ? 'progress-bar__fill--warning' : 'progress-bar__fill--success') }}"
               data-width="{{ $stockPct }}" style="width:0%"></div>
        </div>
      </div>
    </div>

  </div>

  {{-- ── Unit Performance ── --}}
  <div class="section-divider mb-16">
    <span class="section-divider__label">Performa Unit PLTU</span>
    <div class="section-divider__line"></div>
  </div>

  <div class="unit-perf-row">

    {{-- Unit Performance Table --}}
    <div class="card card--no-hover">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Ringkasan Performa Unit</div>
          <div class="card__subtitle">Data hari ini · Semua unit aktif</div>
        </div>
        <span class="tag tag--success">Semua Normal</span>
      </div>
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Efisiensi</th>
              <th>Heat Rate</th>
              <th>Konsumsi</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            @forelse($unitPerformance as $up)
            <tr>
              <td><strong style="color:var(--text-heading);">{{ $up->unit_name }}</strong></td>
              <td><span class="eff-badge" style="background:{{ $up->boiler_efficiency >= 85 ? '#D1FAE5' : '#FEF3C7' }};color:{{ $up->boiler_efficiency >= 85 ? '#065F46' : '#92400E' }};font-size:12px;font-weight:700;padding:3px 8px;border-radius:6px;">{{ number_format($up->boiler_efficiency, 1, ',', '.') }}%</span></td>
              <td style="font-weight:600;">{{ number_format($up->heat_rate, 0, ',', '.') }} kCal</td>
              <td>{{ number_format($up->coal_used, 0, ',', '.') }} ton</td>
              <td><span class="tag tag--{{ $up->boiler_efficiency >= 85 ? 'success' : 'warning' }}">{{ $up->boiler_efficiency >= 85 ? 'Normal' : 'Perhatian' }}</span></td>
            </tr>
            @empty
            <tr>
              <td colspan="5" style="text-align: center; color: var(--text-caption);">Belum ada data unit</td>
            </tr>
            @endforelse
          </tbody>
        </table>
      </div>
    </div>

    {{-- Activity Feed --}}
    <div class="card card--no-hover">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Aktivitas Terbaru</div>
          <div class="card__subtitle">Log operasional hari ini</div>
        </div>
      </div>
      <div class="activity-list">
        @forelse($recentActivity as $activity)
        <div class="activity-item">
          <div class="activity-dot" style="background:var(--{{ $activity->boiler_efficiency >= 85 ? 'success' : 'warning' }});"></div>
          <div class="activity-content">
            <div class="activity-title">Konsumsi {{ $activity->unit_name }}</div>
            <div class="activity-meta">Pemakaian: {{ number_format($activity->coal_used, 0, ',', '.') }} ton &middot; Efisiensi: {{ number_format($activity->boiler_efficiency, 1, ',', '.') }}% &middot; {{ \Carbon\Carbon::parse($activity->date)->format('d M Y') }}</div>
          </div>
        </div>
        @empty
        <div class="activity-item">
          <div class="activity-content">
            <div class="activity-meta">Tidak ada aktivitas terbaru.</div>
          </div>
        </div>
        @endforelse
      </div>
    </div>

  </div>

  {{-- ── Chart Area ── --}}
  <div class="section-divider mb-16">
    <span class="section-divider__label">Grafik Analitik</span>
    <div class="section-divider__line"></div>
    <span class="chip chip--phase">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      Phase 2
    </span>
  </div>

  <div class="chart-row">
    <div class="card card--no-hover">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Tren Konsumsi Batu Bara</div>
          <div class="card__subtitle">30 hari terakhir &middot; Per unit PLTU</div>
        </div>
        <button class="btn btn-secondary btn--sm" disabled>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export
        </button>
      </div>
      <div class="chart-placeholder">
        <svg class="chart-placeholder__icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        <span class="chart-placeholder__label">Line Chart — Tren Konsumsi Harian</span>
        <span class="chart-placeholder__sub">Akan ditampilkan pada Phase 2 (integrasi Chart.js)</span>
      </div>
    </div>

    <div class="card card--no-hover">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Distribusi Kualitas</div>
          <div class="card__subtitle">Kalori · Bulan ini</div>
        </div>
      </div>
      <div class="chart-placeholder">
        <svg class="chart-placeholder__icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
          <path d="M22 12A10 10 0 0 0 12 2v10z"/>
        </svg>
        <span class="chart-placeholder__label">Pie Chart — Kualitas Batu Bara</span>
        <span class="chart-placeholder__sub">Akan ditampilkan pada Phase 2</span>
      </div>
    </div>
  </div>

  {{-- ── Monitoring Table ── --}}
  <div class="section-divider mb-16">
    <span class="section-divider__label">Data Monitoring Harian</span>
    <div class="section-divider__line"></div>
  </div>

  <div class="card card--no-hover mb-0">
    <div class="card__header">
      <div class="card__meta">
        <div class="card__title">Tabel Monitoring Operasional</div>
        <div class="card__subtitle">Data batu bara per unit · Shift hari ini</div>
      </div>
      <div class="d-flex gap-8">
        <a href="{{ url('/monitoring') }}" class="btn btn-outline btn--sm">
          Lihat Semua
        </a>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Unit</th>
            <th>Shift</th>
            <th>Kalori (kCal/kg)</th>
            <th>Moisture (%)</th>
            <th>Ash (%)</th>
            <th>Pemakaian (ton)</th>
            <th>Heat Rate</th>
            <th>Efisiensi</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          @forelse($monitoringTable as $m)
          <tr>
            <td>{{ \Carbon\Carbon::parse($m->date)->format('d M Y') }}</td>
            <td><strong>{{ $m->unit_name }}</strong></td>
            <td>All Shift</td>
            <td>{{ $m->gar ? number_format($m->gar, 0, ',', '.') : '-' }}</td>
            <td>{{ $m->moisture ? number_format($m->moisture, 1, ',', '.') : '-' }}</td>
            <td>{{ $m->ash ? number_format($m->ash, 1, ',', '.') : '-' }}</td>
            <td>{{ $m->coal_used ? number_format($m->coal_used, 0, ',', '.') : '-' }}</td>
            <td>{{ $m->heat_rate ? number_format($m->heat_rate, 0, ',', '.') . ' kCal' : '-' }}</td>
            <td><span style="color:var(--{{ $m->boiler_efficiency >= 85 ? 'success' : 'warning' }});font-weight:700;">{{ $m->boiler_efficiency ? number_format($m->boiler_efficiency, 1, ',', '.') . '%' : '-' }}</span></td>
            <td><span class="tag tag--{{ $m->boiler_efficiency >= 85 ? 'success' : 'warning' }}">{{ $m->boiler_efficiency >= 85 ? 'Normal' : 'Perhatian' }}</span></td>
          </tr>
          @empty
          <tr>
            <td colspan="10" style="text-align: center; color: var(--text-caption);">Belum ada data monitoring</td>
          </tr>
          @endforelse
        </tbody>
      </table>
    </div>

    {{-- Pagination --}}
    <div class="pagination">
      <span class="pagination__info">Menampilkan {{ count($monitoringTable) }} data terbaru dari total {{ number_format($totalMonitoringCount, 0, ',', '.') }}</span>
    </div>
  </div>

@endsection

@section('page-js')
  <script src="{{ asset('js/dashboard.js') }}"></script>
@endsection
