@php
  $targetProgress = min(100, max(0, (float) ($targetBiomassa['progress'] ?? 0)));
  $hopRows = [
    ['unit' => 'Unit 1', 'value' => $stock['hop_1unit'], 'status' => $stock['hop_status_1unit'], 'label' => $stock['hop_label_1unit']],
    ['unit' => 'Unit 2', 'value' => $stock['hop_2unit'], 'status' => $stock['hop_status_2unit'], 'label' => $stock['hop_label_2unit']],
    ['unit' => 'Unit 3', 'value' => $stock['hop_3unit'], 'status' => $stock['hop_status_3unit'], 'label' => $stock['hop_label_3unit']],
  ];
@endphp

<section class="overview-section overview-summary" aria-labelledby="summary-title">
  <div class="overview-section-heading">
    <div>
      <p class="overview-section-kicker">Ringkasan Eksekutif</p>
      <h2 id="summary-title">Executive Summary</h2>
      <p class="overview-section-description">Indikator utama energi primer pada periode terpilih.</p>
    </div>
  </div>

  <div class="overview-summary-grid">
    <div class="overview-kpi-card">
      <x-kpi-card title="Penerimaan Biomassa" subtitle="Bulanan &middot; {{ $monthLabel }}" value="{{ number_format($biomassa['penerimaan_bulanan'], 0, ',', '.') }}" unit="ton" label="Total penerimaan" iconBg="#ECFDF3" delay="1">
        <x-slot name="icon"><span class="material-symbols-outlined overview-kpi-icon overview-kpi-icon--success">eco</span></x-slot>
      </x-kpi-card>
    </div>
    <div class="overview-kpi-card">
      <x-kpi-card title="Pemakaian Biomassa" subtitle="Bulanan &middot; {{ $monthLabel }}" value="{{ number_format($biomassa['pemakaian_bulanan'], 0, ',', '.') }}" unit="ton" label="Total pemakaian" iconBg="#ECFDF3" delay="2">
        <x-slot name="icon"><span class="material-symbols-outlined overview-kpi-icon overview-kpi-icon--success">monitoring</span></x-slot>
      </x-kpi-card>
    </div>
    <div class="overview-kpi-card">
      <x-kpi-card title="Pemakaian Batubara" subtitle="Bulanan &middot; {{ $monthLabel }}" value="{{ number_format($biomassa['total_pemakaian_batubara_bulanan'], 0, ',', '.') }}" unit="ton" label="Total pemakaian" iconBg="#EFF6FF" delay="3">
        <x-slot name="icon"><span class="material-symbols-outlined overview-kpi-icon">deployed_code</span></x-slot>
      </x-kpi-card>
    </div>
    <div class="overview-kpi-card">
      <x-kpi-card title="Stock Batubara" subtitle="Harian &middot; {{ $data['today_date'] ?? date('d F Y') }}" value="{{ number_format($stock['stock_batubara'], 0, ',', '.') }}" unit="ton" label="Kapasitas maksimum 70.000 ton" iconBg="#FFF7ED" delay="4">
        <x-slot name="icon"><span class="material-symbols-outlined overview-kpi-icon overview-kpi-icon--warning">warehouse</span></x-slot>
      </x-kpi-card>
    </div>
    <div class="overview-kpi-card">
      <x-kpi-card title="Total Pemakaian Solar" subtitle="Bulanan &middot; {{ $monthLabel }}" value="{{ number_format($solar['pemakaian_bulanan'], 0, ',', '.') }}" unit="liter" label="Total pemakaian" iconBg="#FFFBEB" delay="1">
        <x-slot name="icon"><span class="material-symbols-outlined overview-kpi-icon overview-kpi-icon--warning">water_drop</span></x-slot>
      </x-kpi-card>
    </div>
    <div class="overview-kpi-card">
      <x-kpi-card title="Realisasi Biomassa Kumulatif" subtitle="s.d. {{ $monthLabel }}" value="{{ number_format($targetBiomassa['realisasi_kumulatif'], 0, ',', '.') }}" unit="ton" label="Target {{ number_format($targetBiomassa['target'], 0, ',', '.') }} ton" iconBg="#F5F3FF" delay="2">
        <x-slot name="icon"><span class="material-symbols-outlined overview-kpi-icon overview-kpi-icon--target">trending_up</span></x-slot>
      </x-kpi-card>
    </div>
    <div class="overview-kpi-card overview-kpi-card--progress">
      <x-kpi-card title="Progress Target Biomassa" subtitle="Realisasi / target tahunan" value="{{ number_format($targetBiomassa['progress'], 1, ',', '.') }}" unit="%" label="{{ number_format($targetBiomassa['realisasi_kumulatif'], 0, ',', '.') }} / {{ number_format($targetBiomassa['target'], 0, ',', '.') }} ton" iconBg="#F5F3FF" delay="3">
        <x-slot name="icon"><span class="material-symbols-outlined overview-kpi-icon overview-kpi-icon--target">track_changes</span></x-slot>
        <x-slot name="extra">
          <div class="overview-progress" aria-label="Progress target {{ number_format($targetBiomassa['progress'], 1, ',', '.') }} persen">
            <div class="overview-progress__track"><span style="width:{{ $targetProgress }}%"></span></div>
          </div>
        </x-slot>
      </x-kpi-card>
    </div>
  </div>
