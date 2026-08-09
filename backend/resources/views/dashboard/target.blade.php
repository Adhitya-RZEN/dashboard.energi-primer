@extends('layouts.app')

@section('title', 'Target & Kinerja - Dashboard Energi Primer')

@section('page-css')
  <link rel="stylesheet" href="{{ asset('css/dashboard.css') }}" />
@endsection

@section('content')

  @include('components.breadcrumb', [
    'items' => [
      ['label' => 'Dashboard', 'active' => false, 'url' => route('dashboard.overview')],
      ['label' => 'Target & Kinerja', 'active' => true],
    ]
  ])

  <header class="page-header">
    <p class="page-header__eyebrow">PT PLN Indonesia Power &middot; UBP Jeranjang</p>
    <h1 class="page-header__title">Dashboard Target & Kinerja</h1>
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

  <form method="GET" action="{{ route('dashboard.target') }}" class="filter-bar mb-16" style="margin-top:16px;">
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
    <a href="{{ route('dashboard.target') }}" class="btn btn-outline btn--sm">Reset</a>
    <span style="font-size:12px;color:var(--text-caption);margin-left:auto;display:flex;align-items:center;gap:6px;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      {{ $data['worksheet'] ?? '-' }}
    </span>
  </form>

  <div class="section-divider mb-16">
    <span class="section-divider__label">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
      Target Biomassa
    </span>
    <div class="section-divider__line"></div>
  </div>

  <div class="kpi-row animate-fade-in" style="max-width:900px;">

    {{-- KPI: Target --}}
    <x-kpi-card 
      title="Target Biomassa" 
      subtitle="Tahun {{ $filterYear }}" 
      value="{{ number_format($targetBiomassa['target'], 0, ',', '.') }}" 
      unit="ton" 
      label="Target tahunan (sementara)" 
      iconBg="#F5F3FF" 
      delay="1">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
      </x-slot>
    </x-kpi-card>

    {{-- KPI: Realisasi Kumulatif --}}
    <x-kpi-card 
      title="Realisasi Kumulatif" 
      subtitle="Kolom CO &middot; Baris 59" 
      value="{{ number_format($targetBiomassa['realisasi_kumulatif'], 0, ',', '.') }}" 
      unit="ton" 
      label="Sisa: {{ number_format($targetBiomassa['sisa'], 0, ',', '.') }} ton" 
      iconBg="#F5F3FF" 
      delay="2">
      <x-slot name="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
      </x-slot>
    </x-kpi-card>

    {{-- KPI: Progress --}}
    <x-kpi-card 
      title="Progres Target" 
      subtitle="(Realisasi Kumulatif / Target) × 100" 
      value="{{ number_format($targetBiomassa['progress'], 1, ',', '.') }}" 
      unit="%" 
      label="Pencapaian terhadap target {{ number_format($targetBiomassa['target'], 0, ',', '.') }} ton" 
      iconBg="#F5F3FF" 
      delay="3">
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
  <script src="{{ asset('js/target.js') }}"></script>
  <script src="{{ asset('js/dashboard.js') }}"></script>
@endsection
