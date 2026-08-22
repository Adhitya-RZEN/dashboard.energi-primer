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

    {{-- Overview --}}
    <li role="none">
      <a class="sidebar__link {{ request()->routeIs('dashboard.overview') ? 'active' : '' }}" href="{{ route('dashboard.overview') }}" role="menuitem" aria-current="{{ request()->routeIs('dashboard.overview') ? 'page' : 'false' }}">
        <svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
        <span class="sidebar__label">Overview</span>
      </a>
    </li>

    {{-- Biomassa --}}
    <li role="none">
      <a class="sidebar__link {{ request()->routeIs('dashboard.biomassa') ? 'active' : '' }}" href="{{ route('dashboard.biomassa') }}" role="menuitem" aria-current="{{ request()->routeIs('dashboard.biomassa') ? 'page' : 'false' }}">
        <svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 2a9 9 0 0 1 9 9c0 4.97-9 13-9 13S3 15.97 3 11a9 9 0 0 1 9-9z"/><circle cx="12" cy="11" r="3"/>
        </svg>
        <span class="sidebar__label">Biomassa</span>
      </a>
    </li>

    {{-- Batubara --}}
    <li role="none">
      <a class="sidebar__link {{ request()->routeIs('dashboard.batubara') ? 'active' : '' }}" href="{{ route('dashboard.batubara') }}" role="menuitem" aria-current="{{ request()->routeIs('dashboard.batubara') ? 'page' : 'false' }}">
        <svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
        </svg>
        <span class="sidebar__label">Batubara</span>
      </a>
    </li>

    {{-- Solar --}}
    <li role="none">
      <a class="sidebar__link {{ request()->routeIs('dashboard.solar') ? 'active' : '' }}" href="{{ route('dashboard.solar') }}" role="menuitem" aria-current="{{ request()->routeIs('dashboard.solar') ? 'page' : 'false' }}">
        <svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
        <span class="sidebar__label">Solar</span>
      </a>
    </li>

    {{-- Stok Batubara --}}
    <li role="none">
      <a class="sidebar__link {{ request()->routeIs('dashboard.stok') ? 'active' : '' }}" href="{{ route('dashboard.stok') }}" role="menuitem" aria-current="{{ request()->routeIs('dashboard.stok') ? 'page' : 'false' }}">
        <svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
        <span class="sidebar__label">Stok Batubara</span>
      </a>
    </li>

    {{-- Target & Kinerja --}}
    <li role="none">
      <a class="sidebar__link {{ request()->routeIs('dashboard.target') ? 'active' : '' }}" href="{{ route('dashboard.target') }}" role="menuitem" aria-current="{{ request()->routeIs('dashboard.target') ? 'page' : 'false' }}">
        <svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
        </svg>
        <span class="sidebar__label">Target & Kinerja</span>
      </a>
    </li>

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
      <form method="POST" action="{{ route('logout') }}">
        @csrf
        <button type="submit" class="sidebar__link sidebar__link--button" role="menuitem" aria-label="Keluar dari sistem">
        <svg class="sidebar__icon" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span class="sidebar__label">Keluar</span>
        </button>
      </form>
    </li>

  </ul>

  {{-- Sidebar footer --}}
  <div class="sidebar__footer">
    <div class="sidebar__version">Dashboard v1.0 &middot; Admin</div>
  </div>

</aside>
