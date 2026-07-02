<?php

namespace App\Http\Controllers;

use App\Models\CoalQuality;
use App\Models\Unit;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class CoalDataController extends Controller
{
    /**
     * Ambang batas kualitas batu bara (GAR)
     * On Spec  : >= 4700 kCal/kg
     * Perhatian: 4500 - 4699 kCal/kg
     * Off Spec : < 4500 kCal/kg
     */
    private const SPEC_ON       = 4700;
    private const SPEC_PERHATIAN = 4500;

    public function index(Request $request)
    {
        $units      = Unit::orderBy('name')->get();
        $latestDate = CoalQuality::max('date');
        $refDate    = Carbon::parse($latestDate);

        // ── Filter params ─────────────────────────────────────────────────
        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');
        $unitId   = $request->get('unit_id');
        $status   = $request->get('status'); // on_spec | perhatian | off_spec

        // ── Summary stats ─────────────────────────────────────────────────
        $totalEntri  = CoalQuality::count();
        $onSpec      = CoalQuality::where('gar', '>=', self::SPEC_ON)->count();
        $perhatian   = CoalQuality::where('gar', '>=', self::SPEC_PERHATIAN)
                                  ->where('gar', '<', self::SPEC_ON)->count();
        $offSpec     = CoalQuality::where('gar', '<', self::SPEC_PERHATIAN)->count();
        $avgGar      = round((float) CoalQuality::avg('gar'), 0);

        // ── Query utama ───────────────────────────────────────────────────
        $query = DB::table('coal_quality as cq')
            ->join('units as u', 'u.id', '=', 'cq.unit_id')
            ->select([
                'cq.id', 'cq.date', 'u.name as unit_name',
                'cq.gar', 'cq.moisture', 'cq.ash', 'cq.sulfur', 'cq.hgi',
            ]);

        if ($dateFrom) {
            $query->where('cq.date', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->where('cq.date', '<=', $dateTo);
        }
        if ($unitId) {
            $query->where('cq.unit_id', $unitId);
        }
        if ($status === 'on_spec') {
            $query->where('cq.gar', '>=', self::SPEC_ON);
        } elseif ($status === 'perhatian') {
            $query->where('cq.gar', '>=', self::SPEC_PERHATIAN)
                  ->where('cq.gar', '<', self::SPEC_ON);
        } elseif ($status === 'off_spec') {
            $query->where('cq.gar', '<', self::SPEC_PERHATIAN);
        }

        $records = $query
            ->orderBy('cq.date', 'desc')
            ->orderBy('u.name')
            ->paginate(15)
            ->withQueryString();

        return view('data.index', compact(
            'units', 'latestDate', 'refDate',
            'dateFrom', 'dateTo', 'unitId', 'status',
            'totalEntri', 'onSpec', 'perhatian', 'offSpec', 'avgGar',
            'records'
        ));
    }

    /**
     * Helper: tentukan status dari nilai GAR (digunakan di view via blade).
     * Cukup gunakan logika ini langsung di blade dengan @php.
     */
    public static function specStatus(float $gar): array
    {
        if ($gar >= self::SPEC_ON) {
            return ['label' => 'On Spec', 'class' => 'on'];
        }
        if ($gar >= self::SPEC_PERHATIAN) {
            return ['label' => 'Perhatian', 'class' => 'pending'];
        }
        return ['label' => 'Off Spec', 'class' => 'off'];
    }
}
