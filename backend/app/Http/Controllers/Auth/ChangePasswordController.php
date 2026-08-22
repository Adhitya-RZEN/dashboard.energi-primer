<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\AuthSessionService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\View\View;

class ChangePasswordController extends Controller
{
    public function edit(): View
    {
        return view('auth.change-password');
    }

    public function update(Request $request, AuthSessionService $sessions): RedirectResponse
    {
        $validator = Validator::make($request->all(), [
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', PasswordRule::min(12)],
        ]);

        $validator->after(function ($validator) use ($request): void {
            if (! Hash::check((string) $request->input('current_password'), (string) $request->user()->password)) {
                $validator->errors()->add('current_password', 'Password saat ini tidak cocok.');
            }
        });

        if ($validator->fails()) {
            return redirect()
                ->route('password.edit')
                ->withErrors($validator)
                ->withInput();
        }

        $user = $request->user();
        $user->forceFill([
            'password' => Hash::make($validator->validated()['password']),
        ])->save();

        // Force re-authentication after a password change and remove all
        // database-backed sessions associated with the account.
        $sessions->invalidateFor($user);
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()
            ->route('login')
            ->with('status', 'Password berhasil diubah. Silakan login kembali.');
    }
}
