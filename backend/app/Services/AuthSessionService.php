<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AuthSessionService
{
    /**
     * Remove every database-backed session for a user.
     */
    public function invalidateFor(User $user): void
    {
        if (config('session.driver') !== 'database') {
            return;
        }

        $table = (string) config('session.table', 'sessions');

        if ($table === '' || ! Schema::hasTable($table)) {
            return;
        }

        DB::table($table)
            ->where('user_id', $user->getAuthIdentifier())
            ->delete();
    }
}
