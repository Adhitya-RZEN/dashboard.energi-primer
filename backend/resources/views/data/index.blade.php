{{-- ============================================================
    Data Batu Bara — index.blade.php
    PT PLN Indonesia Power UBP Jeranjang
============================================================ --}}

@extends('layouts.app')

@section('title', 'Data Batu Bara')

@section('page-css')
  <link rel="stylesheet" href="{{ asset('css/data.css') }}" />
@endsection

@section('content')

  {{-- Breadcrumb --}}
  @include('components.breadcrumb', [
    'items' => [
      ['label' => 'Dashboard', 'url' => '/'],
      ['label' => 'Data Batu Bara', 'active' => true],
    ]
  ])

  {{-- Page Header --}}
  <header class="page-header">
    <p class="page-header__eyebrow">PT PLN Indonesia Power &middot; UBP Jeranjang</p>
    <h1 class="page-header__title">Data Kualitas Batu Bara</h1>
    <p class="page-header__desc">
      Kelola dan pantau data kualitas batu bara dari setiap penerimaan dan pengujian laboratorium.
    </p>
    <div class="page-header__actions">
      <div class="add-btn-group">
        <button class="btn btn-primary" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Tambah Data
        </button>
        <button class="btn btn-outline" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Import CSV
        </button>
        <button class="btn btn-secondary" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export
        </button>
      </div>
    </div>
  </header>

  {{-- ── Summary Stats ── --}}
  <div class="data-summary-row">
    <div class="card data-summary-item">
      <div class="data-summary-value" style="color:var(--primary);">{{ number_format($totalEntri, 0, ',', '.') }}</div>
      <div class="data-summary-label">Total Entri</div>
    </div>
    <div class="card data-summary-item">
      <div class="data-summary-value" style="color:var(--success);">{{ number_format($onSpec, 0, ',', '.') }}</div>
      <div class="data-summary-label">On Spec</div>
    </div>
    <div class="card data-summary-item">
      <div class="data-summary-value" style="color:var(--warning);">{{ number_format($perhatian, 0, ',', '.') }}</div>
      <div class="data-summary-label">Perhatian</div>
    </div>
    <div class="card data-summary-item">
      <div class="data-summary-value" style="color:var(--danger);">{{ number_format($offSpec, 0, ',', '.') }}</div>
      <div class="data-summary-label">Off Spec</div>
    </div>
    <div class="card data-summary-item">
      <div class="data-summary-value">{{ number_format($avgGar, 0, ',', '.') }}</div>
      <div class="data-summary-label">Avg. Kalori (kCal/kg)</div>
    </div>
  </div>

  {{-- ── Filter + Search ── --}}
  <form method="GET" action="{{ route('data-batu-bara') }}" class="filter-bar mb-20">
    <span class="filter-bar__label">Filter</span>

    <input type="date" name="date_from" class="filter-input" value="{{ $dateFrom }}" aria-label="Tanggal mulai" />
    <input type="date" name="date_to" class="filter-input" value="{{ $dateTo }}" aria-label="Tanggal akhir" />

    <select name="unit_id" class="filter-select" aria-label="Unit PLTU">
      <option value="">Semua Unit</option>
      @foreach($units as $u)
        <option value="{{ $u->id }}" {{ $unitId == $u->id ? 'selected' : '' }}>{{ $u->name }}</option>
      @endforeach
    </select>

    <select name="status" class="filter-select" aria-label="Status Kualitas">
      <option value="">Semua Status</option>
      <option value="on_spec" {{ $status === 'on_spec' ? 'selected' : '' }}>On Spec</option>
      <option value="perhatian" {{ $status === 'perhatian' ? 'selected' : '' }}>Perhatian</option>
      <option value="off_spec" {{ $status === 'off_spec' ? 'selected' : '' }}>Off Spec</option>
    </select>

    <button type="submit" class="btn btn-primary btn--sm">
      Filter
    </button>
    <a href="{{ route('data-batu-bara') }}" class="btn btn-outline btn--sm" id="js-filter-reset">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="1 4 1 10 7 10"/>
        <path d="M3.51 15a9 9 0 1 0 .49-3.6"/>
      </svg>
      Reset
    </a>
  </form>

  {{-- ── Data Table ── --}}
  <div class="card card--no-hover">
    <div class="card__header">
      <div class="card__meta">
        <div class="card__title">Data Kualitas Batu Bara</div>
        <div class="card__subtitle">
          Menampilkan <span id="js-row-count">{{ $records->count() }}</span> dari {{ number_format($records->total(), 0, ',', '.') }} data
        </div>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="table table--data">
        <thead>
          <tr>
            <th class="sortable" data-sort="">Tanggal Terima</th>
            <th class="sortable" data-sort="">Supplier</th>
            <th>No. Pengiriman</th>
            <th class="sortable" data-sort="">Kalori (kCal/kg)</th>
            <th class="sortable" data-sort="">Moisture (%)</th>
            <th class="sortable" data-sort="">Ash (%)</th>
            <th>Sulfur (%)</th>
            <th>Total Moisture (%)</th>
            <th class="sortable" data-sort="">Volume (ton)</th>
            <th>Lab Report</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          @forelse($records as $row)
          @php
            $spec = \App\Http\Controllers\CoalDataController::specStatus($row->gar);
          @endphp
          <tr>
            <td>{{ \Carbon\Carbon::parse($row->date)->format('d M Y') }}</td>
            <td style="font-weight:600;color:var(--text-heading);">{{ $row->unit_name }}</td>
            <td>
              <code style="font-size:11px;background:var(--surface-2);padding:2px 6px;border-radius:4px;border:1px solid var(--border);">
                LAB-{{ str_pad($row->id, 4, '0', STR_PAD_LEFT) }}
              </code>
            </td>
            <td>
              <strong class="text-{{ $spec['class'] === 'on' ? 'success' : ($spec['class'] === 'pending' ? 'warning' : 'danger') }}">
                {{ number_format($row->gar, 0, ',', '.') }}
              </strong>
            </td>
            <td>{{ number_format($row->moisture, 2, ',', '.') }}</td>
            <td>{{ number_format($row->ash, 2, ',', '.') }}</td>
            <td>{{ number_format($row->sulfur, 3, ',', '.') }}</td>
            <td>{{ number_format($row->hgi, 2, ',', '.') }}</td>
            <td style="font-weight:600;">-</td>
            <td>
              <span style="font-size:12px;color:var(--primary);font-weight:600;cursor:pointer;text-decoration:underline;">
                PDF
              </span>
            </td>
            <td>
              <span class="spec-badge spec-badge--{{ $spec['class'] }}">{{ $spec['label'] }}</span>
            </td>
          </tr>
          @empty
          <tr>
            <td colspan="11" style="text-align: center; color: var(--text-caption);">Data tidak ditemukan untuk filter tersebut.</td>
          </tr>
          @endforelse
        </tbody>
      </table>
    </div>

    {{-- Pagination --}}
    <div class="pagination">
      <span class="pagination__info">Menampilkan {{ $records->firstItem() ?? 0 }}–{{ $records->lastItem() ?? 0 }} dari {{ $records->total() }} data</span>
      {{ $records->links('vendor.pagination.custom') }}
    </div>
  </div>

@endsection

@section('page-js')
  <script src="{{ asset('js/data.js') }}"></script>
@endsection
