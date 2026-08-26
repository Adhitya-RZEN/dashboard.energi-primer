@extends('layouts.app')

@section('title', 'Overview Dashboard Energi Primer')

@section('page-css')
  <link rel="stylesheet" href="{{ asset('css/dashboard.css') }}" />
@endsection

@section('content')
<div class="overview-page">
  @include('components.breadcrumb', [
    'items' => [
      ['label' => 'Dashboard', 'active' => false, 'url' => route('dashboard.overview')],
      ['label' => 'Overview', 'active' => true],
    ]
  ])

  <header class="page-header overview-page-header">
    <div>
      <p class="page-header__eyebrow">Energi Primer</p>
      <h1 class="page-header__title">Overview Energi Primer</h1>
      <p class="page-header__desc">Ringkasan kondisi energi primer, konsumsi, target, dan kesiapan operasi.</p>
    </div>
  </header>

  @include('components.status-bar')

  @if($error)
    <div class="overview-alert overview-alert--error" role="alert">
      <span class="material-symbols-outlined" aria-hidden="true">error</span>
      <div><strong>Data belum dapat dimuat</strong><p>{{ $error }}</p></div>
    </div>
  @endif

  @if(!empty($fallbackNotice))
    @php
      $requestedMonth = (int) ($data['meta']['requested_month'] ?? $filterMonth);
      $requestedYear = (int) ($data['meta']['requested_year'] ?? $filterYear);
      $availableMonth = (int) ($data['meta']['month'] ?? $filterMonth);
      $availableYear = (int) ($data['meta']['year'] ?? $filterYear);
      $requestedMonthLabel = \Carbon\Carbon::create(null, $requestedMonth, 1)->locale('id')->isoFormat('MMMM Y');
      $availableMonthLabel = \Carbon\Carbon::create(null, $availableMonth, 1)->locale('id')->isoFormat('MMMM Y');
    @endphp
    <div class="overview-alert overview-alert--warning" role="status">
      <span class="material-symbols-outlined" aria-hidden="true">info</span>
      <div class="overview-alert__content">
        <strong>Data {{ $requestedMonthLabel }} belum tersedia</strong>
        <p>Dashboard menampilkan data terakhir yang tersedia: <b>{{ $availableMonthLabel }}</b>.</p>
      </div>
      <a class="overview-alert__action" href="{{ route('dashboard.overview', ['month' => $availableMonth, 'year' => $availableYear]) }}">Lihat Data {{ $availableMonthLabel }} <span aria-hidden="true">&rarr;</span></a>
    </div>
  @endif

  <form method="GET" action="{{ route('dashboard.overview') }}" class="overview-filter-bar" aria-label="Filter periode">
    <div class="overview-filter-heading"><span class="material-symbols-outlined" aria-hidden="true">calendar_month</span><span>Periode</span></div>
    <select name="day" class="filter-select" aria-label="Tanggal">
      <option value="">Semua Tanggal</option>
      @for($d = 1; $d <= 31; $d++)
        <option value="{{ $d }}" {{ (string) $filterDay === (string) $d ? 'selected' : '' }}>{{ $d }}</option>
      @endfor
    </select>
    <select name="month" class="filter-select" aria-label="Bulan">
      @foreach(range(1, 12) as $m)
        @php $mPad = str_pad($m, 2, '0', STR_PAD_LEFT); @endphp
        <option value="{{ $mPad }}" {{ $filterMonth == $m ? 'selected' : '' }}>{{ \Carbon\Carbon::create(null, $m, 1)->locale('id')->isoFormat('MMMM') }}</option>
      @endforeach
    </select>
    <select name="year" class="filter-select" aria-label="Tahun">
      @for($y = date('Y') + 1; $y >= 2024; $y--)
        <option value="{{ $y }}" {{ $filterYear == $y ? 'selected' : '' }}>{{ $y }}</option>
      @endfor
    </select>
    <button type="submit" class="btn btn-primary btn--sm">Terapkan Filter</button>
    <a href="{{ route('dashboard.filter.reset', ['redirect' => route('dashboard.overview')]) }}" class="btn btn-outline btn--sm">Reset</a>
    <span class="overview-filter-source"><span class="material-symbols-outlined" aria-hidden="true">database</span>{{ $data['worksheet'] ?? '-' }} @if($filterDay)&middot; Tanggal {{ $filterDay }}@endif</span>
  </form>

  @include('components.overview-kpis')

  <div class="overview-page-footer-space" aria-hidden="true"></div>
</div>
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
