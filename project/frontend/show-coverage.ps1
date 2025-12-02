# Run tests (ignore exit code)
npm run test

# Extract and display coverage summary from JSON file
$jsonPath = ".\frontend\coverage-final.json"
if (Test-Path $jsonPath) {
    Write-Host "`n==========================================" -ForegroundColor Cyan
    Write-Host "           COVERAGE SUMMARY" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    
    $json = Get-Content $jsonPath | ConvertFrom-Json
    $totals = @{
        statements = @{covered = 0; total = 0}
        branches = @{covered = 0; total = 0}
        functions = @{covered = 0; total = 0}
        lines = @{covered = 0; total = 0}
    }
    
    foreach ($file in $json.PSObject.Properties.Value) {
        $totals.statements.covered += $file.statements.covered
        $totals.statements.total += $file.statements.total
        $totals.branches.covered += $file.branches.covered
        $totals.branches.total += $file.branches.total
        $totals.functions.covered += $file.functions.covered
        $totals.functions.total += $file.functions.total
        $totals.lines.covered += $file.lines.covered
        $totals.lines.total += $file.lines.total
    }
    
    foreach ($key in $totals.Keys) {
        $covered = $totals[$key].covered
        $total = $totals[$key].total
        if ($total -gt 0) {
            $pct = [math]::Round(($covered / $total) * 100, 2)
            $color = if ($pct -ge 80) { "Green" } elseif ($pct -ge 50) { "Yellow" } else { "Red" }
            Write-Host ("{0,-12}: {1,6}% ({2}/{3})" -f $key, $pct, $covered, $total) -ForegroundColor $color
        }
    }
    Write-Host "==========================================" -ForegroundColor Cyan
} else {
    Write-Host "Coverage file not found at $jsonPath" -ForegroundColor Red
}
