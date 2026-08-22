<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class AdminUserSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Create or reconcile the one configured initial administrator.
     *
     * Credentials are read from the environment through config/auth.php.
     * Existing passwords are intentionally not overwritten on repeat runs.
     */
    public function run(): void
    {
        $name = trim((string) config('auth.initial_admin.name'));
        $email = trim((string) config('auth.initial_admin.email'));
        $password = (string) config('auth.initial_admin.password');

        if ($name === '') {
            throw new RuntimeException('ADMIN_NAME must be configured before seeding the initial admin.');
        }

        if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw new RuntimeException('ADMIN_EMAIL must contain a valid email address before seeding the initial admin.');
        }

        if ($password === '') {
            throw new RuntimeException('ADMIN_PASSWORD must be configured before seeding the initial admin.');
        }

        if (mb_strlen($password) < 12) {
            throw new RuntimeException('ADMIN_PASSWORD must be at least 12 characters long.');
        }

        DB::transaction(function () use ($name, $email, $password): void {
            $admin = User::query()->where('email', $email)->first();

            if ($admin === null) {
                $admin = new User([
                    'email' => $email,
                    'password' => Hash::make($password),
                ]);
            }

            $admin->name = $name;
            $admin->role = 'admin';
            $admin->save();

            // Keep future user records intact while ensuring this deployment
            // has exactly one account with the admin role.
            User::query()
                ->where('role', 'admin')
                ->whereKeyNot($admin->getKey())
                ->update(['role' => 'operator']);
        });
    }
}
