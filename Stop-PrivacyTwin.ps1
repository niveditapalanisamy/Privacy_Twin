$ErrorActionPreference = 'Stop'
$runtimeRoot = Join-Path $PSScriptRoot 'data\runtime'
foreach ($component in @('frontend', 'backend')) {
    $pidFile = Join-Path $runtimeRoot "$component.process.json"
    if (Test-Path -LiteralPath $pidFile) {
        $saved = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
        $savedPid = [int]$saved.id
        $process = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -eq $saved.name -and $process.StartTime.Ticks -eq $saved.started) {
            & taskkill.exe /PID $savedPid /T /F | Out-Null
            Write-Output "Stopped $component ($savedPid)."
        }
        Remove-Item -LiteralPath $pidFile
    }
}
