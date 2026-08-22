<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuthSessionService;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\View\View;

class ResetPasswordController extends Controller
{
    public function create(Request $request, string $token): View
    {
        return view('auth.reset-password', [
            'token' => $token,
            'email' => $request->query('email', ''),
        ]);
    }

    public function store(Request $request, AuthSessionService $sessions): RedirectResponse
    {
        $credentials = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', PasswordRule::min(12)],
        ]);

        // Laravel's native broker is intentionally provider-agnostic. Keep
        // this broker flow admin-only so a stale or externally-created token
        // cannot reset a future non-admin account.
        if (! User::query()
            ->where('email', $credentials['email'])
            ->where('role', 'admin')
            ->exists()) {
            return back()
                ->withInput($request->only('email'))
                ->withErrors(['email' => 'Link reset password tidak valid atau sudah kedaluwarsa.']);
        }

        $status = Password::reset(
            $credentials,
            function (User $user, string $password) use ($sessions): void {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'remember_token' => Str::random(60),
                ])->save();

                $sessions->invalidateFor($user);
                event(new PasswordReset($user));
            },
        );

        if ($status === Password::PASSWORD_RESET) {
            return redirect()
                ->route('login')
                ->with('status', 'Password berhasil direset. Silakan login dengan password baru.');
        }

        return back()
            ->withInput($request->only('email'))
            ->withErrors(['email' => 'Link reset password tidak valid atau sudah kedaluwarsa.']);
    }
}
