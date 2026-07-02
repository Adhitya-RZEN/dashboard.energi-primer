<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

class PengaturanController extends Controller
{
    public function index()
    {
        // Untuk saat ini, kita ambil user pertama sebagai contoh pengaturan profil
        $user = User::first();
        
        return view('pengaturan.index', compact('user'));
    }
}
