{{-- ============================================================
    Pengaturan — index.blade.php
    PT PLN Indonesia Power UBP Jeranjang
============================================================ --}}

@extends('layouts.app')

@section('title', 'Pengaturan')

@section('page-css')
  <link rel="stylesheet" href="{{ asset('css/pengaturan.css') }}" />
@endsection

@section('content')

  {{-- Breadcrumb --}}
  @include('components.breadcrumb', [
    'items' => [
      ['label' => 'Dashboard', 'url' => '/'],
      ['label' => 'Pengaturan', 'active' => true],
    ]
  ])

  {{-- Page Header --}}
  <header class="page-header">
    <p class="page-header__eyebrow">PT PLN Indonesia Power &middot; UBP Jeranjang</p>
    <h1 class="page-header__title">Pengaturan Sistem</h1>
    <p class="page-header__desc">
      Kelola profil pengguna, konfigurasi sistem, dan preferensi notifikasi.
    </p>
  </header>

  {{-- Settings Layout --}}
  <div class="settings-layout">

    {{-- ── Settings Nav ── --}}
    <nav class="settings-nav" aria-label="Menu pengaturan">
      <button class="settings-nav__item" data-panel="profil">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        Profil Pengguna
      </button>
      <button class="settings-nav__item" data-panel="sistem">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Sistem
      </button>
      <button class="settings-nav__item" data-panel="notifikasi">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        Notifikasi
      </button>
      <button class="settings-nav__item" data-panel="keamanan">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        Keamanan
      </button>
    </nav>

    {{-- ── Settings Panels ── --}}
    <div>

      {{-- Panel: Profil --}}
      <div class="settings-panel" data-panel-id="profil">

        {{-- Avatar section --}}
        <div class="profile-avatar-section">
          <div class="profile-avatar-large">EP</div>
          <div class="profile-avatar-info">
            <div class="profile-avatar-name">Energi Primer</div>
            <div class="profile-avatar-role">Operator · Tim Energi Primer</div>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <button class="btn btn-outline btn--sm" disabled>Ganti Foto</button>
              <button class="btn btn-ghost btn--sm" disabled>Hapus Foto</button>
            </div>
          </div>
        </div>

        <div class="card card--no-hover">
          <div class="settings-section-title">Informasi Pribadi</div>

          <div class="form-grid-2 mb-16">
            <div class="form-group">
              <label class="form-label form-label--required" for="set-nama">Nama Lengkap</label>
              <input type="text" class="form-control" id="set-nama" value="Energi Primer" />
            </div>
            <div class="form-group">
              <label class="form-label" for="set-nip">NIP</label>
              <input type="text" class="form-control" id="set-nip" value="EP-2024-001" />
            </div>
            <div class="form-group">
              <label class="form-label form-label--required" for="set-email">Email</label>
              <input type="email" class="form-control" id="set-email" value="energiprimer@pln.co.id" />
            </div>
            <div class="form-group">
              <label class="form-label" for="set-telepon">No. Telepon</label>
              <input type="tel" class="form-control" id="set-telepon" value="+62 812-3456-7890" />
            </div>
            <div class="form-group">
              <label class="form-label" for="set-jabatan">Jabatan</label>
              <input type="text" class="form-control" id="set-jabatan" value="Operator Energi Primer" />
            </div>
            <div class="form-group">
              <label class="form-label" for="set-divisi">Divisi</label>
              <select class="form-control" id="set-divisi">
                <option selected>Tim Energi Primer</option>
                <option>Operasi</option>
                <option>Pemeliharaan</option>
                <option>K3</option>
              </select>
            </div>
          </div>

          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button class="btn btn-secondary" disabled>Batalkan</button>
            <button class="btn btn-primary" id="js-save-profile">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              Simpan Perubahan
            </button>
          </div>
        </div>
      </div>

      {{-- Panel: Sistem --}}
      <div class="settings-panel" data-panel-id="sistem">
        <div class="card card--no-hover mb-20">
          <div class="settings-section-title">Kesehatan Sistem</div>
          <div class="system-health mb-16">
            <div class="health-item">
              <div class="health-value" style="color:var(--success);">99,8%</div>
              <div class="health-label">Uptime Server</div>
            </div>
            <div class="health-item">
              <div class="health-value">42ms</div>
              <div class="health-label">Avg. Response</div>
            </div>
            <div class="health-item">
              <div class="health-value" style="color:var(--warning);">68%</div>
              <div class="health-label">Penggunaan Disk</div>
            </div>
          </div>

          <div class="settings-section-title">Informasi Sistem</div>
          <div>
            <div class="info-row">
              <span class="info-key">Versi Aplikasi</span>
              <span class="info-value"><span class="tag tag--info">v1.0.0 — Phase 1</span></span>
            </div>
            <div class="info-row">
              <span class="info-key">Environment</span>
              <span class="info-value"><span class="tag tag--success">Production</span></span>
            </div>
            <div class="info-row">
              <span class="info-key">Framework</span>
              <span class="info-value">Laravel 12.x</span>
            </div>
            <div class="info-row">
              <span class="info-key">PHP Version</span>
              <span class="info-value">8.3.x</span>
            </div>
            <div class="info-row">
              <span class="info-key">Database</span>
              <span class="info-value">PostgreSQL 16</span>
            </div>
            <div class="info-row">
              <span class="info-key">Sumber Data</span>
              <span class="info-value">Google Sheets API</span>
            </div>
            <div class="info-row">
              <span class="info-key">Timezone</span>
              <span class="info-value">Asia/Makassar (WITA)</span>
            </div>
            <div class="info-row">
              <span class="info-key">Terakhir Deploy</span>
              <span class="info-value">02 Juli 2026, 08:00 WITA</span>
            </div>
          </div>
        </div>

        <div class="card card--no-hover">
          <div class="settings-section-title">Konfigurasi Sinkronisasi</div>
          <div class="alert alert--warning" style="margin-bottom:0;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <strong>Sinkronisasi otomatis belum dikonfigurasi.</strong>
              Fitur sinkronisasi otomatis dengan Google Sheets API akan tersedia pada Phase 3.
            </div>
          </div>
        </div>
      </div>

      {{-- Panel: Notifikasi --}}
      <div class="settings-panel" data-panel-id="notifikasi">
        <div class="card card--no-hover">
          <div class="settings-section-title">Preferensi Notifikasi</div>

          <div class="toggle-wrap">
            <div class="toggle-info">
              <div class="toggle-title">Notifikasi Heat Rate Melebihi Batas</div>
              <div class="toggle-desc">Kirim notifikasi jika heat rate unit melampaui 2.700 kCal/kWh</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" checked />
              <span class="toggle-track"></span>
            </label>
          </div>

          <div class="toggle-wrap">
            <div class="toggle-info">
              <div class="toggle-title">Notifikasi Efisiensi di Bawah Target</div>
              <div class="toggle-desc">Alert jika efisiensi boiler di bawah 85%</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" checked />
              <span class="toggle-track"></span>
            </label>
          </div>

          <div class="toggle-wrap">
            <div class="toggle-info">
              <div class="toggle-title">Notifikasi Stock Batu Bara Rendah</div>
              <div class="toggle-desc">Alert jika stock batu bara di bawah 7.000 ton</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" checked />
              <span class="toggle-track"></span>
            </label>
          </div>

          {{-- <div class="toggle-wrap">
            <div class="toggle-info">
              <div class="toggle-title">Laporan Harian Otomatis</div>
              <div class="toggle-desc">Kirim ringkasan harian via email setiap pukul 06:00 WITA</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" />
              <span class="toggle-track"></span>
            </label>
          </div> --}}

          <div class="toggle-wrap">
            <div class="toggle-info">
              <div class="toggle-title">Notifikasi Kualitas Off Spec</div>
              <div class="toggle-desc">Alert jika kualitas batu bara tidak sesuai spesifikasi</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" checked />
              <span class="toggle-track"></span>
            </label>
          </div>

          <div class="toggle-wrap">
            <div class="toggle-info">
              <div class="toggle-title">Notifikasi Sinkronisasi Data</div>
              <div class="toggle-desc">Alert jika sinkronisasi data dari Google Sheets gagal</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" />
              <span class="toggle-track"></span>
            </label>
          </div>

          <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px;">
            <button class="btn btn-secondary" disabled>Reset ke Default</button>
            <button class="btn btn-primary" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
              </svg>
              Simpan Preferensi
            </button>
          </div>
        </div>
      </div>

      {{-- Panel: Keamanan --}}
      <div class="settings-panel" data-panel-id="keamanan">
        <div class="card card--no-hover mb-20">
          <div class="settings-section-title">Ubah Password</div>

          <div style="display:flex;flex-direction:column;gap:14px;max-width:400px;">
            <div class="form-group">
              <label class="form-label form-label--required" for="set-pw-old">Password Saat Ini</label>
              <input type="password" class="form-control" id="set-pw-old" placeholder="••••••••" />
            </div>
            <div class="form-group">
              <label class="form-label form-label--required" for="set-pw-new">Password Baru</label>
              <input type="password" class="form-control" id="set-pw-new" placeholder="Min. 8 karakter" />
            </div>
            <div class="form-group">
              <label class="form-label form-label--required" for="set-pw-confirm">Konfirmasi Password Baru</label>
              <input type="password" class="form-control" id="set-pw-confirm" placeholder="Ulangi password baru" />
            </div>
            <div>
              <button class="btn btn-primary" disabled>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Ubah Password
              </button>
            </div>
          </div>
        </div>

        <div class="card card--no-hover">
          <div class="settings-section-title">Sesi Aktif</div>
          <div class="info-row">
            <span class="info-key">Browser</span>
            <span class="info-value">Chrome 126 · Windows 11</span>
          </div>
          <div class="info-row">
            <span class="info-key">IP Address</span>
            <span class="info-value">192.168.1.45</span>
          </div>
          <div class="info-row">
            <span class="info-key">Login Terakhir</span>
            <span class="info-value">02 Jul 2026, 20:00 WITA</span>
          </div>
          <div style="margin-top:16px;">
            <button class="btn btn-danger btn--sm" disabled>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Keluar Semua Sesi
            </button>
          </div>
        </div>
      </div>

    </div>{{-- /.settings panels --}}
  </div>{{-- /.settings-layout --}}

@endsection

@section('page-js')
  <script src="{{ asset('js/pengaturan.js') }}"></script>
@endsection
