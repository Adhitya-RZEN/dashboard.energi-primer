<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\AdminUserSeeder;
use Illuminate\Auth\Notifications\ResetPassword as ResetPasswordNotification;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use RuntimeException;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use DatabaseTransactions;

    protected User $admin;

    /**
     * The local PHP build does not include pdo_sqlite, so use the already
     * migrated PostgreSQL test target for transaction-scoped feature checks.
     */
    public function createApplication()
    {
        $app = parent::createApplication();

        if (! extension_loaded('pdo_sqlite')) {
            $app['config']->set('database.default', 'pgsql');

            if ($testDatabase = getenv('DB_TEST_DATABASE')) {
                $app['config']->set('database.connections.pgsql.database', $testDatabase);
            }
        }

        return $app;
    }

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::query()->create([
            'name' => 'Test Admin',
            'email' => 'auth-test-admin@example.com',
            'password' => Hash::make('current-password-123'),
            'role' => 'admin',
        ]);
    }

    public function test_guests_are_redirected_to_login_and_auth_pages_are_public(): void
    {
        $this->get('/dashboard')->assertRedirect(route('login'));
        $this->get('/pengaturan')->assertRedirect(route('login'));
        $this->get('/login')->assertOk();
        $this->get('/forgot-password')->assertOk();
    }

    public function test_only_admin_credentials_can_login(): void
    {
        $this->post(route('login.store'), [
            'email' => $this->admin->email,
            'password' => 'wrong-password',
        ])->assertSessionHasErrors('email');

        $this->post(route('login.store'), [
            'email' => $this->admin->email,
            'password' => 'current-password-123',
        ])->assertRedirect(route('dashboard.overview'));

        $this->assertAuthenticatedAs($this->admin);
        $this->assertNotNull($this->admin->fresh()->last_login_at);
    }

    public function test_logout_invalidates_authentication(): void
    {
        $this->actingAs($this->admin);

        $this->post(route('logout'))
            ->assertRedirect(route('login'));

        $this->assertGuest();
        $this->get('/dashboard')->assertRedirect(route('login'));
    }

    public function test_forgot_password_uses_generic_response_for_an_admin(): void
    {
        Notification::fake();

        $this->from(route('password.request'))
            ->post(route('password.email'), ['email' => $this->admin->email])
            ->assertSessionHas('status');

        Notification::assertSentTo($this->admin, ResetPasswordNotification::class);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $this->admin->email]);
    }

    public function test_password_reset_is_one_time_and_hashes_the_new_password(): void
    {
        $token = Password::broker()->createToken($this->admin);

        $this->post(route('password.store'), [
            'token' => $token,
            'email' => $this->admin->email,
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ])->assertRedirect(route('login'));

        $this->assertTrue(Hash::check('new-password-123', $this->admin->fresh()->password));

        $this->from(route('password.reset', ['token' => 'invalid']))
            ->post(route('password.store'), [
                'token' => $token,
                'email' => $this->admin->email,
                'password' => 'another-password-123',
                'password_confirmation' => 'another-password-123',
            ])->assertSessionHasErrors('email');
    }

    public function test_expired_reset_token_is_rejected(): void
    {
        $token = Password::broker()->createToken($this->admin);

        DB::table('password_reset_tokens')
            ->where('email', $this->admin->email)
            ->update(['created_at' => now()->subMinutes(61)]);

        $this->from(route('password.reset', ['token' => $token]))
            ->post(route('password.store'), [
                'token' => $token,
                'email' => $this->admin->email,
                'password' => 'new-password-123',
                'password_confirmation' => 'new-password-123',
            ])->assertSessionHasErrors('email');
    }

    public function test_change_password_requires_current_password_and_reauthentication(): void
    {
        $this->actingAs($this->admin);

        $this->post(route('password.update'), [
            'current_password' => 'current-password-123',
            'password' => 'new-password-123',
            'password_confirmation' => 'different-password-123',
        ])->assertSessionHasErrors('password');

        $this->post(route('password.update'), [
            'current_password' => 'wrong-password',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ])->assertSessionHasErrors('current_password');

        $this->post(route('password.update'), [
            'current_password' => 'current-password-123',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ])->assertRedirect(route('login'));

        $this->assertGuest();
        $this->assertTrue(Hash::check('new-password-123', $this->admin->fresh()->password));
    }

    public function test_admin_seeder_is_idempotent_and_hashes_the_configured_password(): void
    {
        config([
            'auth.initial_admin.name' => 'Seeded Admin',
            'auth.initial_admin.email' => 'seeder-test-admin@example.com',
            'auth.initial_admin.password' => 'seeded-password-123',
        ]);

        (new AdminUserSeeder)->run();
        (new AdminUserSeeder)->run();

        $seeded = User::query()->where('email', 'seeder-test-admin@example.com')->get();

        $this->assertCount(1, $seeded);
        $this->assertSame('admin', $seeded->first()->role);
        $this->assertTrue(Hash::check('seeded-password-123', $seeded->first()->password));
        $this->assertSame(1, User::query()->where('role', 'admin')->count());
    }

    public function test_admin_seeder_fails_safely_when_credentials_are_missing(): void
    {
        config([
            'auth.initial_admin.name' => '',
            'auth.initial_admin.email' => '',
            'auth.initial_admin.password' => '',
        ]);

        $this->expectException(RuntimeException::class);
        (new AdminUserSeeder)->run();
    }

    public function test_authenticated_admin_can_reach_existing_settings_page(): void
    {
        $this->actingAs($this->admin);

        $this->get('/pengaturan')->assertOk();
    }

    public function test_authenticated_non_admin_cannot_reach_dashboard(): void
    {
        $operator = User::query()->create([
            'name' => 'Test Operator',
            'email' => 'auth-test-operator@example.com',
            'password' => Hash::make('operator-password-123'),
            'role' => 'operator',
        ]);

        $this->actingAs($operator)
            ->get('/dashboard')
            ->assertForbidden();
    }
}
