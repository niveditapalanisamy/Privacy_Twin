param([switch]$Build)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
$webRoot = Join-Path $projectRoot 'web'
$runtimeRoot = Join-Path $projectRoot 'data\runtime'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Python environment missing. Follow the setup steps in README.md.' }
if (-not (Test-Path -LiteralPath (Join-Path $webRoot 'node_modules'))) { throw 'Frontend dependencies missing. Run npm ci in web first.' }
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
if ($Build -or -not (Test-Path -LiteralPath (Join-Path $webRoot '.next\BUILD_ID'))) {
    Push-Location $webRoot
    try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' } }
    finally { Pop-Location }
}
$health = $null
try { $health = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 2 } catch {}
if ($health -and $health.version -ne '2.0.0') { throw 'Port 8000 is serving an older or different app. Stop it before starting PrivacyTwin.' }
if (-not $health) {
    $backend = Start-Process -FilePath $pythonPath -ArgumentList '-m','uvicorn','main:app','--host','127.0.0.1','--port','8000' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'backend.log') -RedirectStandardError (Join-Path $runtimeRoot 'backend.error.log') -PassThru
    @{ id = $backend.Id; started = $backend.StartTime.Ticks; name = $backend.ProcessName } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeRoot 'backend.process.json')
}
$frontend = $null
try { $frontend = Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 2 } catch {}
if ($frontend -and $frontend.version -ne '2.0.0') { throw 'Port 3000 is serving a different app.' }
if (-not $frontend) {
    $nodePath = (Get-Command node.exe).Source
    $nextPath = Join-Path $webRoot 'node_modules\next\dist\bin\next'
    $frontendProcess = Start-Process -FilePath $nodePath -ArgumentList ('"' + $nextPath + '"'),'start','--hostname','127.0.0.1','--port','3000' -WorkingDirectory $webRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'frontend.log') -RedirectStandardError (Join-Path $runtimeRoot 'frontend.error.log') -PassThru
    @{ id = $frontendProcess.Id; started = $frontendProcess.StartTime.Ticks; name = $frontendProcess.ProcessName } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeRoot 'frontend.process.json')
}
Write-Output 'PrivacyTwin: http://127.0.0.1:3000'
Write-Output "Logs: $runtimeRoot"
