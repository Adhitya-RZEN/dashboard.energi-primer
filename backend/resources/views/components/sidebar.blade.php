{{-- ============================================================
    Component: Sidebar
    PT PLN Indonesia Power UBP Jeranjang
============================================================ --}}

<aside
  class="sidebar"
  id="js-sidebar"
  role="navigation"
  aria-label="Menu navigasi"
>

  {{-- ── Menu Utama ── --}}
  <span class="sidebar__section-label">Menu Utama</span>

  <ul class="sidebar__menu" role="menubar">

    {{-- Dashboard --}}
    <li role="none">
      <a
        class="sidebar__link {{ request()->is('/') ? 'active' : '' }}"
        href="{{ url('/') }}"
        role="menuitem"
        aria-current="{{ request()->is('/') ? 'page' : 'false' }}"
        data-href="/"
      >
        <svg class="sidebar__icon" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
        <span class="sidebar__label">Dashboard</span>
      </a>
    </li>

    {{-- Monitoring --}}
    <li role="none">
      <a
        class="sidebar__link {{ request()->is('monitoring') ? 'active' : '' }}"
        href="{{ url('/monitoring') }}"
        role="menuitem"
        aria-current="{{ request()->is('monitoring') ? 'page' : 'false' }}"
        data-href="/monitoring"
      >
        <svg class="sidebar__icon" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <span class="sidebar__label">Monitoring</span>
      </a>
    </li>

    {{-- Data Batu Bara
    <li role="none">
      <a
        class="sidebar__link {{ request()->is('data-batu-bara') ? 'active' : '' }}"
        href="{{ url('/data-batu-bara') }}"
        role="menuitem"
        aria-current="{{ request()->is('data-batu-bara') ? 'page' : 'false' }}"
        data-href="/data-batu-bara"
      >
        <svg class="sidebar__icon" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
        <span class="sidebar__label">Data Batu Bara</span>
      </a>
    </li> --}}

    {{-- Laporan
    <li role="none">
      <a
        class="sidebar__link {{ request()->is('laporan') ? 'active' : '' }}"
        href="{{ url('/laporan') }}"
        role="menuitem"
        aria-current="{{ request()->is('laporan') ? 'page' : 'false' }}"
        data-href="/laporan"
      >
        <svg class="sidebar__icon" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span class="sidebar__label">Laporan</span>
      </a>
    </li> --}}

  </ul>

  <div class="sidebar__sep" role="separator"></div>

  {{-- ── Sistem ── --}}
  <span class="sidebar__section-label">Sistem</span>

  <ul class="sidebar__menu" role="menubar">

    {{-- Pengaturan --}}
    <li role="none">
      <a
        class="sidebar__link {{ request()->is('pengaturan') ? 'active' : '' }}"
        href="{{ url('/pengaturan') }}"
        role="menuitem"
        aria-current="{{ request()->is('pengaturan') ? 'page' : 'false' }}"
        data-href="/pengaturan"
      >
        <svg class="sidebar__icon" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span class="sidebar__label">Pengaturan</span>
      </a>
    </li>

    {{-- Logout --}}
    <li role="none">
      <a
        class="sidebar__link"
        href="#"
        role="menuitem"
        onclick="return false;"
        aria-label="Keluar dari sistem"
      >
        <svg class="sidebar__icon" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span class="sidebar__label">Keluar</span>
      </a>
    </li>

  </ul>

  {{-- Sidebar footer --}}
  <div class="sidebar__footer">
    <div class="sidebar__version">Dashboard v1.0 &middot; Phase 1</div>
  </div>

</aside>
