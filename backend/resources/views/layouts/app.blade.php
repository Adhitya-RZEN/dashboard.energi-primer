<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Dashboard Monitoring Efisiensi Batu Bara — PT PLN Indonesia Power UBP Jeranjang" />
  <title>@yield('title', 'Dashboard') — Monitoring Batu Bara | PLN Indonesia Power UBP Jeranjang</title>

  {{-- Google Fonts: Poppins --}}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

  {{-- Material Symbols (Outlined) --}}
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />

  {{-- Global CSS --}}
  <link rel="stylesheet" href="{{ asset('css/app.css') }}" />

  {{-- Dashboard page-identity theme tokens (Dashboard Theme Color Refactor) --}}
  <link rel="stylesheet" href="{{ asset('css/theme.css') }}" />

  {{-- Page-specific CSS --}}
  @yield('page-css')
</head>
@php
  /**
   * Page theme mapping — Dashboard Theme Color Refactor
   *
   * Maps each of the six dashboard routes to a page-identity theme.
   * The resulting data-theme attribute drives CSS custom-property
   * overrides defined in theme.css ([data-theme="..."] blocks), which
   * re-scope --primary/--primary-dark/--primary-light/--primary-mid
   * for that page only. Routes outside this map (Monitoring, Data
   * Batu Bara, Laporan, Pengaturan, etc.) intentionally receive no
   * data-theme attribute and keep the default (blue) design system.
   */
  $dashboardThemeMap = [
      'dashboard.overview' => 'overview',
      'dashboard.biomassa' => 'biomassa',
      'dashboard.batubara' => 'batubara',
      'dashboard.solar'    => 'solar',
      'dashboard.stok'     => 'stok',
      'dashboard.target'   => 'target',
  ];
  $currentRouteName = request()->route()?->getName();
  $pageTheme = $dashboardThemeMap[$currentRouteName] ?? null;
@endphp
<body @if($pageTheme) data-theme="{{ $pageTheme }}" @endif>

{{-- Overlay for mobile sidebar --}}
<div class="sidebar-overlay" id="js-overlay" aria-hidden="true"></div>

<div class="app-layout">

  {{-- ════════════ NAVBAR ════════════ --}}
  @include('components.navbar')

  {{-- ════════════ SIDEBAR ════════════ --}}
  @include('components.sidebar')

  {{-- ════════════ MAIN CONTENT ════════════ --}}
  <main class="main-content" id="main-content" role="main">
    @yield('content')
  </main>

  {{-- ════════════ FOOTER ════════════ --}}
  @include('components.footer')

</div>{{-- /.app-layout --}}

{{-- Global JS --}}
<script src="{{ asset('js/app.js') }}"></script>

{{-- Page-specific JS --}}
@yield('page-js')

</body>
</html>
