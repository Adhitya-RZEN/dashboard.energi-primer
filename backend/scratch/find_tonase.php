<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$ds = app(\App\DataSources\GoogleSheetsDataSource::class);

$reflection = new ReflectionClass($ds);
$prop = $reflection->getProperty('service');
$prop->setAccessible(true);
$service = $prop->getValue($ds);

$propId = $reflection->getProperty('spreadsheetId');
$propId->setAccessible(true);
$id = $propId->getValue($ds);

try {
    $response = $service->spreadsheets_values->get($id, "'Juli26-BB'!A1:DZ200");
    $rows = $response->getValues() ?? [];
    echo "Mencari 'TONASE BIOMASSA'...\n";
    foreach ($rows as $rIndex => $row) {
        foreach ($row as $cIndex => $val) {
            if (stripos((string)$val, 'TONASE BIOMASSA') !== false || stripos((string)$val, 'TOTAL 2026') !== false) {
                echo "Found '{$val}' at Row " . ($rIndex + 1) . ", Col " . ($cIndex + 1) . "\n";
            }
        }
    }
} catch (\Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
