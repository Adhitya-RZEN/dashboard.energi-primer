@extends('layouts.auth')

@section('title', 'Lupa Password')

@section('content')
  <div class="auth-brand">
    <img src="{{ asset('images/Logo_PLN.svg') }}" alt="Logo PLN" class="auth-brand__logo" />
    <div>
      <div class="auth-brand__name">PLN Indonesia Power</div>
      <div class="auth-brand__sub">UBP Jeranjang</div>
    </div>
  </div>

  <section class="auth-card" aria-labelledby="forgot-title">
    <div class="auth-card__intro">
      <p class="auth-eyebrow">Pemulihan akun</p>
      <h1 id="forgot-title">Lupa Password?</h1>
      <p>Masukkan email admin. Jika terdaftar, kami akan mengirimkan instruksi reset password.</p>
    </div>

    @if (session('status'))
      <div class="auth-alert auth-alert--success" role="status">{{ session('status') }}</div>
    @endif

    @if ($errors->any())
      <div class="auth-alert auth-alert--error" role="alert">{{ $errors->first() }}</div>
    @endif

    <form method="POST" action="{{ route('password.email') }}" class="auth-form">
      @csrf
      <div class="auth-field">
        <label for="email">Email Admin</label>
        <input id="email" name="email" type="email" value="{{ old('email') }}" autocomplete="email" required autofocus />
        @error('email') <span class="auth-field__error">{{ $message }}</span> @enderror
      </div>
      <button type="submit" class="auth-button">Kirim Instruksi Reset</button>
    </form>

    <div class="auth-card__footer">
      <a href="{{ route('login') }}">Kembali ke login</a>
    </div>
  </section>
@endsection
