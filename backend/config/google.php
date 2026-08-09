<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Google Sheets API Configuration
    | PT PLN Indonesia Power UBP Jeranjang
    |--------------------------------------------------------------------------
    */

    'sheets' => [

        /*
        | Path absolut ke file Service Account JSON dari Google Cloud Console.
        | Pastikan file ini sudah ditempatkan di lokasi yang aman (di luar public/).
        */
        'credentials_path' => env('GOOGLE_SHEETS_CREDENTIALS_PATH', storage_path('app/google/service-account.json')),

        /*
        | ID Spreadsheet Google yang berisi data operasional.
        | Ambil dari URL spreadsheet:
        |   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
        */
        'spreadsheet_id' => env('GOOGLE_SHEETS_SPREADSHEET_ID', ''),

        /*
        | TTL cache dalam detik (60–300 detik sesuai arsitektur).
        | Default 120 detik (2 menit).
        */
        'cache_ttl' => (int) env('GOOGLE_SHEETS_CACHE_TTL', 120),

        /*
        | Range data yang diambil dalam satu request.
        | B11:CO59 mencakup seluruh KPI harian (row 11-41), total bulanan (row 42),
        | dan Realisasi Kumulatif biomassa (row 59, kolom CO).
        */
        'data_range' => 'B11:CO59',

        /*
        | Kolom B (index 0 dalam range B11:CJ42) berisi tanggal 1-31.
        */
        'date_column_index' => 0,

    ],

];
