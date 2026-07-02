{{-- ============================================================
    Component: Navbar
    PT PLN Indonesia Power UBP Jeranjang
============================================================ --}}

<nav class="navbar" role="banner" aria-label="Navigasi utama">

  {{-- Hamburger Button (Mobile/Tablet) --}}
  <button
    class="btn-hamburger"
    id="js-hamburger"
    aria-label="Buka / tutup menu sidebar"
    aria-expanded="false"
    aria-controls="js-sidebar"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.2"
         stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true">
      <line x1="3" y1="6"  x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  </button>

  {{-- Logo & Brand --}}
  <a class="navbar__logo" href="{{ url('/') }}" aria-label="Dashboard Monitoring Batu Bara">
    <div class="navbar__logo-icon" aria-hidden="true">
      {{-- PLN Lightning bolt --}}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
           stroke="#ffffff" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    </div>
    <div class="navbar__brand">
      <span class="navbar__brand-name">PLN Indonesia Power</span>
      <span class="navbar__brand-sub">UBP Jeranjang</span>
    </div>
  </a>

  {{-- Divider --}}
  <div class="navbar__divider" aria-hidden="true"></div>

  {{-- Dynamic page title --}}
  <span class="navbar__page-title" id="js-page-title">
    Monitoring Efisiensi Batu Bara
  </span>

  {{-- Actions --}}
  <div class="navbar__actions">

    {{-- Notification --}}
    <button class="btn-icon" aria-label="Notifikasi (1 baru)" title="Notifikasi">
      <span class="notif-badge" aria-hidden="true"></span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round"
           aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </button>

    {{-- Settings shortcut --}}
    <a href="{{ url('/pengaturan') }}" class="btn-icon" aria-label="Pengaturan" title="Pengaturan">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round"
           aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </a>

    {{-- User --}}
    <div class="navbar__user" role="button" aria-label="Menu pengguna" tabindex="0">
      <div class="navbar__avatar" aria-hidden="true">EP</div>
      <div class="navbar__user-info">
        <div class="navbar__user-name">Energi Primer</div>
        <div class="navbar__user-role">Operator</div>
      </div>
    </div>

  </div>
</nav>
