<?php

namespace App\Http\Controllers;

class PengaturanController extends Controller
{
    public function index()
    {
        $user = request()->user();

        return view('pengaturan.index', compact('user'));
    }
}
