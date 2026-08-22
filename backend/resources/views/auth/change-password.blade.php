@extends('layouts.auth')

@section('title', 'Ubah Password')

@section('content')
  <div class="auth-brand">
    <img src="{{ asset('images/Logo_PLN.svg') }}" alt="Logo PLN" class="auth-brand__logo" />
    <div>
      <div class="auth-brand__name">PLN Indonesia Power</div>
      <div class="auth-brand__sub">UBP Jeranjang</div>
    </div>
  </div>

  <section class="auth-card" aria-labelledby="change-title">
    <div class="auth-card__intro">
      <p class="auth-eyebrow">Pengaturan akun</p>
      <h1 id="change-title">Ubah Password</h1>
      <p>Masukkan password saat ini, lalu pilih password baru minimal 12 karakter.</p>
    </div>

    @if ($errors->any())
      <div class="auth-alert auth-alert--error" role="alert">{{ $errors->first() }}</div>
    @endif

    <form method="POST" action="{{ route('password.update') }}" class="auth-form">
      @csrf
      <div class="auth-field">
        <label for="current_password">Password Saat Ini</label>
        <input id="current_password" name="current_password" type="password" autocomplete="current-password" required autofocus />
        @error('current_password') <span class="auth-field__error">{{ $message }}</span> @enderror
      </div>

      <div class="auth-field">
        <label for="password">Password Baru</label>
        <input id="password" name="password" type="password" autocomplete="new-password" minlength="12" required />
        @error('password') <span class="auth-field__error">{{ $message }}</span> @enderror
      </div>

      <div class="auth-field">
        <label for="password_confirmation">Konfirmasi Password Baru</label>
        <input id="password_confirmation" name="password_confirmation" type="password" autocomplete="new-password" minlength="12" required />
      </div>

      <button type="submit" class="auth-button">Ubah Password</button>
    </form>

    <div class="auth-card__footer">
      <a href="{{ route('pengaturan') }}">Kembali ke pengaturan</a>
    </div>
  </section>
@endsection
