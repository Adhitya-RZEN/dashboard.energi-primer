@extends('layouts.app')

@section('title', 'Biomassa - Dashboard Energi Primer')

@section('page-css')
  <link rel="stylesheet" href="{{ asset('css/dashboard.css') }}" />
@endsection

@section('content')

  @include('components.breadcrumb', [
    'items' => [
      ['label' => 'Dashboard', 'active' => false, 'url' => route('dashboard.overview')],
      ['label' => 'Biomassa', 'active' => true],
    ]
  ])

  <header class="page-header">
    <p class="page-header__eyebrow">Energi Primer</p>
    <h1 class="page-header__title">Dashboard Biomassa</h1>
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

 <form method="GET" action="{{ route('dashboard.biomassa') }}" class="filter-bar mb-16" style="margin-top:16px;">
  <span class="filter-bar__label">Periode</span>

  {{-- FILTER HARI (baru) --}}
  <select name="day" class="filter-select" aria-label="Tanggal">
    <option value="">Semua Tanggal</option>
    @for($d = 1; $d <= 31; $d++)
      <option value="{{ $d }}" {{ (string) $filterDay === (string) $d ? 'selected' : '' }}>
        {{ $d }}
      </option>
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
  <a href="{{ route('dashboard.filter.reset', ['redirect' => route('dashboard.biomassa')]) }}" class="btn btn-outline btn--sm">Reset</a>

  <span style="font-size:12px;color:var(--text-caption);margin-left:auto;display:flex;align-items:center;gap:6px;">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    {{ $data['worksheet'] ?? '-' }}
    @if($filterDay)
      Â· Tanggal {{ $filterDay }}
    @endif
  </span>
</form>

  <div class="section-divider mb-16">
    <span class="section-divider__label">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;"><path d="M12 2a9 9 0 0 1 9 9c0 4.97-9 13-9 13S3 15.97 3 11a9 9 0 0 1 9-9z"/><circle cx="12" cy="11" r="3"/></svg>
      Biomassa Utama
    </span>
    <div class="section-divider__line"></div>
  </div>

  <div class="kpi-row animate-fade-in">

    {{-- KPI: Total Penerimaan Biomassa Bulanan --}}
    <x-kpi-card 
      title="Penerimaan Biomassa" 
      subtitle="Bulanan &middot; {{ $monthLabel }}" 
      value="{{ number_format($biomassa['penerimaan_bulanan'], 0, ',', '.') }}" 
      unit="ton" 
      label="Total Penerimaan &middot; Kolom S52" 
      iconBg="#F0FDF4" 
      delay="1">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a9 9 0 0 1 9 9c0 4.97-9 13-9 13S3 15.97 3 11a9 9 0 0 1 9-9z"/><circle cx="12" cy="11" r="3"/></svg>
      </x-slot>
    </x-kpi-card>

    {{-- KPI: Total Pemakaian Biomassa Bulanan --}}
    <x-kpi-card 
      title="Pemakaian Biomassa" 
      subtitle="Bulanan &middot; {{ $monthLabel }}" 
      value="{{ number_format($biomassa['pemakaian_bulanan'], 0, ',', '.') }}" 
      unit="ton" 
      label="Kolom AC &middot; Baris hari ini" 
      iconBg="#F0FDF4" 
      delay="2">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      </x-slot>
    </x-kpi-card>

    {{-- KPI: Pemakaian Biomassa Hari Ini per Unit --}}
    <x-kpi-card 
      title="Pemakaian Biomassa Harian" 
      subtitle="Per Unit &middot; {{ $data['today_date'] ?? date('d F Y') }}" 
      iconBg="#F0FDF4" 
      delay="3"
      customContent="true">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
      </x-slot>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:var(--text-caption);font-weight:500;">Unit 1</span>
          <span style="font-size:15px;font-weight:700;color:var(--text-heading);">{{ number_format($biomassa['unit1_harian'], 0, ',', '.') }} <span style="font-size:11px;font-weight:400;color:var(--text-caption);">ton</span></span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:var(--text-caption);font-weight:500;">Unit 2</span>
          <span style="font-size:15px;font-weight:700;color:var(--text-heading);">{{ number_format($biomassa['unit2_harian'], 0, ',', '.') }} <span style="font-size:11px;font-weight:400;color:var(--text-caption);">ton</span></span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:var(--text-caption);font-weight:500;">Unit 3</span>
          <span style="font-size:15px;font-weight:700;color:var(--text-heading);">{{ number_format($biomassa['unit3_harian'], 0, ',', '.') }} <span style="font-size:11px;font-weight:400;color:var(--text-caption);">ton</span></span>
        </div>
      </div>
    </x-kpi-card>

    {{-- KPI: Total Pemakaian Batubara Bulanan (AB42) --}}
    <x-kpi-card 
      title="Pemakaian Batubara" 
      subtitle="Bulanan (via Biomassa) &middot; AB42" 
      value="{{ number_format($biomassa['total_pemakaian_batubara_bulanan'], 0, ',', '.') }}" 
      unit="ton" 
      label="Total Pemakaian &middot; {{ $monthLabel }}" 
      iconBg="#EFF6FF" 
      delay="4">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      </x-slot>
    </x-kpi-card>

  </div>

  <div class="section-divider mb-16" style="margin-top:24px;">
    <span class="section-divider__label">Grafik Biomassa</span>
    <div class="section-divider__line"></div>
  </div>
  <div class="card card--no-hover mb-20">
    <div class="card__header"><div class="card__meta"><div class="card__title">Pemakaian Biomassa Harian</div></div></div>
    <div class="chart-canvas" style="height:260px;"><canvas id="biomassaLineChart"></canvas></div>
  </div>
  <div class="card card--no-hover">
    <div class="card__header"><div class="card__meta"><div class="card__title">Pemakaian Biomassa per Unit</div></div></div>
    <div class="chart-canvas" style="height:220px;"><canvas id="biomassaUnitBarChart"></canvas></div>
  </div>

  <div style="height:32px;"></div>

@endsection

@section('page-js')
  <script>
    window.chartSeries = @json($chartSeries ?? []);
  </script>
  <script src="{{ asset('js/chart.min.js') }}"></script>
  <script src="{{ asset('js/dashboard.js') }}"></script>
  <script src="{{ asset('js/biomassa.js') }}"></script>
@endsection
