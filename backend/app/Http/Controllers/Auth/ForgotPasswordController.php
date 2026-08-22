<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\View\View;

class ForgotPasswordController extends Controller
{
    public function create(): View
    {
        return view('auth.forgot-password');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $email = Str::lower(trim($validated['email']));
        $user = User::query()
            ->whereRaw('LOWER(email) = ?', [$email])
            ->where('role', 'admin')
            ->first();

        if ($user !== null) {
            Password::sendResetLink(['email' => $user->email]);
        }

        // Keep the response identical for known and unknown addresses.
        return back()->with('status', 'Jika email tersebut terdaftar sebagai akun admin, instruksi reset password telah dikirim.');
    }
}
