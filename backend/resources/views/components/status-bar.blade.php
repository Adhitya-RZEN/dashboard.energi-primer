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
  <div class="status-bar__time" id="js-clock" aria-live="polite">&mdash;</div>
  @if(isset($data['meta']['fetched_at']))
    <div class="status-bar__updated">
      <span class="material-symbols-outlined" aria-hidden="true">update</span>
      Last update: {{ \Carbon\Carbon::parse($data['meta']['fetched_at'])->locale('id')->isoFormat('D MMM YYYY, HH:mm') }} WITA
    </div>
  @endif
</div>
