@extends('layouts.auth')

@section('title', 'Reset Password')

@section('content')
  <div class="auth-brand">
    <img src="{{ asset('images/Logo_PLN.svg') }}" alt="Logo PLN" class="auth-brand__logo" />
    <div>
      <div class="auth-brand__name">PLN Indonesia Power</div>
      <div class="auth-brand__sub">UBP Jeranjang</div>
    </div>
  </div>

  <section class="auth-card" aria-labelledby="reset-title">
    <div class="auth-card__intro">
      <p class="auth-eyebrow">Keamanan akun</p>
      <h1 id="reset-title">Buat Password Baru</h1>
      <p>Gunakan password minimal 12 karakter yang belum pernah digunakan sebelumnya.</p>
    </div>

    @if ($errors->any())
      <div class="auth-alert auth-alert--error" role="alert">{{ $errors->first() }}</div>
    @endif

    <form method="POST" action="{{ route('password.store') }}" class="auth-form">
      @csrf
      <input type="hidden" name="token" value="{{ $token }}" />

      <div class="auth-field">
        <label for="email">Email Admin</label>
        <input id="email" name="email" type="email" value="{{ old('email', $email) }}" autocomplete="email" required autofocus />
        @error('email') <span class="auth-field__error">{{ $message }}</span> @enderror
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

      <button type="submit" class="auth-button">Simpan Password Baru</button>
    </form>
  </section>
@endsection
