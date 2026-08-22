@extends('layouts.app')

@section('title', 'Overview Dashboard Energi Primer')

@section('page-css')
  <link rel="stylesheet" href="{{ asset('css/dashboard.css') }}" />
@endsection

@section('content')
  @include('components.breadcrumb', [
    'items' => [
      ['label' => 'Dashboard', 'active' => false, 'url' => route('dashboard.overview')],
      ['label' => 'Overview', 'active' => true],
    ]
  ])

  <header class="page-header">
    <p class="page-header__eyebrow">Energi Primer</p>
    <h1 class="page-header__title">Overview Energi Primer</h1>
  </header>

  @include('components.status-bar')

  @if($error)
    <div class="alert-error mb-16" role="alert" style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:12px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span style="color:#B91C1C;font-size:13px;font-weight:500;">{{ $error }}</span>
    </div>
  @endif

  @if(!empty($fallbackNotice))
    <div class="alert-fallback mb-16" role="status" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:12px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span style="color:#92400E;font-size:13px;font-weight:500;">{{ $fallbackNotice }}</span>
    </div>
  @endif

  <form method="GET" action="{{ route('dashboard.overview') }}" class="filter-bar mb-16" style="margin-top:16px;">
    <span class="filter-bar__label">Periode</span>
    <select name="day" class="filter-select" aria-label="Tanggal">
      <option value="">Semua Tanggal</option>
      @for($d = 1; $d <= 31; $d++)
        <option value="{{ $d }}" {{ (string) $filterDay === (string) $d ? 'selected' : '' }}>{{ $d }}</option>
      @endfor
    </select>
    <select name="month" class="filter-select">
      @foreach(range(1, 12) as $m)
        @php $mPad = str_pad($m, 2, '0', STR_PAD_LEFT); @endphp
        <option value="{{ $mPad }}" {{ $filterMonth == $m ? 'selected' : '' }}>
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
    <a href="{{ route('dashboard.filter.reset', ['redirect' => route('dashboard.overview')]) }}" class="btn btn-outline btn--sm">Reset</a>
    <span style="font-size:12px;color:var(--text-caption);margin-left:auto;display:flex;align-items:center;gap:6px;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      {{ $data['worksheet'] ?? '-' }}
      @if($filterDay) &middot; Tanggal {{ $filterDay }} @endif
    </span>
  </form>

  <div class="section-divider mb-16">
    <span class="section-divider__label">15 KPI Dashboard</span>
    <div class="section-divider__line"></div>
  </div>

  @include('components.overview-kpis')

  <div class="section-divider mb-16" style="margin-top:24px;">
    <span class="section-divider__label">Grafik Konsumsi Energi Primer</span>
    <div class="section-divider__line"></div>
  </div>
  <div class="card card--no-hover mb-20">
    <div class="card__header"><div class="card__meta">
      <div class="card__title">Konsumsi Energi Primer Harian</div>
      <div class="card__subtitle">Batubara vs Biomassa &middot; {{ $monthLabel }}</div>
    </div></div>
    <div class="chart-canvas" style="height:280px;"><canvas id="energyLineChart"></canvas></div>
  </div>
  <div class="chart-row">
    <div class="card card--no-hover">
      <div class="card__header"><div class="card__meta">
        <div class="card__title">Target vs Realisasi Kumulatif Biomassa</div>
      </div></div>
      <div class="chart-canvas" style="height:220px;"><canvas id="targetBarChart"></canvas></div>
    </div>
  </div>
  <div style="height:32px;"></div>
@endsection

@section('page-js')
  <script>
    window.chartSeries = @json($chartSeries ?? []);
    window.targetBiomassaData = @json($targetBiomassa ?? []);
  </script>
  <script src="{{ asset('js/chart.min.js') }}"></script>
  <script src="{{ asset('js/dashboard.js') }}"></script>
  <script src="{{ asset('js/overview.js') }}"></script>
@endsection
