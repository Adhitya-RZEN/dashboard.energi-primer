<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Admin Dashboard PLN Indonesia Power UBP Jeranjang" />
  <title>@yield('title', 'Autentikasi') — PLN UBP Jeranjang</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="{{ asset('css/app.css') }}" />
  <link rel="stylesheet" href="{{ asset('css/theme.css') }}" />
  <link rel="stylesheet" href="{{ asset('css/auth.css') }}" />
</head>
<body class="auth-page">
  <main class="auth-shell">
    @yield('content')
  </main>
</body>
</html>