</section>

<section class="overview-section" aria-labelledby="consumption-title">
  <div class="overview-section-heading overview-section-heading--row">
    <div>
      <p class="overview-section-kicker">Tren Harian</p>
      <h2 id="consumption-title">Konsumsi Energi Primer</h2>
      <p class="overview-section-description">Batubara vs Biomassa &middot; {{ $monthLabel }}</p>
    </div>
    <a class="overview-section-action" href="{{ route('dashboard.batubara') }}">Lihat Detail <span aria-hidden="true">&rarr;</span></a>
  </div>
  <div class="overview-chart-card card card--no-hover">
    <div class="overview-chart-card__header">
      <div>
        <h3>Konsumsi Energi Primer Harian</h3>
        <p>Perbandingan pemakaian harian seluruh periode terpilih.</p>
      </div>
      <span class="overview-chart-card__unit">Satuan: ton</span>
    </div>
    <div class="chart-canvas overview-energy-chart"><canvas id="energyLineChart"></canvas></div>
  </div>
</section>

<section class="overview-section overview-split-grid" aria-label="Target dan status operasional">
  <div class="overview-panel" aria-labelledby="target-title">
    <div class="overview-section-heading overview-section-heading--row">
      <div>
        <p class="overview-section-kicker">Kinerja Tahunan</p>
        <h2 id="target-title">Target &amp; Realisasi</h2>
      </div>
      <a class="overview-section-action" href="{{ route('dashboard.target') }}">Lihat Detail <span aria-hidden="true">&rarr;</span></a>
    </div>
    <div class="overview-target-card card card--no-hover">
      <div class="overview-target-card__top">
        <div>
          <p class="overview-card-label">Target Biomassa Tahun {{ $filterYear }}</p>
          <div class="overview-target-progress">{{ number_format($targetBiomassa['progress'], 1, ',', '.') }}<span>%</span></div>
        </div>
        <div class="overview-target-badge">{{ number_format($targetProgress, 1, ',', '.') }}% tercapai</div>
      </div>
      <div class="overview-progress overview-progress--large">
        <div class="overview-progress__track"><span style="width:{{ $targetProgress }}%"></span></div>
      </div>
      <div class="overview-target-stats">
        <div><span>Target Tahunan</span><strong>{{ number_format($targetBiomassa['target'], 0, ',', '.') }} <small>ton</small></strong></div>
        <div><span>Realisasi Kumulatif</span><strong>{{ number_format($targetBiomassa['realisasi_kumulatif'], 0, ',', '.') }} <small>ton</small></strong></div>
        <div><span>Sisa Target</span><strong>{{ number_format($targetBiomassa['sisa'], 0, ',', '.') }} <small>ton</small></strong></div>
      </div>
      <canvas id="targetBarChart" class="overview-target-chart-legacy" aria-hidden="true"></canvas>
    </div>
  </div>

  <div class="overview-panel" aria-labelledby="hop-title">
    <div class="overview-section-heading overview-section-heading--row">
      <div>
        <p class="overview-section-kicker">Kesiapan Operasi</p>
        <h2 id="hop-title">Status Operasional (HOP)</h2>
      </div>
      <a class="overview-section-action" href="{{ route('dashboard.stok') }}">Lihat Detail <span aria-hidden="true">&rarr;</span></a>
    </div>
    <div class="overview-hop-card card card--no-hover">
      <div class="overview-table-head"><span>Unit</span><span>HOP</span><span>Status</span></div>
      @foreach($hopRows as $hop)
        <div class="overview-table-row">
          <strong>{{ $hop['unit'] }}</strong>
          <span class="overview-hop-value">{{ number_format($hop['value'], 1, ',', '.') }} <small>hari</small></span>
          <span class="overview-status overview-status--{{ $hop['status'] }}"><i></i>{{ $hop['label'] }}</span>
        </div>
      @endforeach
    </div>
  </div>
