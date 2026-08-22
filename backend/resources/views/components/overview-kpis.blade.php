@php
  $overviewKpis = [
    ['title' => 'Penerimaan Biomassa', 'subtitle' => 'Bulanan &middot; ' . $monthLabel, 'value' => number_format($biomassa['penerimaan_bulanan'], 0, ',', '.'), 'unit' => 'ton', 'label' => 'Total Penerimaan', 'icon' => 'eco', 'iconBg' => '#F0FDF4'],
    ['title' => 'Pemakaian Biomassa', 'subtitle' => 'Bulanan &middot; ' . $monthLabel, 'value' => number_format($biomassa['pemakaian_bulanan'], 0, ',', '.'), 'unit' => 'ton', 'label' => 'Total Pemakaian', 'icon' => 'monitoring', 'iconBg' => '#F0FDF4'],
    ['title' => 'Pemakaian Batubara', 'subtitle' => 'Bulanan (via Biomassa) &middot; AB42', 'value' => number_format($biomassa['total_pemakaian_batubara_bulanan'], 0, ',', '.'), 'unit' => 'ton', 'label' => 'Total Pemakaian &middot; ' . $monthLabel, 'icon' => 'deployed_code', 'iconBg' => '#EFF6FF'],
    ['title' => 'Penerimaan Batubara', 'subtitle' => 'Bulanan &middot; ' . $monthLabel, 'value' => number_format($batubara['penerimaan_bulanan'], 0, ',', '.'), 'unit' => 'ton', 'label' => 'Total Penerimaan', 'icon' => 'inventory_2', 'iconBg' => '#EFF6FF'],
    ['title' => 'Total Pemakaian Harian', 'subtitle' => 'Semua Unit &middot; ' . ($data['today_date'] ?? date('d F Y')), 'value' => number_format($batubara['pemakaian_harian'], 0, ',', '.'), 'unit' => 'ton', 'label' => 'Total Pemakaian Batubara', 'icon' => 'bolt', 'iconBg' => '#FEF3C7'],
    ['title' => 'Stock Batubara', 'subtitle' => 'Coal Yard &middot; ' . ($data['today_date'] ?? date('d F Y')), 'value' => number_format($stock['stock_batubara'], 0, ',', '.'), 'unit' => 'ton', 'label' => 'Maksimum 70.000 ton', 'icon' => 'warehouse', 'iconBg' => '#FEF2F2'],
    ['title' => 'Pemakaian Solar Harian', 'subtitle' => ($data['today_date'] ?? date('d F Y')), 'value' => number_format($solar['pemakaian_harian'], 0, ',', '.'), 'unit' => 'liter', 'label' => 'Pemakaian hari ini', 'icon' => 'wb_sunny', 'iconBg' => '#FFFBEB'],
    ['title' => 'Total Pemakaian Solar', 'subtitle' => 'Bulanan &middot; ' . $monthLabel, 'value' => number_format($solar['pemakaian_bulanan'], 0, ',', '.'), 'unit' => 'liter', 'label' => 'Total Pemakaian', 'icon' => 'water_drop', 'iconBg' => '#FFFBEB'],
    ['title' => 'Penerimaan Solar', 'subtitle' => 'Bulanan &middot; ' . $monthLabel, 'value' => number_format($solar['penerimaan_bulanan'], 0, ',', '.'), 'unit' => 'liter', 'label' => 'Total Penerimaan', 'icon' => 'vertical_align_top', 'iconBg' => '#FFFBEB'],
    ['title' => 'Target Biomassa', 'subtitle' => 'Tahun ' . $filterYear, 'value' => number_format($targetBiomassa['target'], 0, ',', '.'), 'unit' => 'ton', 'label' => 'Target tahunan', 'icon' => 'track_changes', 'iconBg' => '#F5F3FF'],
    ['title' => 'Realisasi Kumulatif', 'subtitle' => 'Kolom CO &middot; Baris 59', 'value' => number_format($targetBiomassa['realisasi_kumulatif'], 0, ',', '.'), 'unit' => 'ton', 'label' => 'Sisa: ' . number_format($targetBiomassa['sisa'], 0, ',', '.') . ' ton', 'icon' => 'trending_up', 'iconBg' => '#F5F3FF'],
    ['title' => 'Progres Target', 'subtitle' => '(Realisasi Kumulatif / Target) &times; 100', 'value' => number_format($targetBiomassa['progress'], 1, ',', '.'), 'unit' => '%', 'label' => 'Pencapaian target', 'icon' => 'bar_chart', 'iconBg' => '#F5F3FF'],
  ];
@endphp

<div class="overview-kpi-grid animate-fade-in" aria-label="15 KPI dashboard">
  @foreach($overviewKpis as $index => $kpi)
    <x-kpi-card :title="$kpi['title']" :subtitle="$kpi['subtitle']" :value="$kpi['value']" :unit="$kpi['unit']" :label="$kpi['label']" :iconBg="$kpi['iconBg']" :delay="($index % 4) + 1">
      <x-slot name="icon"><span class="material-symbols-outlined overview-kpi-icon">{{ $kpi['icon'] }}</span></x-slot>
    </x-kpi-card>
  @endforeach

  <x-kpi-card title="Pemakaian Biomassa Harian" subtitle="Per Unit &middot; {{ $data['today_date'] ?? date('d F Y') }}" iconBg="#F0FDF4" delay="3" customContent="true">
    <x-slot name="icon"><span class="material-symbols-outlined overview-kpi-icon">dashboard</span></x-slot>
    <div class="overview-kpi-list">
      @foreach([['Unit 1', $biomassa['unit1_harian']], ['Unit 2', $biomassa['unit2_harian']], ['Unit 3', $biomassa['unit3_harian']]] as $unit)
        <div><span>{{ $unit[0] }}</span><strong>{{ number_format($unit[1], 0, ',', '.') }} <small>ton</small></strong></div>
      @endforeach
    </div>
  </x-kpi-card>

  <x-kpi-card title="Pemakaian Batubara Harian" subtitle="Per Unit &middot; {{ $data['today_date'] ?? date('d F Y') }}" iconBg="#EFF6FF" delay="2" customContent="true">
    <x-slot name="icon"><span class="material-symbols-outlined overview-kpi-icon">grid_view</span></x-slot>
    <div class="overview-kpi-list">
      @foreach([['Unit 1', $batubara['unit1_harian']], ['Unit 2', $batubara['unit2_harian']], ['Unit 3', $batubara['unit3_harian']]] as $unit)
        <div><span>{{ $unit[0] }}</span><strong>{{ number_format($unit[1], 0, ',', '.') }} <small>ton</small></strong></div>
      @endforeach
    </div>
  </x-kpi-card>

  <x-kpi-card title="HOP (Hari Operasi)" subtitle="Per unit &middot; {{ $data['today_date'] ?? date('d F Y') }}" iconBg="#FEF2F2" delay="3" customContent="true">
    <x-slot name="icon"><span class="material-symbols-outlined overview-kpi-icon">schedule</span></x-slot>
    <div class="overview-kpi-list">
      @foreach([['HOP 3 Unit', $stock['hop_3unit']], ['HOP 2 Unit', $stock['hop_2unit']], ['HOP 1 Unit', $stock['hop_1unit']]] as $hop)
        <div><span>{{ $hop[0] }}</span><strong>{{ number_format($hop[1], 1, ',', '.') }} <small>hari</small></strong></div>
      @endforeach
    </div>
  </x-kpi-card>
</div>
