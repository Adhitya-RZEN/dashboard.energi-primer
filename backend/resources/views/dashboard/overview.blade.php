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
    <p class="page-header__eyebrow">PT PLN Indonesia Power &middot; UBP Jeranjang</p>
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
  <a href="{{ route('dashboard.filter.reset', ['redirect' => route('dashboard.overview')]) }}" class="btn btn-outline btn--sm">Reset</a>

  <span style="font-size:12px;color:var(--text-caption);margin-left:auto;display:flex;align-items:center;gap:6px;">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    {{ $data['worksheet'] ?? '-' }}
    @if($filterDay)
      · Tanggal {{ $filterDay }}
    @endif
  </span>
</form>

  <div class="section-divider mb-16">
    <span class="section-divider__label">Executive Summary</span>
    <div class="section-divider__line"></div>
  </div>

  <div class="kpi-row animate-fade-in">
    {{-- Biomassa Overview --}}
    <x-kpi-card 
      title="Penerimaan Biomassa" 
      subtitle="Bulanan &middot; {{ $monthLabel }}" 
      value="{{ number_format($biomassa['penerimaan_bulanan'], 0, ',', '.') }}" 
      unit="ton" 
      label="Total Penerimaan" 
      iconBg="#F0FDF4" 
      delay="1">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a9 9 0 0 1 9 9c0 4.97-9 13-9 13S3 15.97 3 11a9 9 0 0 1 9-9z"/><circle cx="12" cy="11" r="3"/></svg>
      </x-slot>
    </x-kpi-card>

    <x-kpi-card 
      title="Pemakaian Biomassa" 
      subtitle="Bulanan &middot; {{ $monthLabel }}" 
      value="{{ number_format($biomassa['pemakaian_bulanan'], 0, ',', '.') }}" 
      unit="ton" 
      label="Total Pemakaian" 
      iconBg="#F0FDF4" 
      delay="2">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      </x-slot>
    </x-kpi-card>

    {{-- Batubara Overview --}}
    <x-kpi-card 
      title="Penerimaan Batubara" 
      subtitle="Bulanan &middot; {{ $monthLabel }}" 
      value="{{ number_format($batubara['penerimaan_bulanan'], 0, ',', '.') }}" 
      unit="ton" 
      label="Total Penerimaan" 
      iconBg="#EFF6FF" 
      delay="3">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      </x-slot>
    </x-kpi-card>

    <x-kpi-card 
      title="Pemakaian Batubara" 
      subtitle="Bulanan &middot; {{ $monthLabel }}" 
      value="{{ number_format($biomassa['total_pemakaian_batubara_bulanan'], 0, ',', '.') }}" 
      unit="ton" 
      label="Total Pemakaian" 
      iconBg="#EFF6FF" 
      delay="4">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      </x-slot>
    </x-kpi-card>
  </div>
  
  <div class="kpi-row animate-fade-in" style="margin-top:24px;">
    {{-- Stok Overview --}}
    <x-kpi-card 
      title="Stok Batubara" 
      subtitle="Harian &middot; {{ $data['today_date'] ?? date('d F Y') }}" 
      value="{{ number_format($stock['stock_batubara'], 0, ',', '.') }}" 
      unit="ton" 
      label="Maksimum 70.000 ton" 
      iconBg="#FEF2F2" 
      delay="5">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
      </x-slot>
      <x-slot name="extra">
        <div class="progress-bar-wrap" aria-label="Kapasitas {{ $stockPct }}%" style="margin-top:12px;">
          <div class="progress-bar-label">
            <span>Kapasitas</span>
            <span>{{ $stockPct }}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar__fill--neutral" data-width="{{ $stockPct }}" style="width:0%"></div>
          </div>
        </div>
      </x-slot>
    </x-kpi-card>

    <x-kpi-card 
      title="Hari Operasi (HOP)" 
      subtitle="Harian &middot; {{ $data['today_date'] ?? date('d F Y') }}" 
      value="{{ number_format($stock['hop'], 1, ',', '.') }}" 
      unit="hari" 
      label="Status: {{ $stock['hop_label'] }}" 
      iconBg="{{ $stock['hop_status'] == 'success' ? '#F0FDF4' : ($stock['hop_status'] == 'warning' ? '#FFFBEB' : '#FEF2F2') }}" 
      delay="6">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="{{ $stock['hop_status'] == 'success' ? '#16A34A' : ($stock['hop_status'] == 'warning' ? '#D97706' : '#DC2626') }}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </x-slot>
    </x-kpi-card>
    
    {{-- Solar Overview --}}
    <x-kpi-card 
      title="Pemakaian Solar" 
      subtitle="Bulanan &middot; {{ $monthLabel }}" 
      value="{{ number_format($solar['pemakaian_bulanan'], 0, ',', '.') }}" 
      unit="L" 
      label="Total Pemakaian" 
      iconBg="#FFF7ED" 
      delay="7">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EA580C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      </x-slot>
    </x-kpi-card>

    {{-- Target Overview --}}
    <x-kpi-card 
      title="Progres Target" 
      subtitle="(Realisasi Kumulatif / Target) × 100" 
      value="{{ number_format($targetBiomassa['progress'], 1, ',', '.') }}" 
      unit="%" 
      label="Realisasi: {{ number_format($targetBiomassa['realisasi_kumulatif'], 0, ',', '.') }} ton" 
      iconBg="#F5F3FF" 
      delay="8">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      </x-slot>
      <x-slot name="extra">
        <div class="progress-bar-wrap" aria-label="Progress {{ $targetBiomassa['progress'] }}%" style="margin-top:12px;">
          <div class="progress-bar-label">
            <span>Progress</span>
            <span>{{ number_format($targetBiomassa['progress'], 1, ',', '.') }}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill {{ $targetBiomassa['progress'] >= 100 ? 'progress-bar__fill--success' : ($targetBiomassa['progress'] >= 70 ? 'progress-bar__fill--warning' : 'progress-bar__fill--danger') }}"
                 data-width="{{ min(100, $targetBiomassa['progress']) }}" style="width:0%"></div>
          </div>
        </div>
      </x-slot>
    </x-kpi-card>
  </div>

  <div style="height:32px;"></div>

@endsection

@section('page-js')
  <script src="{{ asset('js/overview.js') }}"></script>
  <script src="{{ asset('js/dashboard.js') }}"></script>
@endsection
