# Registers a Windows scheduled task to trigger Treasury Agent every 10 minutes.
# Requires GITHUB_PAT in .env (classic PAT with repo scope).
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts/install-treasury-scheduler.ps1

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $repoRoot '.env'
$taskName = 'SpherePredict-TreasuryTrigger'
$intervalMin = 10

if (-not (Test-Path $envFile)) {
  Write-Error "Missing .env — add GITHUB_PAT=ghp_... (repo scope) first"
}

$pat = $null
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*GITHUB_PAT\s*=\s*(.+)\s*$') { $pat = $matches[1].Trim().Trim('"').Trim("'") }
}
if (-not $pat) {
  Write-Error "Add GITHUB_PAT to .env — GitHub → Settings → Developer settings → PAT (classic) → repo"
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Error 'node not found in PATH' }

$action = New-ScheduledTaskAction `
  -Execute $node `
  -Argument "scripts/trigger-treasury-dispatch.mjs" `
  -WorkingDirectory $repoRoot

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $intervalMin) -RepetitionDuration ([TimeSpan]::MaxValue)

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

$envBlock = "`$env:GITHUB_PAT='$pat'"
$wrapper = Join-Path $repoRoot 'scripts/treasury-trigger-task.ps1'
@(
  $envBlock
  "Set-Location '$repoRoot'"
  "& '$node' scripts/trigger-treasury-dispatch.mjs"
) | Set-Content -Path $wrapper -Encoding UTF8

$action2 = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -File `"$wrapper`"" -WorkingDirectory $repoRoot
Register-ScheduledTask -TaskName $taskName -Action $action2 -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host "Registered '$taskName' — treasury dispatch every $intervalMin minutes"
Write-Host "Test now: npm run treasury:trigger"