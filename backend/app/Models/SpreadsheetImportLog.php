<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SpreadsheetImportLog extends Model
{
    protected $table = 'spreadsheet_import_logs';

    protected $fillable = [
        'source',
        'imported_rows',
        'status',
        'message',
        'imported_at',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'imported_rows' => 'integer',
            'imported_at' => 'datetime',
        ];
    }
}
