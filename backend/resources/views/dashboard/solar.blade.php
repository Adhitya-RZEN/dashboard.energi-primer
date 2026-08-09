@extends('layouts.app')

@section('title', 'Solar - Dashboard Energi Primer')

@section('page-css')
  <link rel="stylesheet" href="{{ asset('css/dashboard.css') }}" />
@endsection

@section('content')

  @include('components.breadcrumb', [
    'items' => [
      ['label' => 'Dashboard', 'active' => false, 'url' => route('dashboard.overview')],
      ['label' => 'Solar', 'active' => true],
    ]
  ])

  <header class="page-header">
    <p class="page-header__eyebrow">PT PLN Indonesia Power &middot; UBP Jeranjang</p>
    <h1 class="page-header__title">Dashboard Solar</h1>
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

  <form method="GET" action="{{ route('dashboard.solar') }}" class="filter-bar mb-16" style="margin-top:16px;">
    <span class="filter-bar__label">Periode</span>
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
    <a href="{{ route('dashboard.solar') }}" class="btn btn-outline btn--sm">Reset</a>
    <span style="font-size:12px;color:var(--text-caption);margin-left:auto;display:flex;align-items:center;gap:6px;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      {{ $data['worksheet'] ?? '-' }}
    </span>
  </form>

  <div class="section-divider mb-16">
    <span class="section-divider__label">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      Solar
    </span>
    <div class="section-divider__line"></div>
  </div>

  <div class="kpi-row animate-fade-in">

    {{-- KPI: Pemakaian Solar Harian (CJ row) --}}
    <x-kpi-card 
      title="Pemakaian Solar Harian" 
      subtitle="{{ $data['today_date'] ?? date('d F Y') }}" 
      value="{{ number_format($solar['pemakaian_harian'], 0, ',', '.') }}" 
      unit="liter" 
      label="Kolom CJ &middot; Baris hari ini" 
      iconBg="#FFFBEB" 
      delay="1">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      </x-slot>
    </x-kpi-card>

    {{-- KPI: Total Pemakaian Solar Bulanan (CJ42) --}}
    <x-kpi-card 
      title="Total Pemakaian Solar" 
      subtitle="Bulanan &middot; {{ $monthLabel }}" 
      value="{{ number_format($solar['pemakaian_bulanan'], 0, ',', '.') }}" 
      unit="liter" 
      label="Total Pemakaian &middot; CJ42" 
      iconBg="#FFFBEB" 
      delay="2">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      </x-slot>
    </x-kpi-card>

    {{-- KPI: Total Penerimaan Solar Bulanan (CC42) --}}
    <x-kpi-card 
      title="Penerimaan Solar" 
      subtitle="Bulanan &middot; {{ $monthLabel }}" 
      value="{{ number_format($solar['penerimaan_bulanan'], 0, ',', '.') }}" 
      unit="liter" 
      label="Total Penerimaan &middot; CC42" 
      iconBg="#FFFBEB" 
      delay="3">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      </x-slot>
    </x-kpi-card>

  </div>

  <div style="height:32px;"></div>

@endsection

@section('page-js')
  <script src="{{ asset('js/solar.js') }}"></script>
  <script src="{{ asset('js/dashboard.js') }}"></script>
@endsection