</section>

<section class="overview-section" aria-labelledby="detail-title">
  <div class="overview-section-heading overview-section-heading--row">
    <div>
      <p class="overview-section-kicker">Supporting Information</p>
      <h2 id="detail-title">Detail Operasional</h2>
      <p class="overview-section-description">Rincian pemakaian harian dan penerimaan bahan bakar.</p>
    </div>
  </div>
  <div class="overview-detail-grid">
    <div class="overview-detail-card card card--no-hover">
      <div class="overview-detail-card__header"><span class="overview-detail-icon overview-detail-icon--green"><span class="material-symbols-outlined">eco</span></span><div><h3>Pemakaian Biomassa Harian</h3><p>{{ $data['today_date'] ?? date('d F Y') }}</p></div></div>
      <div class="overview-detail-list">
        @foreach([['Unit 1', $biomassa['unit1_harian']], ['Unit 2', $biomassa['unit2_harian']], ['Unit 3', $biomassa['unit3_harian']]] as $unit)
          <div><span>{{ $unit[0] }}</span><strong>{{ number_format($unit[1], 0, ',', '.') }} <small>ton</small></strong></div>
        @endforeach
      </div>
      <a class="overview-detail-link" href="{{ route('dashboard.biomassa') }}">Lihat Detail <span aria-hidden="true">&rarr;</span></a>
    </div>

    <div class="overview-detail-card card card--no-hover">
      <div class="overview-detail-card__header"><span class="overview-detail-icon overview-detail-icon--blue"><span class="material-symbols-outlined">deployed_code</span></span><div><h3>Pemakaian Batubara Harian</h3><p>{{ $data['today_date'] ?? date('d F Y') }}</p></div></div>
      <div class="overview-detail-list">
        @foreach([['Unit 1', $batubara['unit1_harian']], ['Unit 2', $batubara['unit2_harian']], ['Unit 3', $batubara['unit3_harian']]] as $unit)
          <div><span>{{ $unit[0] }}</span><strong>{{ number_format($unit[1], 0, ',', '.') }} <small>ton</small></strong></div>
        @endforeach
      </div>
      <a class="overview-detail-link" href="{{ route('dashboard.batubara') }}">Lihat Detail <span aria-hidden="true">&rarr;</span></a>
    </div>

    <div class="overview-detail-card card card--no-hover">
      <div class="overview-detail-card__header"><span class="overview-detail-icon overview-detail-icon--amber"><span class="material-symbols-outlined">local_gas_station</span></span><div><h3>Pemakaian Solar Harian</h3><p>{{ $data['today_date'] ?? date('d F Y') }}</p></div></div>
      <div class="overview-detail-primary">{{ number_format($solar['pemakaian_harian'], 0, ',', '.') }} <small>liter</small></div>
      <div class="overview-detail-secondary">Penerimaan bulanan <strong>{{ number_format($solar['penerimaan_bulanan'], 0, ',', '.') }} liter</strong></div>
      <a class="overview-detail-link" href="{{ route('dashboard.solar') }}">Lihat Detail <span aria-hidden="true">&rarr;</span></a>
    </div>

    <div class="overview-detail-card card card--no-hover">
      <div class="overview-detail-card__header"><span class="overview-detail-icon overview-detail-icon--gray"><span class="material-symbols-outlined">inventory_2</span></span><div><h3>Penerimaan Batubara</h3><p>Bulanan &middot; {{ $monthLabel }}</p></div></div>
      <div class="overview-detail-primary">{{ number_format($batubara['penerimaan_bulanan'], 0, ',', '.') }} <small>ton</small></div>
      <div class="overview-detail-secondary">Total penerimaan pada periode terpilih</div>
      <a class="overview-detail-link" href="{{ route('dashboard.batubara') }}">Lihat Detail <span aria-hidden="true">&rarr;</span></a>
    </div>
  </div>
</section>
