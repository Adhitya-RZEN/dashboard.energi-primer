@extends('layouts.app')

@section('title', 'Pengaturan Profil')

@section('page-css')
  <link rel="stylesheet" href="{{ asset('css/pengaturan.css') }}" />
@endsection

@section('content')
  @include('components.breadcrumb', [
    'items' => [
      ['label' => 'Dashboard', 'url' => '/'],
      ['label' => 'Pengaturan', 'active' => true],
    ]
  ])

  <header class="page-header">
    <p class="page-header__eyebrow">Energi Primer</p>
    <h1 class="page-header__title">Pengaturan Profil</h1>
    <p class="page-header__desc">Kelola informasi akun dan password Anda.</p>
  </header>

  <section class="settings-profile-card card card--no-hover" aria-labelledby="profile-title">
    <div class="settings-section-title" id="profile-title">Profil Akun</div>

    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="set-nama">Nama Akun</label>
        <input type="text" class="form-control" id="set-nama" value="{{ $user->name }}" readonly />
      </div>
      <div class="form-group">
        <label class="form-label" for="set-email">Email</label>
        <input type="email" class="form-control" id="set-email" value="{{ $user->email }}" readonly />
      </div>
    </div>

    <div class="settings-profile-actions">
      <a class="btn btn-primary" href="{{ route('password.edit') }}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        Lupa Password
      </a>
    </div>
  </section>
@endsection
