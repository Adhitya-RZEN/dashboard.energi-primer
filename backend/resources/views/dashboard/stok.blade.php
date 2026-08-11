@extends('layouts.app')

@section('title', 'Stok Batubara - Dashboard Energi Primer')

@section('page-css')
  <link rel="stylesheet" href="{{ asset('css/dashboard.css') }}" />
@endsection

@section('content')

  @include('components.breadcrumb', [
    'items' => [
      ['label' => 'Dashboard', 'active' => false, 'url' => route('dashboard.overview')],
      ['label' => 'Stok Batubara', 'active' => true],
    ]
  ])

  <header class="page-header">
    <p class="page-header__eyebrow">PT PLN Indonesia Power &middot; UBP Jeranjang</p>
    <h1 class="page-header__title">Dashboard Stok Batubara</h1>
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

  <form method="GET" action="{{ route('dashboard.stok') }}" class="filter-bar mb-16" style="margin-top:16px;">
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
    <a href="{{ route('dashboard.filter.reset', ['redirect' => route('dashboard.stok')]) }}" class="btn btn-outline btn--sm">Reset</a>

    <span style="font-size:12px;color:var(--text-caption);margin-left:auto;display:flex;align-items:center;gap:6px;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      {{ $data['worksheet'] ?? '-' }}
      @if($filterDay)
        · Tanggal {{ $filterDay }}
      @endif
    </span>
  </form>

  <div class="section-divider mb-16">
    <span class="section-divider__label">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      Stok dan HOP
    </span>
    <div class="section-divider__line"></div>
  </div>

  <div class="kpi-row animate-fade-in">

    {{-- KPI: Stock Batubara (AD row) --}}
    <x-kpi-card 
      title="Stock Batubara" 
      subtitle="Coal Yard &middot; {{ $data['today_date'] ?? date('d F Y') }}" 
      value="{{ number_format($stock['stock_batubara'], 0, ',', '.') }}" 
      unit="ton" 
      label="Kolom AD &middot; Baris hari ini" 
      iconBg="#DBEAFE" 
      delay="1">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </x-slot>
      <x-slot name="extra">
        <div class="progress-bar-wrap" aria-label="Stock {{ $stockPct }}%" style="margin-top:12px;">
          <div class="progress-bar-label">
            <span>Kapasitas terisi</span>
            <span>{{ $stockPct }}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill {{ $stockPct < 30 ? 'progress-bar__fill--danger' : ($stockPct < 60 ? 'progress-bar__fill--warning' : 'progress-bar__fill--success') }}"
                 data-width="{{ $stockPct }}" style="width:0%"></div>
          </div>
        </div>
      </x-slot>
    </x-kpi-card>

    {{-- KPI: HOP (AJ row) --}}
    @php
      $hopColor = match($stock['hop_status']) {
        'danger'  => ['bg' => '#FEF2F2', 'stroke' => '#EF4444'],
        'warning' => ['bg' => '#FFFBEB', 'stroke' => '#F59E0B'],
        default   => ['bg' => '#F0FDF4', 'stroke' => '#22C55E'],
      };
    @endphp
    <x-kpi-card 
      title="HOP (Hari Operasi)" 
      subtitle="Perkiraan sisa operasi &middot; {{ $data['today_date'] ?? date('d F Y') }}" 
      value="{{ number_format($stock['hop'], 1, ',', '.') }}" 
      unit="hari" 
      label="Kolom AJ &middot; Baris hari ini" 
      iconBg="{{ $hopColor['bg'] }}" 
      delay="2">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="{{ $hopColor['stroke'] }}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </x-slot>
      <x-slot name="extra">
        <div style="margin-top:10px;">
          <span class="tag tag--{{ $stock['hop_status'] }}" style="font-size:12px;padding:4px 10px;">
            {{ $stock['hop_label'] }}
            @if($stock['hop_status'] === 'danger') &lt; 10 hari
            @elseif($stock['hop_status'] === 'warning') 10–14 hari
            @else ≥ 15 hari
            @endif
          </span>
        </div>
      </x-slot>
    </x-kpi-card>

  </div>

  <div class="section-divider mb-16" style="margin-top:24px;">
    <span class="section-divider__label">Grafik Stok &amp; HOP</span>
    <div class="section-divider__line"></div>
  </div>
  <div class="card card--no-hover mb-20">
    <div class="card__header"><div class="card__meta"><div class="card__title">Stok Batubara</div></div></div>
    <div class="chart-canvas" style="height:260px;"><canvas id="stockLineChart"></canvas></div>
  </div>
  <div class="card card--no-hover">
    <div class="card__header"><div class="card__meta"><div class="card__title">Tren HOP</div></div></div>
    <div class="chart-canvas" style="height:220px;"><canvas id="hopTrendChart"></canvas></div>
  </div>

  <div style="height:32px;"></div>

@endsection

@section('page-js')
  <script>
    window.chartSeries = @json($chartSeries ?? []);
  </script>
  <script src="{{ asset('js/chart.min.js') }}"></script>
  <script src="{{ asset('js/stok.js') }}"></script>
  <script src="{{ asset('js/dashboard.js') }}"></script>
@endsection
