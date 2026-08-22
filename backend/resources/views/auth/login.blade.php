@extends('layouts.auth')

@section('title', 'Login Admin')

@section('content')
  <div class="auth-brand">
    <img src="{{ asset('images/Logo_PLN.svg') }}" alt="Logo PLN" class="auth-brand__logo" />
    <div>
      <div class="auth-brand__name">PLN Indonesia Power</div>
      <div class="auth-brand__sub">UBP Jeranjang</div>
    </div>
  </div>

  <section class="auth-card" aria-labelledby="login-title">
    <div class="auth-card__intro">
      <p class="auth-eyebrow">Akses terbatas</p>
      <h1 id="login-title">Login Admin</h1>
      <p>Masuk untuk mengakses Dashboard Monitoring Efisiensi Batu Bara.</p>
    </div>

    @if (session('status'))
      <div class="auth-alert auth-alert--success" role="status">{{ session('status') }}</div>
    @endif

    @if ($errors->any())
      <div class="auth-alert auth-alert--error" role="alert">
        {{ $errors->first() }}
      </div>
    @endif

    <form method="POST" action="{{ route('login.store') }}" class="auth-form">
      @csrf

      <div class="auth-field">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" value="{{ old('email') }}" autocomplete="email" required autofocus />
        @error('email') <span class="auth-field__error">{{ $message }}</span> @enderror
      </div>

      <div class="auth-field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
        @error('password') <span class="auth-field__error">{{ $message }}</span> @enderror
      </div>

      <button type="submit" class="auth-button">Masuk ke Dashboard</button>
    </form>

    <div class="auth-card__footer">
      <a href="{{ route('password.request') }}">Lupa password?</a>
    </div>
  </section>

  <p class="auth-note">Akun admin digunakan bersama oleh tim yang berwenang.</p>
@endsection
