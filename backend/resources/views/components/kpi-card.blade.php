@props([
    'title',
    'subtitle',
    'value' => null,
    'unit' => '',
    'label' => '',
    'iconBg' => '#F3F4F6',
    'delay' => 1,
    'customContent' => false
])

<div class="card animate-delay-{{ $delay }}">
  <div class="card__header">
    <div class="card__meta">
      <div class="card__title">{{ $title }}</div>
      <div class="card__subtitle">{!! $subtitle !!}</div>
    </div>
    @if(isset($icon))
      <div class="card__icon" style="background:{{ $iconBg }};">
        {{ $icon }}
      </div>
    @endif
  </div>
  
  @if($customContent)
    {{ $slot }}
  @else
    <div class="kpi-value">
      <span>{{ $value }}</span>
      @if($unit)
        <span class="kpi-unit">{{ $unit }}</span>
      @endif
    </div>
    @if($label)
      <div class="kpi-label">{!! $label !!}</div>
    @endif
    @if(isset($extra))
      {{ $extra }}
    @endif
  @endif
</div>
