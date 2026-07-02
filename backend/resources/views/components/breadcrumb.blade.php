{{-- ============================================================
    Component: Breadcrumb
    Usage: @include('components.breadcrumb', ['items' => [
        ['label' => 'Dashboard', 'url' => '/'],
        ['label' => 'Monitoring', 'active' => true],
    ]])
============================================================ --}}

@if(isset($items) && count($items))
<nav class="breadcrumb" aria-label="Breadcrumb">
  @foreach($items as $index => $item)
    @if(!$loop->first)
      <span class="breadcrumb__sep" aria-hidden="true">›</span>
    @endif

    @if($loop->last || isset($item['active']))
      <span class="breadcrumb__item is-active" aria-current="page">
        {{ $item['label'] }}
      </span>
    @else
      <span class="breadcrumb__item">
        <a href="{{ isset($item['url']) ? url($item['url']) : '#' }}">
          {{ $item['label'] }}
        </a>
      </span>
    @endif
  @endforeach
</nav>
@endif
