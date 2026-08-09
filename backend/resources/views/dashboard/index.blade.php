{{-- ============================================================
    Dashboard Energi Primer — index.blade.php
    PT PLN Indonesia Power UBP Jeranjang
    Sumber data: Google Sheets API (Fase 1)
============================================================ --}}

@extends('layouts.app')

@section('title', 'Dashboard Energi Primer')

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
    <h1 class="page-header__title">Dashboard Energi Primer</h1>
  </header>

  {{-- Status Bar --}}
  @include('components.status-bar')

  {{-- ── Error Alert ── --}}
  @if($error)
  <div class="alert-error mb-16" role="alert" style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:12px;">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <span style="color:#B91C1C;font-size:13px;font-weight:500;">{{ $error }}</span>
  </div>
  @endif

  {{-- ── Fallback Notice ── --}}
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
  <a href="{{ route('dashboard.index') }}" class="btn btn-outline btn--sm">Reset</a>

  <span style="font-size:12px;color:var(--text-caption);margin-left:auto;display:flex;align-items:center;gap:6px;">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    {{ $data['worksheet'] ?? '-' }}
    @if($filterDay)
      · Tanggal {{ $filterDay }}
    @endif
  </span>
</form>

  {{-- ════════════════════════════════════════════════
       BAGIAN 1 — BIOMASSA
  ════════════════════════════════════════════════ --}}
  <div class="section-divider mb-16">
    <span class="section-divider__label">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;"><path d="M12 2a9 9 0 0 1 9 9c0 4.97-9 13-9 13S3 15.97 3 11a9 9 0 0 1 9-9z"/><circle cx="12" cy="11" r="3"/></svg>
      Biomassa
    </span>
    <div class="section-divider__line"></div>
  </div>

  <div class="kpi-row animate-fade-in">

    {{-- KPI: Total Penerimaan Biomassa Bulanan (S42) --}}
    <div class="card animate-delay-1">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Penerimaan Biomassa</div>
          <div class="card__subtitle">Bulanan &middot; {{ $monthLabel }}</div>
        </div>
        <div class="card__icon" style="background:#F0FDF4;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a9 9 0 0 1 9 9c0 4.97-9 13-9 13S3 15.97 3 11a9 9 0 0 1 9-9z"/><circle cx="12" cy="11" r="3"/></svg>
        </div>
      </div>
      <div class="kpi-value">
        <span>{{ number_format($biomassa['penerimaan_bulanan'], 0, ',', '.') }}</span>
        <span class="kpi-unit">ton</span>
      </div>
      <div class="kpi-label">Total Penerimaan &middot; Kolom S42</div>
    </div>

    {{-- KPI: Total Pemakaian Biomassa Bulanan (SUM J42:Q42) --}}
    <div class="card animate-delay-2">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Pemakaian Biomassa</div>
          <div class="card__subtitle">Bulanan &middot; {{ $monthLabel }}</div>
        </div>
        <div class="card__icon" style="background:#F0FDF4;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
      </div>
      <div class="kpi-value">
        <span>{{ number_format($biomassa['pemakaian_bulanan'], 0, ',', '.') }}</span>
        <span class="kpi-unit">ton</span>
      </div>
      <div class="kpi-label">SUM(J42:Q42) &middot; Semua Unit</div>
    </div>

    {{-- KPI: Pemakaian Biomassa Hari Ini per Unit --}}
    <div class="card animate-delay-3">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Pemakaian Biomassa Harian</div>
          <div class="card__subtitle">Per Unit &middot; {{ $data['today_date'] ?? date('d F Y') }}</div>
        </div>
        <div class="card__icon" style="background:#F0FDF4;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
        </div>
      </div>
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
    </div>

    {{-- KPI: Total Pemakaian Batubara Bulanan (AB42) --}}
    <div class="card animate-delay-4">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Pemakaian Batubara</div>
          <div class="card__subtitle">Bulanan (via Biomassa) &middot; AB42</div>
        </div>
        <div class="card__icon" style="background:#EFF6FF;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </div>
      </div>
      <div class="kpi-value">
        <span>{{ number_format($biomassa['total_pemakaian_batubara_bulanan'], 0, ',', '.') }}</span>
        <span class="kpi-unit">ton</span>
      </div>
      <div class="kpi-label">Total Pemakaian Batubara &middot; {{ $monthLabel }}</div>
    </div>

  </div>{{-- /.kpi-row biomassa --}}


  {{-- ════════════════════════════════════════════════
       BAGIAN 2 — BATUBARA
  ════════════════════════════════════════════════ --}}
  <div class="section-divider mb-16" style="margin-top:24px;">
    <span class="section-divider__label">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      Batubara
    </span>
    <div class="section-divider__line"></div>
  </div>

  <div class="kpi-row animate-fade-in">

    {{-- KPI: Total Penerimaan Batubara Bulanan (T42) --}}
    <div class="card animate-delay-1">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Penerimaan Batubara</div>
          <div class="card__subtitle">Bulanan &middot; {{ $monthLabel }}</div>
        </div>
        <div class="card__icon" style="background:#EFF6FF;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </div>
      </div>
      <div class="kpi-value">
        <span>{{ number_format($batubara['penerimaan_bulanan'], 0, ',', '.') }}</span>
        <span class="kpi-unit">ton</span>
      </div>
      <div class="kpi-label">Total Penerimaan &middot; Kolom T42</div>
    </div>

    {{-- KPI: Pemakaian Batubara Hari Ini per Unit --}}
    <div class="card animate-delay-2">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Pemakaian Batubara Harian</div>
          <div class="card__subtitle">Per Unit &middot; {{ $data['today_date'] ?? date('d F Y') }}</div>
        </div>
        <div class="card__icon" style="background:#EFF6FF;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:var(--text-caption);font-weight:500;">Unit 1</span>
          <span style="font-size:15px;font-weight:700;color:var(--text-heading);">{{ number_format($batubara['unit1_harian'], 0, ',', '.') }} <span style="font-size:11px;font-weight:400;color:var(--text-caption);">ton</span></span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:var(--text-caption);font-weight:500;">Unit 2</span>
          <span style="font-size:15px;font-weight:700;color:var(--text-heading);">{{ number_format($batubara['unit2_harian'], 0, ',', '.') }} <span style="font-size:11px;font-weight:400;color:var(--text-caption);">ton</span></span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:var(--text-caption);font-weight:500;">Unit 3</span>
          <span style="font-size:15px;font-weight:700;color:var(--text-heading);">{{ number_format($batubara['unit3_harian'], 0, ',', '.') }} <span style="font-size:11px;font-weight:400;color:var(--text-caption);">ton</span></span>
        </div>
      </div>
    </div>

    {{-- KPI: Total Pemakaian Batubara Harian (AB row) --}}
    <div class="card animate-delay-3">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Total Pemakaian Harian</div>
          <div class="card__subtitle">Semua Unit &middot; {{ $data['today_date'] ?? date('d F Y') }}</div>
        </div>
        <div class="card__icon" style="background:#FEF3C7;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
      </div>
      <div class="kpi-value">
        <span>{{ number_format($batubara['pemakaian_harian'], 0, ',', '.') }}</span>
        <span class="kpi-unit">ton</span>
      </div>
      <div class="kpi-label">Kolom AB &middot; Baris hari ini</div>
    </div>

  </div>{{-- /.kpi-row batubara --}}


  {{-- ════════════════════════════════════════════════
       BAGIAN 3 — STOCK
  ════════════════════════════════════════════════ --}}
  <div class="section-divider mb-16" style="margin-top:24px;">
    <span class="section-divider__label">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      Stock
    </span>
    <div class="section-divider__line"></div>
  </div>

  <div class="kpi-row animate-fade-in">

    {{-- KPI: Stock Batubara (AD row) --}}
    <div class="card animate-delay-1">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Stock Batubara</div>
          <div class="card__subtitle">Coal Yard &middot; {{ $data['today_date'] ?? date('d F Y') }}</div>
        </div>
        <div class="card__icon" style="background:#DBEAFE;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </div>
      </div>
      <div class="kpi-value">
        <span>{{ number_format($stock['stock_batubara'], 0, ',', '.') }}</span>
        <span class="kpi-unit">ton</span>
      </div>
      <div class="kpi-label">Kolom AD &middot; Baris hari ini</div>
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
    </div>

    {{-- KPI: HOP (AJ row) --}}
    <div class="card animate-delay-2">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">HOP (Hari Operasi)</div>
          <div class="card__subtitle">Perkiraan sisa operasi &middot; {{ $data['today_date'] ?? date('d F Y') }}</div>
        </div>
        @php
          $hopColor = match($stock['hop_status']) {
            'danger'  => ['bg' => '#FEF2F2', 'stroke' => '#EF4444'],
            'warning' => ['bg' => '#FFFBEB', 'stroke' => '#F59E0B'],
            default   => ['bg' => '#F0FDF4', 'stroke' => '#22C55E'],
          };
        @endphp
        <div class="card__icon" style="background:{{ $hopColor['bg'] }};">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="{{ $hopColor['stroke'] }}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
      </div>
      <div class="kpi-value">
        <span>{{ number_format($stock['hop'], 1, ',', '.') }}</span>
        <span class="kpi-unit">hari</span>
      </div>
      <div class="kpi-label">Kolom AJ &middot; Baris hari ini</div>
      <div style="margin-top:10px;">
        <span class="tag tag--{{ $stock['hop_status'] }}" style="font-size:12px;padding:4px 10px;">
          {{ $stock['hop_label'] }}
          @if($stock['hop_status'] === 'danger') &lt; 10 hari
          @elseif($stock['hop_status'] === 'warning') 10–14 hari
          @else ≥ 15 hari
          @endif
        </span>
      </div>
      <div class="kpi-trend kpi-trend--neutral" style="margin-top:10px;font-size:11px;">
        Kritis &lt;10 &nbsp;|&nbsp; Perhatian 10-14 &nbsp;|&nbsp; Aman ≥15
      </div>
    </div>

  </div>{{-- /.kpi-row stock --}}


  {{-- ════════════════════════════════════════════════
       BAGIAN 4 — SOLAR
  ════════════════════════════════════════════════ --}}
  <div class="section-divider mb-16" style="margin-top:24px;">
    <span class="section-divider__label">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      Solar
    </span>
    <div class="section-divider__line"></div>
  </div>

  <div class="kpi-row animate-fade-in">

    {{-- KPI: Pemakaian Solar Harian (CJ row) --}}
    <div class="card animate-delay-1">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Pemakaian Solar Harian</div>
          <div class="card__subtitle">{{ $data['today_date'] ?? date('d F Y') }}</div>
        </div>
        <div class="card__icon" style="background:#FFFBEB;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        </div>
      </div>
      <div class="kpi-value">
        <span>{{ number_format($solar['pemakaian_harian'], 0, ',', '.') }}</span>
        <span class="kpi-unit">liter</span>
      </div>
      <div class="kpi-label">Kolom CJ &middot; Baris hari ini</div>
    </div>

    {{-- KPI: Total Pemakaian Solar Bulanan (CJ42) --}}
    <div class="card animate-delay-2">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Total Pemakaian Solar</div>
          <div class="card__subtitle">Bulanan &middot; {{ $monthLabel }}</div>
        </div>
        <div class="card__icon" style="background:#FFFBEB;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
      </div>
      <div class="kpi-value">
        <span>{{ number_format($solar['pemakaian_bulanan'], 0, ',', '.') }}</span>
        <span class="kpi-unit">liter</span>
      </div>
      <div class="kpi-label">Total Pemakaian &middot; CJ42</div>
    </div>

    {{-- KPI: Total Penerimaan Solar Bulanan (CC42) --}}
    <div class="card animate-delay-3">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Penerimaan Solar</div>
          <div class="card__subtitle">Bulanan &middot; {{ $monthLabel }}</div>
        </div>
        <div class="card__icon" style="background:#FFFBEB;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
      </div>
      <div class="kpi-value">
        <span>{{ number_format($solar['penerimaan_bulanan'], 0, ',', '.') }}</span>
        <span class="kpi-unit">liter</span>
      </div>
      <div class="kpi-label">Total Penerimaan &middot; CC42</div>
    </div>

  </div>{{-- /.kpi-row solar --}}


  {{-- ════════════════════════════════════════════════
       BAGIAN 5 — TARGET BIOMASSA
  ════════════════════════════════════════════════ --}}
  <div class="section-divider mb-16" style="margin-top:24px;">
    <span class="section-divider__label">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
      Target Biomassa
    </span>
    <div class="section-divider__line"></div>
  </div>

  <div class="kpi-row animate-fade-in" style="max-width:900px;">

    {{-- KPI: Target --}}
    <div class="card animate-delay-1">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Target Biomassa</div>
          <div class="card__subtitle">Tahun {{ $filterYear }}</div>
        </div>
        <div class="card__icon" style="background:#F5F3FF;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        </div>
      </div>
      <div class="kpi-value">
        <span>{{ number_format($targetBiomassa['target'], 0, ',', '.') }}</span>
        <span class="kpi-unit">ton</span>
      </div>
      <div class="kpi-label">Target tahunan (sementara)</div>
    </div>

    {{-- KPI: Realisasi Kumulatif --}}
    <div class="card animate-delay-2">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Realisasi Kumulatif</div>
          <div class="card__subtitle">Kolom CO &middot; Baris 59</div>
        </div>
        <div class="card__icon" style="background:#F5F3FF;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        </div>
      </div>
      <div class="kpi-value">
        <span>{{ number_format($targetBiomassa['realisasi_kumulatif'], 0, ',', '.') }}</span>
        <span class="kpi-unit">ton</span>
      </div>
      <div class="kpi-label">Sisa: {{ number_format($targetBiomassa['sisa'], 0, ',', '.') }} ton</div>
    </div>

    {{-- KPI: Progress --}}
    <div class="card animate-delay-3">
      <div class="card__header">
        <div class="card__meta">
          <div class="card__title">Progres Target</div>
          <div class="card__subtitle">(Realisasi Kumulatif / Target) × 100</div>
        </div>
        <div class="card__icon" style="background:#F5F3FF;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        </div>
      </div>
      <div class="kpi-value">
        <span>{{ number_format($targetBiomassa['progress'], 1, ',', '.') }}</span>
        <span class="kpi-unit">%</span>
      </div>
      <div class="kpi-label">Pencapaian terhadap target {{ number_format($targetBiomassa['target'], 0, ',', '.') }} ton</div>
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
    </div>

  </div>{{-- /.kpi-row target-biomassa --}}

  {{-- Spacer bawah --}}
  <div style="height:32px;"></div>

@endsection

@section('page-js')
  <script src="{{ asset('js/dashboard.js') }}"></script>
@endsection
