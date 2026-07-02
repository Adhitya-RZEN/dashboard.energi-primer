{{-- ============================================================
    Component: Status Bar
    Usage: @include('components.status-bar')
============================================================ --}}

<div class="status-bar" role="status" aria-label="Status sistem">

  <div class="status-indicator">
    <span class="status-dot status-dot--online" aria-hidden="true"></span>
    Sistem Online
  </div>

  <div class="status-indicator">
    <span class="status-dot status-dot--info" aria-hidden="true"></span>
    Sumber Data: Google Sheets API
  </div>

  <div class="status-indicator">
    <span class="status-dot status-dot--warning" aria-hidden="true"></span>
    Sinkronisasi otomatis belum aktif
  </div>

  <div class="status-bar__time" id="js-clock" aria-live="polite">
    —
  </div>

</div>
